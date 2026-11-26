import crypto from "crypto";
import mongoose from "mongoose";
import { CloudinaryAsset } from "../models/cloudinaryAsset.model.js";
import { CloudinaryAssetReference } from "../models/cloudinaryAssetReference.model.js";
import { AssetModerationHold } from "../models/assetModerationHold.model.js";
import { fenceMediaCoverage, requireCompleteMediaCoverage } from "./mediaCoverageBarrier.service.js";

// This must remain false until migration and every reference-writing API are covered.
const REFERENCE_COVERAGE_COMPLETE = false;

const referenceId = (assetId, sourceType, sourceId, userId) => crypto
    .createHash("sha256")
    .update(JSON.stringify([assetId, sourceType, String(sourceId), String(userId)]))
    .digest("hex");

const validate = (assetId, sourceType, sourceId, userId, session) => {
    if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required");
    if (typeof assetId !== "string" || !/^[a-f0-9]{64}$/.test(assetId) ||
        typeof sourceType !== "string" || !sourceType.trim() || sourceType !== sourceType.trim() ||
        !mongoose.isValidObjectId(sourceId) || !mongoose.isValidObjectId(userId)) {
        throw new Error("Invalid asset reference");
    }
};

// These helpers must run in the same transaction as the source document change.
const registerAssetReference = async ({ assetId, sourceType, sourceId, userId, session }) => {
    validate(assetId, sourceType, sourceId, userId, session);
    await fenceMediaCoverage({ session });
    const asset = await CloudinaryAsset.findOneAndUpdate(
        { _id: assetId, deletionStatus: "blocked", lifecycleStatus: { $in: ["active", null] } },
        { $inc: { fenceVersion: 1 } },
        { returnDocument: "after", session }
    ).select("_id");
    if (!asset) throw new Error("Asset is unavailable for new references");

    const id = referenceId(assetId, sourceType, sourceId, userId);
    await CloudinaryAssetReference.updateOne(
        { _id: id },
        { $setOnInsert: { asset: assetId, sourceType, sourceId, user: userId } },
        { upsert: true, session }
    );
};

const removeAssetReference = async ({ assetId, sourceType, sourceId, userId, session }) => {
    validate(assetId, sourceType, sourceId, userId, session);
    await fenceMediaCoverage({ session });
    const asset = await CloudinaryAsset.findOneAndUpdate(
        { _id: assetId, deletionStatus: "blocked", lifecycleStatus: { $in: ["active", null] } },
        { $inc: { fenceVersion: 1 } },
        { returnDocument: "after", session }
    ).select("_id");
    if (!asset) throw new Error("Asset is unavailable for reference changes");
    await CloudinaryAssetReference.deleteOne(
        { _id: referenceId(assetId, sourceType, sourceId, userId) },
        { session }
    );
};

const validateReservation = (assetId, session, leaseMs) => {
    if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required");
    if (typeof assetId !== "string" || !/^[a-f0-9]{64}$/.test(assetId)) {
        throw new Error("Invalid asset ID");
    }
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 3600000) {
        throw new Error("Lease duration must be between 1 second and 1 hour");
    }
};

// Reservation is a fence only; it does not establish deletion eligibility.
const reserveAssetDeletion = async ({ assetId, session, leaseMs = 60000 }) => {
    validateReservation(assetId, session, leaseMs);
    // Until backfill and every reference-writing API are integrated, a missing
    // registry reference is not evidence that the asset has no users.
    if (!REFERENCE_COVERAGE_COMPLETE) {
        throw new Error("Asset deletion reservation is disabled until reference coverage is complete");
    }
    await requireCompleteMediaCoverage({ session });
    const now = new Date();
    const token = crypto.randomUUID();
    const reference = await CloudinaryAssetReference.exists({ asset: assetId }).session(session);
    if (reference) throw new Error("Asset has registered references");
    const hold = await AssetModerationHold.exists({ $or: [{ asset: assetId, status: "active" }, { status: "unresolved" }] }).session(session);
    if (hold) throw new Error("Asset moderation or identity is unresolved");
    const asset = await CloudinaryAsset.findOneAndUpdate(
        {
            _id: assetId,
            deletionStatus: "blocked",
            $or: [
                { lifecycleStatus: { $in: ["active", null] } },
                { lifecycleStatus: "deletion_reserved", leaseExpiresAt: { $lte: now } }
            ]
        },
        {
            $set: { lifecycleStatus: "deletion_reserved", reservationToken: token,
                leaseExpiresAt: new Date(now.getTime() + leaseMs) },
            $inc: { fenceVersion: 1 }
        },
        { returnDocument: "after", session }
    ).select("_id fenceVersion leaseExpiresAt");
    if (!asset) throw new Error("Asset cannot be reserved");

    return { token, fenceVersion: asset.fenceVersion, leaseExpiresAt: asset.leaseExpiresAt };
};

const transitionReservation = async ({ assetId, token, fenceVersion, session, action }) => {
    validateReservation(assetId, session, 60000);
    if (action === "start" && !REFERENCE_COVERAGE_COMPLETE) {
        throw new Error("Asset deletion is disabled until reference coverage is complete");
    }
    if (action === "start") await requireCompleteMediaCoverage({ session });
    if (action === "start" && await AssetModerationHold.exists({ $or: [{ asset: assetId, status: "active" }, { status: "unresolved" }] }).session(session)) {
        throw new Error("Asset moderation or identity is unresolved");
    }
    if (typeof token !== "string" || !token || !Number.isSafeInteger(fenceVersion) || fenceVersion < 1) {
        throw new Error("Invalid reservation credentials");
    }
    const now = new Date();
    const actions = {
        start: { from: "deletion_reserved", to: "deletion_in_progress" },
        release: { from: "deletion_reserved", to: "active" }
    };
    const transition = actions[action];
    if (!transition) throw new Error("Invalid reservation action");
    const update = { $set: { lifecycleStatus: transition.to }, $inc: { fenceVersion: 1 } };
    if (action === "release") {
        update.$set.reservationToken = null;
        update.$set.leaseExpiresAt = null;
    }
    const asset = await CloudinaryAsset.findOneAndUpdate(
        { _id: assetId, lifecycleStatus: transition.from, reservationToken: token,
            fenceVersion, leaseExpiresAt: { $gt: now } },
        update,
        { returnDocument: "after", session }
    ).select("_id fenceVersion lifecycleStatus leaseExpiresAt");
    if (!asset) throw new Error("Reservation is stale or unavailable");
    return { fenceVersion: asset.fenceVersion, lifecycleStatus: asset.lifecycleStatus,
        leaseExpiresAt: asset.leaseExpiresAt };
};

// An uncertain in-progress deletion is never made active by lease expiry.
const recoverInProgressReservation = async ({ assetId, session, leaseMs = 60000 }) => {
    validateReservation(assetId, session, leaseMs);
    const now = new Date();
    const token = crypto.randomUUID();
    const asset = await CloudinaryAsset.findOneAndUpdate(
        { _id: assetId, lifecycleStatus: "deletion_in_progress", leaseExpiresAt: { $lte: now } },
        { $set: { reservationToken: token, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
            $inc: { fenceVersion: 1 } },
        { returnDocument: "after", session }
    ).select("_id fenceVersion leaseExpiresAt");
    if (!asset) throw new Error("In-progress reservation is not recoverable");
    return { token, fenceVersion: asset.fenceVersion, leaseExpiresAt: asset.leaseExpiresAt,
        requiresOutcomeReconciliation: true };
};

export { registerAssetReference, removeAssetReference, reserveAssetDeletion,
    transitionReservation, recoverInProgressReservation };
