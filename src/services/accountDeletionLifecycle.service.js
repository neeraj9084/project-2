import mongoose from "mongoose";
import crypto from "crypto";
import { User } from "../models/user.model.js";
import { MediaCleanupRecord } from "../models/mediaCleanupRecord.model.js";
import { AuditLog } from "../models/auditLog.model.js";
import { CloudinaryAssetReference } from "../models/cloudinaryAssetReference.model.js";
import { AssetModerationHold } from "../models/assetModerationHold.model.js";
import { cleanupAccount } from "./cleanupAccount.service.js";
import { assertIsolatedMediaTest } from "./testMediaCoverageApproval.service.js";
import { runSyntheticCleanupBatch } from "./mediaCleanupWorker.service.js";

const validStates = new Set(["requested", "database_cleanup", "media_review", "media_cleanup", "blocked", "failed", "completed"]);

// Retention decisions are reported separately, but cannot authorize completion
// until an independent policy and evidence verification protocol exists.
const assessDeletionLifecycle = ({ databaseCleanupStatus, jobs = [] } = {}) => {
    const counts = { pending: 0, review: 0, unresolved: 0, failed: 0, completed: 0, retainedShared: 0, retainedModeration: 0 };
    for (const job of jobs) {
        if (job.retentionDecision === "retain_shared") counts.retainedShared++;
        if (job.retentionDecision === "retain_moderation") counts.retainedModeration++;
        if (job.status === "completed") counts.completed++;
        else if (job.status === "unresolved") counts.unresolved++;
        else if (job.status === "failed") counts.failed++;
        else if (job.status === "review_required") counts.review++;
        else counts.pending++;
    }
    const state = databaseCleanupStatus !== "complete" ? "requested" :
        counts.failed ? "failed" : counts.unresolved ? "blocked" : counts.review || counts.retainedShared || counts.retainedModeration ? "media_review" :
        counts.pending ? "media_cleanup" : "blocked";
    return { state, counts, canComplete: false, blockedReason: "permanent_deletion_disabled" };
};

// Any future orchestration must use the existing coordinator; this gate does
// not call it, even if a caller injects a replacement.
const runAccountDeletionLifecycle = async ({ userId, databaseCleanup = cleanupAccount } = {}) => {
    if (!mongoose.isValidObjectId(userId)) throw new Error("Invalid user ID");
    void databaseCleanup;
    return { state: "blocked", executionEnabled: false };
};

// Explicit internal status refresh; transactionally lock the same user record
// used by cleanupAccount. No transition can mark permanent completion.
const refreshAccountDeletionLifecycle = async (userId, { session } = {}) => {
    if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required");
    if (!mongoose.isValidObjectId(userId)) throw new Error("Invalid user ID");
    const user = await User.findOneAndUpdate({ _id: userId, isActive: false, deletionRequestedAt: { $ne: null } },
        { $inc: { "deletionLifecycle.version": 1 } }, { session, returnDocument: "after" }).select("databaseCleanupStatus +deletionLifecycle").lean();
    if (!user) throw new Error("Deletion-pending account not found");
    const jobs = await MediaCleanupRecord.find({ user: userId }).select("status retentionDecision").session(session).lean();
    const assessment = assessDeletionLifecycle({ databaseCleanupStatus: user.databaseCleanupStatus, jobs });
    if (!validStates.has(assessment.state) || assessment.state === "completed") throw new Error("Invalid lifecycle transition");
    await User.updateOne({ _id: userId, "deletionLifecycle.version": user.deletionLifecycle.version },
        { $set: { "deletionLifecycle.state": assessment.state, "deletionLifecycle.updatedAt": new Date() } }, { session });
    return assessment;
};

const transaction = async (fn) => {
    const session = await mongoose.startSession();
    try { return await session.withTransaction(() => fn(session)); }
    finally { await session.endSession(); }
};

// Explicitly invoked only for harness-owned synthetic users. A durable token
// and lease serialize callers; expired claims may be retried after a crash.
const runIsolatedAccountDeletion = async ({ userId, ownerToken, adapter, approvalId, leaseMs = 120000, maxRetries = 3 } = {}) => {
    if (!mongoose.isValidObjectId(userId) || !Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 3600000 ||
        !Number.isSafeInteger(maxRetries) || maxRetries < 1 || maxRetries > 10) throw new Error("Invalid isolated lifecycle options");
    const token = crypto.randomUUID(); const now = new Date();
    const claimed = await transaction(async (session) => {
        await assertIsolatedMediaTest({ session, ownerToken });
        const user = await User.findOneAndUpdate({ _id: userId, testLifecycleFixture: true, isActive: false,
            deletionRequestedAt: { $ne: null }, "deletionLifecycle.state": { $ne: "completed" },
            $and: [{ $or: [{ "deletionLifecycle.claimToken": null }, { "deletionLifecycle.claimExpiresAt": { $lte: now } }] },
                { $or: [{ "deletionLifecycle.nextRetryAt": null }, { "deletionLifecycle.nextRetryAt": { $lte: now } }] },
                { $or: [{ "deletionLifecycle.retryCount": { $lt: maxRetries } }, { "deletionLifecycle.retryCount": null }] }] },
            { $set: { "deletionLifecycle.claimToken": token, "deletionLifecycle.claimExpiresAt": new Date(now.getTime() + leaseMs),
                "deletionLifecycle.state": "database_cleanup", "deletionLifecycle.testOnly": true, "deletionLifecycle.updatedAt": now },
                $inc: { "deletionLifecycle.version": 1 } }, { returnDocument: "after", session }).select("_id").lean();
        if (!user) return false;
        await AuditLog.create([{ actor: userId, action: "test_account_cleanup_claimed", resourceType: "user", resourceId: userId,
            description: "Isolated test lifecycle claimed" }], { session });
        return true;
    });
    if (!claimed) return { state: "blocked", reason: "unavailable_or_claimed", testOnly: true, permanentDeletionComplete: false };

    try {
        await cleanupAccount(userId);
        // Only the account's sole synthetic job may be sent to the mock worker.
        if (adapter && approvalId) {
            const jobs = await MediaCleanupRecord.find({ status: "pending" }).select("user cloudName publicId").lean();
            if (jobs.length === 1 && String(jobs[0].user) === String(userId) && jobs[0].cloudName === "isolated-test.invalid" && jobs[0].publicId?.startsWith("synthetic/")) {
                await runSyntheticCleanupBatch({ ownerToken, approvalId, adapter, limit: 1 });
            }
        }
        return await transaction(async (session) => {
            await assertIsolatedMediaTest({ session, ownerToken });
            const current = await User.findOne({ _id: userId, testLifecycleFixture: true, "deletionLifecycle.claimToken": token,
                "deletionLifecycle.claimExpiresAt": { $gt: new Date() } }).select("databaseCleanupStatus +deletionLifecycle").session(session).lean();
            if (!current) throw new Error("Lifecycle claim is stale");
            const jobs = await MediaCleanupRecord.find({ user: userId }).select("status retentionDecision").session(session).lean();
            const assessment = assessDeletionLifecycle({ databaseCleanupStatus: current.databaseCleanupStatus, jobs });
            const remainingReferences = await CloudinaryAssetReference.countDocuments({ user: userId }, { session });
            const moderationHolds = await AssetModerationHold.countDocuments({ actor: userId, status: { $ne: "released" } }, { session });
            // Simulated completion means database work plus every recorded job
            // succeeded. Retentions require independent review and stay blocked.
            const simulatedComplete = current.databaseCleanupStatus === "complete" && !remainingReferences && !moderationHolds &&
                jobs.every((job) => job.status === "completed" && !job.retentionDecision);
            const state = simulatedComplete ? "completed" : (remainingReferences || moderationHolds) && assessment.state === "blocked" ? "media_review" : assessment.state;
            const updated = await User.updateOne({ _id: userId, "deletionLifecycle.claimToken": token,
                "deletionLifecycle.claimExpiresAt": { $gt: new Date() } }, { $set: { "deletionLifecycle.state": state,
                    "deletionLifecycle.updatedAt": new Date(), "deletionLifecycle.testOnly": true,
                    "deletionLifecycle.retryCount": 0, "deletionLifecycle.lastError": null, "deletionLifecycle.nextRetryAt": null },
                $unset: { "deletionLifecycle.claimToken": 1, "deletionLifecycle.claimExpiresAt": 1 },
                $inc: { "deletionLifecycle.version": 1 } }, { session });
            if (updated.modifiedCount !== 1) throw new Error("Lifecycle claim is stale");
            await AuditLog.create([{ actor: userId, action: "test_account_cleanup_assessed", resourceType: "user", resourceId: userId,
                description: `Isolated lifecycle state: ${state}` }], { session });
            return { state, counts: { ...assessment.counts, remainingReferences, moderationHolds }, testOnly: true, permanentDeletionComplete: false };
        });
    } catch (error) {
        // If the lease was lost, do not overwrite the newer holder's state.
        await transaction(async (session) => {
            await assertIsolatedMediaTest({ session, ownerToken });
            const current = await User.findOne({ _id: userId, "deletionLifecycle.claimToken": token,
                "deletionLifecycle.claimExpiresAt": { $gt: new Date() } }).select("+deletionLifecycle").session(session).lean();
            if (!current) return;
            const retries = (current.deletionLifecycle?.retryCount || 0) + 1;
            await User.updateOne({ _id: userId, "deletionLifecycle.claimToken": token, "deletionLifecycle.claimExpiresAt": { $gt: new Date() } },
                { $set: { "deletionLifecycle.state": "failed", "deletionLifecycle.updatedAt": new Date(),
                    "deletionLifecycle.retryCount": retries, "deletionLifecycle.lastError": "cleanup_failed",
                    "deletionLifecycle.nextRetryAt": retries >= maxRetries ? null : new Date(Date.now() + Math.min(60000, 1000 * 2 ** (retries - 1))) },
                    $unset: { "deletionLifecycle.claimToken": 1, "deletionLifecycle.claimExpiresAt": 1 }, $inc: { "deletionLifecycle.version": 1 } }, { session });
            await AuditLog.create([{ actor: userId, action: "test_account_cleanup_failed", resourceType: "user", resourceId: userId,
                description: "Isolated lifecycle failed; details withheld" }], { session });
        });
        throw error;
    }
};

export { 
    assessDeletionLifecycle,
     runAccountDeletionLifecycle,
      refreshAccountDeletionLifecycle,
      runIsolatedAccountDeletion
     };
