import crypto from "crypto";
import { getCloudinaryCloudName } from "../utils/cloudinary.js";
import { CloudinaryAsset } from "../models/cloudinaryAsset.model.js";
import { MediaCleanupRecord } from "../models/mediaCleanupRecord.model.js";
import { registerAssetReference, removeAssetReference } from "./cloudinaryAssetReference.service.js";

const valid = (v) => typeof v === "string" && v.trim() === v && v.length > 0;

// Cloud name comes from the configuration used for this upload, never from a URL.
const videoUploadIdentity = (upload, expectedType) => {
    const cloudName = getCloudinaryCloudName();
    const { public_id: publicId, resource_type: resourceType, type: deliveryType, secure_url: url } = upload || {};
    if (![cloudName, publicId, resourceType, deliveryType, url].every(valid) || resourceType !== expectedType) {
        throw new Error("Cloudinary upload did not provide a complete verified identity");
    }
    const asset = crypto.createHash("sha256").update(JSON.stringify([cloudName, publicId, resourceType, deliveryType])).digest("hex");
    return { asset, cloudName, publicId, resourceType, deliveryType, url, identityVerified: true, status: "linked" };
};

const registerVideoMedia = async ({ metadata, kind, videoId, owner, session }) => {
    if (!session?.inTransaction()) throw new Error("An active transaction is required");
    const { asset, cloudName, publicId, resourceType, deliveryType } = metadata;
    await CloudinaryAsset.updateOne({ _id: asset }, { $setOnInsert: {
        cloudName, publicId, resourceType, deliveryType, deletionStatus: "blocked"
    } }, { upsert: true, session });
    const stored = await CloudinaryAsset.findById(asset).session(session).lean();
    if (!stored || stored.cloudName !== cloudName || stored.publicId !== publicId ||
        stored.resourceType !== resourceType || stored.deliveryType !== deliveryType) throw new Error("Asset identity conflict");
    await registerAssetReference({ assetId: asset, sourceType: kind, sourceId: videoId, userId: owner, session });
};

const queueVideoMedia = async ({ metadata, kind, videoId, owner, session, suffix = "removed" }) => {
    const publicId = metadata?.publicId || null;
    const resourceType = ["video", "image", "raw"].includes(metadata?.resourceType) ? metadata.resourceType : null;
    const deliveryType = metadata?.deliveryType || null;
    const verified = metadata?.identityVerified === true && metadata?.asset && metadata?.cloudName && publicId && resourceType && deliveryType;
    const existingAsset = verified ? await CloudinaryAsset.exists({ _id: metadata.asset }).session(session || null) : null;
    const key = crypto.createHash("sha256").update(JSON.stringify([String(videoId), kind, suffix, metadata?.asset || null, metadata?.url || null, publicId])).digest("hex");
    await MediaCleanupRecord.updateOne({ _id: `video-media:${key}` }, { $setOnInsert: {
        user: owner, sourceType: kind, sourceId: videoId, url: metadata?.url || null,
        publicId, resourceType, deliveryType, cloudName: verified ? metadata.cloudName : null,
        asset: existingAsset ? metadata.asset : null,
        status: verified ? "review_required" : "unresolved"
    } }, { upsert: true, ...(session ? { session } : {}) });
};

const unregisterVideoMedia = async ({ metadata, kind, videoId, owner, session }) => {
    if (metadata?.asset && metadata.identityVerified === true) {
        await removeAssetReference({ assetId: metadata.asset, sourceType: kind, sourceId: videoId, userId: owner, session });
    }
};

export { videoUploadIdentity, registerVideoMedia, queueVideoMedia, unregisterVideoMedia };
