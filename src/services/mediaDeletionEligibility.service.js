import crypto from "crypto";
import { CloudinaryAsset } from "../models/cloudinaryAsset.model.js";
import { CloudinaryAssetReference } from "../models/cloudinaryAssetReference.model.js";
import { MediaCleanupRecord } from "../models/mediaCleanupRecord.model.js";
import { AssetModerationHold } from "../models/assetModerationHold.model.js";
import { MediaCoverageBarrier } from "../models/mediaCoverageBarrier.model.js";
import { Report } from "../models/report.model.js";
import { CopyrightClaim } from "../models/copyrightClaim.model.js";
import { isCoverageSnapshotCurrent } from "./mediaCoverageBarrier.service.js";
import { MediaCoverageApproval } from "../models/mediaCoverageApproval.model.js";
import { assertIsolatedMediaTest } from "./testMediaCoverageApproval.service.js";
import { transitionReservation, recoverInProgressReservation } from "./cloudinaryAssetReference.service.js";
import { MediaUploadIntent } from "../models/mediaUploadIntent.model.js";

const validString = (v) => typeof v === "string" && v.length > 0 && v === v.trim() && v !== "[deleted]";
const hasValidIdentity = (asset) => {
    if (!asset || ![asset.cloudName, asset.publicId, asset.deliveryType].every(validString) ||
        !["image", "video", "raw"].includes(asset.resourceType)) return false;
    return asset._id === crypto.createHash("sha256").update(JSON.stringify([
        asset.cloudName, asset.publicId, asset.resourceType, asset.deliveryType
    ])).digest("hex");
};

// Pure diagnostics are never an authorization decision.
const evaluateMediaEligibility = ({ asset, barrier, snapshot, references = [], holds = [], jobs = [],
    unresolvedHolds = 0, unresolvedJobs = 0, unresolvedUploads = 0, reportCount = 0, claimCount = 0 } = {}) => {
    const reasons = [];
    if (!asset) reasons.push("asset_not_found");
    else {
        if (!hasValidIdentity(asset)) reasons.push("unresolved_or_invalid_identity");
        if (asset.lifecycleStatus !== "active") reasons.push("asset_not_active");
    }
    if (references.length) reasons.push("active_or_stale_references_require_review");
    if (holds.some((hold) => hold.status !== "released")) reasons.push("active_or_unresolved_moderation_hold");
    if (holds.some((hold) => hold.status === "released" && (!hold.retentionApprovedBy || !hold.approvedAt || !hold.approvalReason || !hold.releasedAt))) reasons.push("moderation_retention_incomplete");
    if (unresolvedHolds || unresolvedJobs || unresolvedUploads) reasons.push("global_unresolved_identity");
    if (!jobs.length) reasons.push("cleanup_record_missing");
    if (jobs.some((job) => !asset || job.asset !== asset._id || job.cloudName !== asset.cloudName ||
        job.publicId !== asset.publicId || job.resourceType !== asset.resourceType || job.deliveryType !== asset.deliveryType ||
        !["pending", "review_required"].includes(job.status))) reasons.push("cleanup_record_inconsistent_or_unavailable");
    if (jobs.some((job) => job.status === "review_required")) reasons.push("cleanup_review_required");
    if (!isCoverageSnapshotCurrent(snapshot, barrier?.fenceVersion)) reasons.push("coverage_snapshot_stale_or_unavailable");
    if (!snapshot || snapshot.coverageComplete !== true || barrier?.verifiedVersion !== barrier?.fenceVersion || !barrier?.verifiedAt) reasons.push("coverage_not_verified");
    // Existing historical claims cannot be tied to an asset by this diagnostic
    // until complete moderation backfill and a snapshot audit are established.
    if (reportCount || claimCount) reasons.push("moderation_coverage_requires_full_verification");
    const potentialBlockers = [...new Set(reasons)];
    return { potentiallyEligible: potentialBlockers.length === 0, authorizedForDeletion: false,
        blockingReasons: [...potentialBlockers, "deletion_disabled"],
        diagnostics: { referenceCount: references.length, holdCount: holds.length, cleanupRecordCount: jobs.length,
            unresolvedHolds, unresolvedJobs, unresolvedUploads, reportCount, claimCount, barrierVersion: barrier?.fenceVersion ?? null } };
};

// Read-only advisory check. A future implementation must revalidate and reserve
// in a single transaction; this function never invokes reservation helpers.
const getMediaDeletionEligibility = async ({ assetId, snapshot = null, session } = {}) => {
    if (typeof assetId !== "string" || !/^[a-f0-9]{64}$/.test(assetId)) throw new Error("Invalid asset ID");
    if (session && !session.inTransaction()) throw new Error("An active MongoDB transaction is required");
    const options = session ? { session } : {};
    // MongoDB sessions do not support parallel operations in a transaction.
    const asset = await CloudinaryAsset.findById(assetId, null, options).lean();
    const barrier = await MediaCoverageBarrier.findById("global", null, options).lean();
    const references = await CloudinaryAssetReference.find({ asset: assetId }, null, options).lean();
    const holds = await AssetModerationHold.find({ asset: assetId }, null, options).lean();
    const jobs = await MediaCleanupRecord.find({ asset: assetId }, null, options).lean();
    const unresolvedHolds = await AssetModerationHold.countDocuments({ status: "unresolved" }, options);
    const unresolvedJobs = await MediaCleanupRecord.countDocuments({ status: "unresolved" }, options);
    const unresolvedUploads = await MediaUploadIntent.countDocuments({ status: { $ne: "referenced" } }, options);
    const reportCount = await Report.countDocuments({}, options);
    const claimCount = await CopyrightClaim.countDocuments({}, options);
    return { assetId, ...evaluateMediaEligibility({ asset, barrier, snapshot, references, holds, jobs,
        unresolvedHolds, unresolvedJobs, unresolvedUploads, reportCount, claimCount }) };
};

// Test-only reservation: never returns production authorization or calls Cloudinary.
const reserveSyntheticTestAsset = async ({ assetId, approvalId, ownerToken, session, leaseMs = 60000 } = {}) => {
    await assertIsolatedMediaTest({ session, ownerToken });
    if (typeof assetId !== "string" || !/^[a-f0-9]{64}$/.test(assetId) || typeof approvalId !== "string" ||
        !Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 3600000) throw new Error("Invalid test reservation");
    const barrier = await MediaCoverageBarrier.findById("global").session(session).lean();
    const approval = await MediaCoverageApproval.findById(approvalId).session(session).lean();
    if (!barrier?.testRelease || barrier.testApprovalId !== approvalId || barrier.verifiedVersion !== barrier.fenceVersion ||
        approval?.status !== "test_approved" || approval.approvedVersion !== barrier.fenceVersion ||
        approval.evidence?.syntheticAssetId !== assetId) throw new Error("Test coverage approval is stale or unavailable");
    // Write the barrier as a CAS fence in this transaction. Any competing
    // reference/hold mutation writes this same document and invalidates approval.
    const fenced = await MediaCoverageBarrier.updateOne({ _id: "global", testRelease: true, testApprovalId: approvalId,
        fenceVersion: barrier.fenceVersion, verifiedVersion: barrier.fenceVersion }, { $inc: { testReservationFence: 1 } }, { session });
    if (fenced.matchedCount !== 1) throw new Error("Test coverage approval is stale");
    const snapshot = { stable: true, fenceVersion: barrier.fenceVersion, coverageComplete: true };
    const diagnostics = await getMediaDeletionEligibility({ assetId, snapshot, session });
    if (!diagnostics.potentiallyEligible) throw new Error(`Test asset blocked: ${diagnostics.blockingReasons.join(", ")}`);
    const asset = await CloudinaryAsset.findById(assetId).session(session).lean();
    if (asset.cloudName !== "isolated-test.invalid" || !asset.publicId.startsWith("synthetic/")) throw new Error("Only synthetic assets are permitted");
    const token = crypto.randomUUID(); const now = new Date();
    const reserved = await CloudinaryAsset.findOneAndUpdate({ _id: assetId, lifecycleStatus: "active", deletionStatus: "blocked" },
        { $set: { lifecycleStatus: "deletion_reserved", reservationToken: token, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
            $inc: { fenceVersion: 1 } }, { session, returnDocument: "after" }).select("fenceVersion leaseExpiresAt").lean();
    if (!reserved) throw new Error("Test asset is unavailable for reservation");
    return { assetId, token, fenceVersion: reserved.fenceVersion, leaseExpiresAt: reserved.leaseExpiresAt,
        testOnly: true, authorizedForDeletion: false };
};

const cancelSyntheticTestReservation = async ({ ownerToken, session, ...claim } = {}) => {
    await assertIsolatedMediaTest({ session, ownerToken });
    if (!await CloudinaryAsset.exists({ _id: claim.assetId, cloudName: "isolated-test.invalid", publicId: /^synthetic\// }).session(session)) throw new Error("Only synthetic assets are permitted");
    return transitionReservation({ ...claim, session, action: "release" });
};

const recoverSyntheticTestReservation = async ({ ownerToken, session, ...claim } = {}) => {
    await assertIsolatedMediaTest({ session, ownerToken });
    if (!await CloudinaryAsset.exists({ _id: claim.assetId, cloudName: "isolated-test.invalid", publicId: /^synthetic\// }).session(session)) throw new Error("Only synthetic assets are permitted");
    return recoverInProgressReservation({ ...claim, session });
};

export { getMediaDeletionEligibility, evaluateMediaEligibility, reserveSyntheticTestAsset,
    cancelSyntheticTestReservation, recoverSyntheticTestReservation };
