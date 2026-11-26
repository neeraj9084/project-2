import mongoose from "mongoose";
import { AssetModerationHold } from "../models/assetModerationHold.model.js";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import { Report } from "../models/report.model.js";
import { CopyrightClaim } from "../models/copyrightClaim.model.js";
import { AuditLog } from "../models/auditLog.model.js";
import { ApiError } from "../utils/ApiError.js";
import { verifiedAttachment } from "./messageAttachmentRegistry.service.js";
import { registerAssetReference, removeAssetReference } from "./cloudinaryAssetReference.service.js";
import { fenceMediaCoverage } from "./mediaCoverageBarrier.service.js";

const sourceType = (caseType, slot) => `moderation_${caseType}_${slot}`;
const requireSession = (session) => { if (!session?.inTransaction()) throw new Error("An active transaction is required"); };

const createVideoModerationHolds = async ({ caseType, caseId, videoId, actor, session }) => {
    requireSession(session);
    if (!["report", "copyright"].includes(caseType) || ![caseId, videoId, actor].every(mongoose.isValidObjectId)) throw new Error("Invalid moderation hold");
    await fenceMediaCoverage({ session });
    const video = await Video.findOne({ _id: videoId, isDeleted: { $ne: true } })
        .select("videoFile videoPublicId thumbnail thumbnailPublicId +videoDeliveryType +thumbnailDeliveryType +mediaRegistry")
        .session(session).lean();
    if (!video) throw new Error("Video is unavailable for moderation");
    for (const slot of ["video", "thumbnail"]) {
        const meta = video.mediaRegistry?.[slot];
        const verified = verifiedAttachment({ url: slot === "video" ? video.videoFile : video.thumbnail,
            publicId: video[`${slot}PublicId`], resourceType: slot === "video" ? "video" : "image",
            deliveryType: video[`${slot}DeliveryType`], mediaRegistry: meta });
        const id = `${caseType}:${caseId}:${slot}`;
        const existing = await AssetModerationHold.findById(id).session(session).lean();
        if (existing) {
            if (String(existing.video) !== String(videoId) || String(existing.actor) !== String(actor)) throw new Error("Moderation hold conflict");
            continue;
        }
        if (verified) await registerAssetReference({ assetId: verified.asset, sourceType: sourceType(caseType, slot), sourceId: caseId, userId: actor, session });
        await AssetModerationHold.create([{ _id: id, caseType, caseId, video: videoId, actor, slot,
            asset: verified?.asset || null, status: verified ? "active" : "unresolved" }], { session });
    }
};

// A policy must be explicitly configured; absence never means zero retention.
const approveModerationRetention = async ({ caseType, caseId, adminId, retentionUntil, reason, session }) => {
    requireSession(session);
    if (!["report", "copyright"].includes(caseType) || !mongoose.isValidObjectId(caseId) || !mongoose.isValidObjectId(adminId) ||
        !(retentionUntil instanceof Date) || !Number.isFinite(retentionUntil.getTime()) ||
        typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) throw new ApiError(400, "Invalid retention approval");
    const rawDays = process.env.MODERATION_MIN_RETENTION_DAYS;
    if (!/^[1-9]\d*$/.test(rawDays || "") || !Number.isSafeInteger(Number(rawDays)) || Number(rawDays) > 36500) {
        throw new ApiError(503, "Moderation retention policy is not configured");
    }
    const admin = await User.findOne({ _id: adminId, role: "admin", isActive: true, deletionRequestedAt: null, anonymizedAt: null }).select("_id").session(session).lean();
    if (!admin) throw new ApiError(403, "Active administrator required");
    const model = caseType === "report" ? Report : CopyrightClaim;
    const terminal = caseType === "report" ? ["resolved", "rejected"] : ["approved", "rejected"];
    const record = await model.findOneAndUpdate({ _id: caseId, status: { $in: terminal } },
        { $currentDate: { updatedAt: true } }, { session, returnDocument: "after" }).lean();
    if (!record || !(record.reviewedAt instanceof Date) || !Number.isFinite(record.reviewedAt.getTime())) throw new ApiError(409, "Resolved case and review date required");
    const earliest = record.reviewedAt.getTime() + Number(rawDays) * 86400000;
    if (retentionUntil.getTime() < earliest) throw new ApiError(400, "Retention date is earlier than the configured minimum");
    const holds = await AssetModerationHold.find({ caseType, caseId }).session(session).lean();
    if (holds.length !== 2 || new Set(holds.map((h) => h.slot)).size !== 2 ||
        holds.some((h) => h.status !== "active" || !h.asset || h.retentionApprovedBy)) throw new ApiError(409, "Holds are unresolved, released or already approved");
    const approvedAt = new Date();
    const updated = await AssetModerationHold.updateMany({ caseType, caseId, status: "active", retentionApprovedBy: null },
        { $set: { retentionUntil, retentionApprovedBy: adminId, approvedAt, approvalReason: reason.trim() } }, { session });
    if (updated.modifiedCount !== 2) throw new ApiError(409, "Moderation holds changed");
    await AuditLog.create([{ actor: adminId, action: "moderation_retention_approved", resourceType: caseType === "report" ? "report" : "copyright_claim",
        resourceId: caseId, description: reason.trim(), metadata: { retentionUntil, minimumRetentionDays: Number(rawDays) } }], { session });
    return { caseType, caseId, retentionUntil, approvedBy: adminId, approvedAt, approvalReason: reason.trim() };
};

// Explicit internal operation only. No policy or retention approval is assumed.
const releaseModerationHolds = async ({ caseType, caseId, adminId, session }) => {
    requireSession(session);
    if (!["report", "copyright"].includes(caseType) || !mongoose.isValidObjectId(caseId) || !mongoose.isValidObjectId(adminId)) throw new Error("Invalid moderation release");
    const admin = await User.findOne({ _id: adminId, role: "admin", isActive: true, deletionRequestedAt: null, anonymizedAt: null }).select("_id").session(session).lean();
    if (!admin) throw new ApiError(403, "Active administrator required");
    const model = caseType === "report" ? Report : CopyrightClaim;
    const terminal = caseType === "report" ? ["resolved", "rejected"] : ["approved", "rejected"];
    // Write the case document to conflict with concurrent status changes.
    const record = await model.findOneAndUpdate({ _id: caseId, status: { $in: terminal } },
        { $currentDate: { updatedAt: true } }, { session, returnDocument: "after" }).lean();
    if (!record) throw new ApiError(409, "A resolved moderation case is required");
    const rawDays = process.env.MODERATION_MIN_RETENTION_DAYS;
    if (!/^[1-9]\d*$/.test(rawDays || "") || !Number.isSafeInteger(Number(rawDays)) || Number(rawDays) > 36500) throw new ApiError(503, "Moderation retention policy is not configured");
    if (!(record.reviewedAt instanceof Date) || !Number.isFinite(record.reviewedAt.getTime())) throw new ApiError(409, "Case review date is unavailable");
    const holds = await AssetModerationHold.find({ caseType, caseId }).session(session).lean();
    if (holds.length !== 2 || new Set(holds.map((h) => h.slot)).size !== 2 || holds.some((h) => h.status !== "active" || !h.asset || !h.retentionApprovedBy || !h.approvedAt || !h.approvalReason ||
        !(h.retentionUntil instanceof Date) || !Number.isFinite(h.retentionUntil.getTime()) || h.retentionUntil > new Date() ||
        h.retentionUntil.getTime() < record.reviewedAt.getTime() + Number(rawDays) * 86400000 || h.approvedAt < record.reviewedAt)) throw new ApiError(409, "Moderation retention is unresolved, incomplete or already released");
    const releasedAt = new Date();
    for (const hold of holds) {
        await removeAssetReference({ assetId: hold.asset, sourceType: sourceType(caseType, hold.slot), sourceId: caseId, userId: hold.actor, session });
        const result = await AssetModerationHold.updateOne({ _id: hold._id, status: "active" },
            { $set: { status: "released", releasedBy: adminId, releasedAt } }, { session });
        if (result.modifiedCount !== 1) throw new ApiError(409, "Moderation holds changed");
    }
    await AuditLog.create([{ actor: adminId, action: "moderation_holds_released", resourceType: caseType === "report" ? "report" : "copyright_claim",
        resourceId: caseId, description: "Moderation holds released after approved retention", metadata: { holdIds: holds.map((h) => h._id) } }], { session });
    return { caseType, caseId, releasedBy: adminId, releasedAt };
};

export { createVideoModerationHolds, approveModerationRetention, releaseModerationHolds };
