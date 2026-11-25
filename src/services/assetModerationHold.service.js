import mongoose from "mongoose";
import { AssetModerationHold } from "../models/assetModerationHold.model.js";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import { Report } from "../models/report.model.js";
import { CopyrightClaim } from "../models/copyrightClaim.model.js";
import { verifiedAttachment } from "./messageAttachmentRegistry.service.js";
import { registerAssetReference, removeAssetReference } from "./cloudinaryAssetReference.service.js";

const sourceType = (caseType, slot) => `moderation_${caseType}_${slot}`;
const requireSession = (session) => { if (!session?.inTransaction()) throw new Error("An active transaction is required"); };

const createVideoModerationHolds = async ({ caseType, caseId, videoId, actor, session }) => {
    requireSession(session);
    if (!["report", "copyright"].includes(caseType) || ![caseId, videoId, actor].every(mongoose.isValidObjectId)) throw new Error("Invalid moderation hold");
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

// Explicit internal operation only. No policy or retention approval is assumed.
const releaseModerationHolds = async ({ caseType, caseId, adminId, session }) => {
    requireSession(session);
    if (!["report", "copyright"].includes(caseType) || !mongoose.isValidObjectId(caseId) || !mongoose.isValidObjectId(adminId)) throw new Error("Invalid moderation release");
    const admin = await User.findOne({ _id: adminId, role: "admin", isActive: true }).select("_id").session(session).lean();
    if (!admin) throw new Error("Active administrator required");
    const model = caseType === "report" ? Report : CopyrightClaim;
    const terminal = caseType === "report" ? ["resolved", "rejected"] : ["approved", "rejected"];
    // Write the case document to conflict with concurrent status changes.
    const record = await model.findOneAndUpdate({ _id: caseId, status: { $in: terminal } },
        { $currentDate: { updatedAt: true } }, { session, new: true }).lean();
    if (!record) throw new Error("A resolved moderation case is required");
    const holds = await AssetModerationHold.find({ caseType, caseId }).session(session).lean();
    if (holds.length !== 2 || holds.some((h) => h.status === "unresolved" || !h.retentionApprovedBy ||
        !(h.retentionUntil instanceof Date) || h.retentionUntil > new Date())) throw new Error("Moderation retention is unresolved or incomplete");
    for (const hold of holds) {
        if (hold.status === "released") continue;
        await removeAssetReference({ assetId: hold.asset, sourceType: sourceType(caseType, hold.slot), sourceId: caseId, userId: hold.actor, session });
        await AssetModerationHold.updateOne({ _id: hold._id, status: "active" },
            { $set: { status: "released", releasedBy: adminId, releasedAt: new Date() } }, { session });
    }
};

export { createVideoModerationHolds, releaseModerationHolds };
