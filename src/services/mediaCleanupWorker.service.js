import crypto from "crypto";
import mongoose from "mongoose";
import { CloudinaryAsset } from "../models/cloudinaryAsset.model.js";
import { MediaCleanupRecord } from "../models/mediaCleanupRecord.model.js";
import { getMediaDeletionEligibility, reserveSyntheticTestAsset, cancelSyntheticTestReservation } from "./mediaDeletionEligibility.service.js";
import { assertIsolatedMediaTest } from "./testMediaCoverageApproval.service.js";
import { MediaCoverageBarrier } from "../models/mediaCoverageBarrier.model.js";
import { MediaCoverageApproval } from "../models/mediaCoverageApproval.model.js";
import { CloudinaryAssetReference } from "../models/cloudinaryAssetReference.model.js";
import { AssetModerationHold } from "../models/assetModerationHold.model.js";
import { fenceMediaCoverage } from "./mediaCoverageBarrier.service.js";

const requireSession = (session) => { if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required"); };
const positive = (value, max) => Number.isSafeInteger(value) && value > 0 && value <= max;

const retryDecision = ({ retryCount, maxRetries = 5, baseDelayMs = 1000, maxDelayMs = 3600000,
    random = Math.random, now = new Date(), outcomeUncertain = false } = {}) => {
    if (!Number.isSafeInteger(retryCount) || retryCount < 0 || !positive(maxRetries, 100) ||
        !positive(baseDelayMs, 86400000) || !positive(maxDelayMs, 86400000) || baseDelayMs > maxDelayMs ||
        typeof random !== "function" || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Invalid retry options");
    const nextCount = retryCount + 1;
    if (outcomeUncertain) return { status: "review_required", retryCount: nextCount, nextRetryAt: null, operationState: "uncertain" };
    if (nextCount >= maxRetries) return { status: "failed", retryCount: nextCount, nextRetryAt: null, operationState: "not_started" };
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample > 1) throw new Error("Invalid jitter value");
    const cap = Math.min(maxDelayMs, baseDelayMs * (2 ** Math.min(retryCount, 30)));
    return { status: "pending", retryCount: nextCount, nextRetryAt: new Date(now.getTime() + Math.floor(cap * (0.5 + sample * 0.5))), operationState: "not_started" };
};

// Claims are database-only processing leases, never Cloudinary reservations.
// The caller must own the transaction and must not schedule this helper yet.
const claimCleanupJob = async ({ jobId, workerId, session, leaseMs = 60000, now = new Date(), reservation } = {}) => {
    requireSession(session);
    if (typeof jobId !== "string" || !jobId || typeof workerId !== "string" || !workerId.trim() ||
        !positive(leaseMs, 3600000) || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Invalid claim options");
    const job = await MediaCleanupRecord.findOne({ _id: jobId, status: "pending", asset: { $ne: null },
        operationState: { $in: ["not_started", null] }, $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }] }).session(session).lean();
    if (!job || !/^[a-f0-9]{64}$/.test(job.asset)) return null;
    const token = crypto.randomUUID();
    const expires = new Date(now.getTime() + leaseMs);
    // Never reclaim an expired asset lease automatically: the prior outcome may be uncertain.
    const assetFilter = reservation ? { lifecycleStatus: "deletion_reserved", reservationToken: reservation.token, fenceVersion: reservation.fenceVersion } : { lifecycleStatus: "active" };
    const asset = await CloudinaryAsset.findOneAndUpdate({ _id: job.asset, ...assetFilter, cleanupLeaseToken: null },
        { $set: { cleanupLeaseToken: token, cleanupLeaseExpiresAt: expires }, $inc: { cleanupFenceVersion: 1 } },
        { returnDocument: "after", session }).lean();
    if (!asset) return null;
    const claimed = await MediaCleanupRecord.findOneAndUpdate({ _id: jobId, status: "pending", asset: job.asset,
        operationState: { $in: ["not_started", null] } }, { $set: { status: "processing", claimToken: token,
            claimFenceVersion: asset.cleanupFenceVersion, leaseOwner: workerId, leaseExpiresAt: expires, operationState: "not_started" } },
        { returnDocument: "after", session }).select("+claimToken").lean();
    if (!claimed) throw new Error("Cleanup job changed during claim");
    return { jobId, assetId: job.asset, token, fenceVersion: asset.cleanupFenceVersion, leaseExpiresAt: expires };
};

// A verified pre-operation failure may be retried; uncertain outcomes remain
// protected under the asset lease for manual reconciliation.
const recordCleanupFailure = async ({ claim, session, retryOptions = {}, outcomeUncertain = false, errorCode = "cleanup_failed", now = new Date() } = {}) => {
    requireSession(session);
    if (!claim || typeof claim.token !== "string" || !claim.token || !Number.isSafeInteger(claim.fenceVersion) || claim.fenceVersion < 1 ||
        typeof claim.jobId !== "string" || typeof claim.assetId !== "string") throw new Error("Invalid cleanup claim");
    const asset = await CloudinaryAsset.findOne({ _id: claim.assetId, cleanupLeaseToken: claim.token,
        cleanupFenceVersion: claim.fenceVersion, cleanupLeaseExpiresAt: { $gt: now } }).session(session).lean();
    if (!asset) throw new Error("Stale cleanup claim");
    const job = await MediaCleanupRecord.findOne({ _id: claim.jobId, asset: claim.assetId, status: "processing",
        claimToken: claim.token, claimFenceVersion: claim.fenceVersion, leaseExpiresAt: { $gt: now } }).select("+claimToken").session(session).lean();
    if (!job) throw new Error("Stale cleanup claim");
    outcomeUncertain = outcomeUncertain || job.operationState === "uncertain";
    const decision = retryDecision({ ...retryOptions, retryCount: job.retryCount || 0, now, outcomeUncertain });
    // Store only a small safe category, never raw provider errors or credentials.
    const safeCode = ["timeout", "rate_limit", "temporary", "cleanup_failed"].includes(errorCode) ? errorCode : "cleanup_failed";
    const updated = await MediaCleanupRecord.updateOne({ _id: job._id, status: "processing", claimToken: claim.token,
        claimFenceVersion: claim.fenceVersion, leaseExpiresAt: { $gt: now } }, { $set: { ...decision, lastError: safeCode,
            leaseOwner: null, leaseExpiresAt: null, claimToken: null, claimFenceVersion: null } }, { session });
    if (updated.modifiedCount !== 1) throw new Error("Stale cleanup claim");
    if (!outcomeUncertain) {
        const released = await CloudinaryAsset.updateOne({ _id: claim.assetId, cleanupLeaseToken: claim.token,
            cleanupFenceVersion: claim.fenceVersion, cleanupLeaseExpiresAt: { $gt: now } },
            { $set: { cleanupLeaseToken: null, cleanupLeaseExpiresAt: null }, $inc: { cleanupFenceVersion: 1 } }, { session });
        if (released.modifiedCount !== 1) throw new Error("Stale cleanup claim");
    }
    return decision;
};

// An expired claim cannot prove whether an external call occurred. Quarantine
// it and leave the asset lease in place; do not retry or reactivate the asset.
const quarantineExpiredCleanup = async ({ jobId, session, now = new Date() } = {}) => {
    requireSession(session);
    if (typeof jobId !== "string" || !jobId || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Invalid recovery options");
    const job = await MediaCleanupRecord.findOne({ _id: jobId, status: "processing", leaseExpiresAt: { $lte: now } })
        .select("+claimToken").session(session).lean();
    if (!job) return false;
    const asset = await CloudinaryAsset.findOne({ _id: job.asset, cleanupLeaseToken: job.claimToken,
        cleanupFenceVersion: job.claimFenceVersion }).session(session).lean();
    if (!asset) throw new Error("Cleanup lease requires manual reconciliation");
    const result = await MediaCleanupRecord.updateOne({ _id: job._id, status: "processing", claimToken: job.claimToken,
        claimFenceVersion: job.claimFenceVersion, leaseExpiresAt: { $lte: now } }, { $set: {
            status: "review_required", operationState: "uncertain", lastError: "lease_expired",
            leaseOwner: null, leaseExpiresAt: null, claimToken: null, claimFenceVersion: null
        } }, { session });
    if (result.modifiedCount !== 1) throw new Error("Cleanup claim changed during recovery");
    return true;
};

// Deliberately hard-disabled, including when dependencies are injected.
const runCleanupWorkerOnce = async ({ eligibility = getMediaDeletionEligibility, cloudinaryDelete } = {}) => {
    void eligibility;
    void cloudinaryDelete;
    return { status: "disabled", authorizedForDeletion: false };
};

// A closed, in-memory simulator: arbitrary functions or network adapters cannot
// be injected. Values model provider outcomes without performing I/O.
const mockAdapters = new WeakSet();
const createMockCloudinaryAdapter = (outcomes = ["success"]) => {
    if (!Array.isArray(outcomes) || outcomes.some((v) => !["success", "temporary", "rate_limit", "timeout", "uncertain"].includes(v))) throw new Error("Invalid mock outcomes");
    const sequence = [...outcomes];
    const adapter = Object.freeze({ next: () => sequence.shift() || "success" });
    mockAdapters.add(adapter);
    return adapter;
};

const inTransaction = async (fn) => {
    const session = await mongoose.startSession();
    try { return await session.withTransaction(() => fn(session)); }
    finally { await session.endSession(); }
};

// Revalidate under the same barrier and asset fences immediately before and
// after the simulated operation. Production authorization remains false.
const verifySyntheticClaim = async ({ claim, reservation, approvalId, ownerToken, session }) => {
    await assertIsolatedMediaTest({ session, ownerToken });
    const now = new Date();
    const barrier = await MediaCoverageBarrier.findById("global").session(session).lean();
    const approval = await MediaCoverageApproval.findById(approvalId).session(session).lean();
    if (!barrier?.testRelease || barrier.testApprovalId !== approvalId || barrier.verifiedVersion !== barrier.fenceVersion ||
        approval?.status !== "test_approved" || approval.approvedVersion !== barrier.fenceVersion || approval.evidence?.syntheticAssetId !== claim.assetId) throw new Error("Test coverage approval is stale");
    const locked = await MediaCoverageBarrier.updateOne({ _id: "global", testRelease: true, testApprovalId: approvalId,
        fenceVersion: barrier.fenceVersion, verifiedVersion: barrier.fenceVersion }, { $inc: { testReservationFence: 1 } }, { session });
    if (locked.matchedCount !== 1) throw new Error("Test coverage approval is stale");
    const asset = await CloudinaryAsset.findOne({ _id: claim.assetId, cloudName: "isolated-test.invalid", publicId: /^synthetic\//,
        lifecycleStatus: "deletion_reserved", reservationToken: reservation.token, fenceVersion: reservation.fenceVersion,
        leaseExpiresAt: { $gt: now }, cleanupLeaseToken: claim.token, cleanupFenceVersion: claim.fenceVersion,
        cleanupLeaseExpiresAt: { $gt: now } }).session(session).lean();
    const job = await MediaCleanupRecord.findOne({ _id: claim.jobId, asset: claim.assetId, status: "processing", claimToken: claim.token,
        claimFenceVersion: claim.fenceVersion, leaseExpiresAt: { $gt: now } }).session(session).lean();
    if (!asset || !job || job.cloudName !== asset.cloudName || job.publicId !== asset.publicId ||
        job.resourceType !== asset.resourceType || job.deliveryType !== asset.deliveryType) throw new Error("Cleanup claim or identity is stale");
    if (await CloudinaryAssetReference.exists({ asset: claim.assetId }).session(session) ||
        await AssetModerationHold.exists({ $or: [{ asset: claim.assetId, status: "active" }, { status: "unresolved" }] }).session(session) ||
        await MediaCleanupRecord.exists({ status: "unresolved" }).session(session) ||
        await MediaCleanupRecord.exists({ asset: claim.assetId, _id: { $ne: claim.jobId }, status: { $ne: "completed" } }).session(session)) throw new Error("Asset is protected or unresolved");
    return { asset, job };
};

const runSyntheticCleanupBatch = async ({ ownerToken, approvalId, adapter, limit = 1, workerId = "isolated-test", leaseMs = 60000, retryOptions = {} } = {}) => {
    if (!mockAdapters.has(adapter)) throw new Error("A built-in mock adapter is required");
    if (!positive(limit, 100)) throw new Error("Invalid batch limit");
    // Guard before even reading the queue.
    await inTransaction((session) => assertIsolatedMediaTest({ session, ownerToken }));
    const results = [];
    for (let i = 0; i < limit; i++) {
        const job = await MediaCleanupRecord.findOne({ status: "pending", cloudName: "isolated-test.invalid",
            publicId: /^synthetic\//, $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: new Date() } }] }).sort({ _id: 1 }).lean();
        if (!job) break;
        let claim, reservation;
        try {
            await inTransaction(async (session) => {
                reservation = await reserveSyntheticTestAsset({ assetId: job.asset, approvalId, ownerToken, session, leaseMs });
                claim = await claimCleanupJob({ jobId: job._id, workerId, session, leaseMs, reservation });
                if (!claim) throw new Error("Cleanup job unavailable");
                await verifySyntheticClaim({ claim, reservation, approvalId, ownerToken, session });
                const marked = await MediaCleanupRecord.updateOne({ _id: claim.jobId, status: "processing", claimToken: claim.token,
                    claimFenceVersion: claim.fenceVersion }, { $set: { operationState: "uncertain" } }, { session });
                if (marked.modifiedCount !== 1) throw new Error("Cleanup claim changed");
            });
        } catch { results.push({ jobId: job._id, status: "blocked" }); break; }
        const outcome = adapter.next();
        try {
            if (outcome === "success") {
                await inTransaction(async (session) => {
                    await verifySyntheticClaim({ claim, reservation, approvalId, ownerToken, session });
                    const now = new Date();
                    const updated = await MediaCleanupRecord.updateOne({ _id: claim.jobId, status: "processing", claimToken: claim.token,
                        claimFenceVersion: claim.fenceVersion, leaseExpiresAt: { $gt: now }, operationState: "uncertain" },
                        { $set: { status: "completed", operationState: "not_started", claimToken: null, claimFenceVersion: null,
                            leaseOwner: null, leaseExpiresAt: null, nextRetryAt: null, lastError: null } }, { session });
                    if (updated.modifiedCount !== 1) throw new Error("Stale cleanup claim");
                    const asset = await CloudinaryAsset.updateOne({ _id: claim.assetId, lifecycleStatus: "deletion_reserved", reservationToken: reservation.token,
                        fenceVersion: reservation.fenceVersion, cleanupLeaseToken: claim.token, cleanupFenceVersion: claim.fenceVersion,
                        leaseExpiresAt: { $gt: now }, cleanupLeaseExpiresAt: { $gt: now } }, { $set: { lifecycleStatus: "deleted", reservationToken: null,
                            leaseExpiresAt: null, cleanupLeaseToken: null, cleanupLeaseExpiresAt: null }, $inc: { fenceVersion: 1, cleanupFenceVersion: 1 } }, { session });
                    if (asset.modifiedCount !== 1) throw new Error("Stale cleanup claim");
                    await fenceMediaCoverage({ session });
                });
                results.push({ jobId: job._id, status: "completed" });
            } else {
                const uncertain = outcome === "uncertain" || outcome === "timeout";
                const decision = await inTransaction(async (session) => {
                    await verifySyntheticClaim({ claim, reservation, approvalId, ownerToken, session });
                    if (!uncertain) {
                        await MediaCleanupRecord.updateOne({ _id: claim.jobId, status: "processing", claimToken: claim.token,
                            claimFenceVersion: claim.fenceVersion }, { $set: { operationState: "not_started" } }, { session });
                        await cancelSyntheticTestReservation({ ownerToken, session, assetId: claim.assetId, token: reservation.token, fenceVersion: reservation.fenceVersion });
                    }
                    return recordCleanupFailure({ claim, session, retryOptions, outcomeUncertain: uncertain, errorCode: outcome });
                });
                results.push({ jobId: job._id, status: decision.status });
            }
        } catch {
            // A failed finalization leaves the uncertain claim and reservation
            // intact; expired-claim recovery can only quarantine it.
            results.push({ jobId: job._id, status: "reconciliation_required" });
        }
        break; // The test approval covers exactly one synthetic asset.
    }
    return { testOnly: true, authorizedForDeletion: false, results };
};

const recoverSyntheticCleanup = async ({ ownerToken, jobId } = {}) => inTransaction(async (session) => {
    await assertIsolatedMediaTest({ session, ownerToken });
    const job = await MediaCleanupRecord.findOne({ _id: jobId, cloudName: "isolated-test.invalid", publicId: /^synthetic\// }).session(session).lean();
    if (!job) throw new Error("Synthetic cleanup job not found");
    return quarantineExpiredCleanup({ jobId, session });
});

const createSyntheticCleanupWorker = (options = {}) => {
    let current = null; let stopped = false;
    const runOnce = async () => {
        if (stopped) return { status: "stopped" };
        if (current) return { status: "busy" };
        current = runSyntheticCleanupBatch(options);
        try { return await current; } finally { current = null; }
    };
    const stop = async () => { stopped = true; if (current) await current.catch(() => {}); };
    return { runOnce, stop };
};

export { retryDecision, claimCleanupJob, recordCleanupFailure, quarantineExpiredCleanup, runCleanupWorkerOnce,
    createMockCloudinaryAdapter, runSyntheticCleanupBatch, recoverSyntheticCleanup, createSyntheticCleanupWorker };
