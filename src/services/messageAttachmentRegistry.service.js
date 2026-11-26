import crypto from "crypto";
import { MediaCleanupRecord } from "../models/mediaCleanupRecord.model.js";
import { removeAssetReference } from "./cloudinaryAssetReference.service.js";
import { fenceMediaCoverage } from "./mediaCoverageBarrier.service.js";

// Never derive an identity from a URL or treat partially verified metadata as safe.
const verifiedAttachment = (attachment) => {
    const m = attachment?.mediaRegistry;
    const valid = (value) => typeof value === "string" && value.length > 0 && value === value.trim() && value !== "[deleted]";
    if (!m || m.identityVerified !== true || ![m.cloudName, m.publicId, m.deliveryType, m.url].every(valid) ||
        !["image", "video", "raw"].includes(m.resourceType) || m.url !== attachment.url ||
        m.publicId !== attachment.publicId || m.resourceType !== attachment.resourceType ||
        m.deliveryType !== attachment.deliveryType) return null;
    const id = crypto.createHash("sha256").update(JSON.stringify([m.cloudName, m.publicId, m.resourceType, m.deliveryType])).digest("hex");
    return m.asset === id ? m : null;
};

const retireMessageAttachment = async (message, { session } = {}) => {
    if (!session?.inTransaction()) throw new Error("An active transaction is required");
    await fenceMediaCoverage({ session });
    const attachment = message.attachment;
    if (!attachment) return;
    const metadata = verifiedAttachment(attachment);
    await MediaCleanupRecord.updateOne({ _id: `attachment:${message._id}` }, { $setOnInsert: {
        user: message.sender, sourceType: "attachment", sourceId: message._id,
        url: attachment.url || null, publicId: attachment.publicId || null,
        resourceType: ["image", "video", "raw"].includes(attachment.resourceType) ? attachment.resourceType : null,
        deliveryType: attachment.deliveryType || null, cloudName: metadata?.cloudName || null,
        asset: metadata?.asset || null, status: metadata ? "review_required" : "unresolved"
    } }, { upsert: true, session });
    if (!metadata) await MediaCleanupRecord.updateOne({ _id: `attachment:${message._id}`, status: { $ne: "completed" } },
        { $set: { status: "unresolved" } }, { session });
    if (metadata) await removeAssetReference({ assetId: metadata.asset, sourceType: "attachment",
        sourceId: message._id, userId: message.sender, session });
};

export { verifiedAttachment, retireMessageAttachment };
