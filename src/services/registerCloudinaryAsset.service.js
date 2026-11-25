import crypto from "crypto";
import { CloudinaryAsset } from "../models/cloudinaryAsset.model.js";
import { MediaCleanupRecord } from "../models/mediaCleanupRecord.model.js";

// The caller must verify the Cloudinary environment; it is never inferred from a URL.
const registerCleanupAsset = async (recordId, { cloudName, session } = {}) => {
    if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required");
    if (typeof recordId !== "string" || !recordId) throw new Error("Cleanup record ID is required");
    if (typeof cloudName !== "string" || !cloudName.trim() || cloudName !== cloudName.trim()) {
        throw new Error("Verified Cloudinary environment is required");
    }

    const record = await MediaCleanupRecord.findById(recordId).session(session).lean();
    if (!record) throw new Error("Cleanup record not found");
    const { publicId, resourceType, deliveryType } = record;
    if (typeof publicId !== "string" || !publicId.trim() || publicId !== publicId.trim() ||
        publicId === "[deleted]" || !["image", "video", "raw"].includes(resourceType) ||
        typeof deliveryType !== "string" || !deliveryType.trim() || deliveryType !== deliveryType.trim()) {
        throw new Error("Cleanup record has unresolved asset identifiers");
    }

    const identity = { cloudName, publicId, resourceType, deliveryType };
    const assetId = crypto.createHash("sha256")
        .update(JSON.stringify([cloudName, publicId, resourceType, deliveryType]))
        .digest("hex");
    if (record.asset && record.asset !== assetId) {
        throw new Error("Cleanup record is already linked to a different asset");
    }

    await CloudinaryAsset.updateOne(
        { _id: assetId },
        { $setOnInsert: { ...identity, deletionStatus: "blocked" } },
        { upsert: true, session }
    );
    const asset = await CloudinaryAsset.findById(assetId).session(session).lean();
    if (!asset || Object.keys(identity).some((key) => asset[key] !== identity[key])) {
        throw new Error("Asset identity conflict");
    }

    const result = await MediaCleanupRecord.updateOne(
        { _id: recordId, $or: [{ asset: null }, { asset: assetId }] },
        { $set: { asset: assetId } },
        { session }
    );
    if (result.matchedCount !== 1) throw new Error("Cleanup record asset link changed");
    return { assetId, deletionStatus: "blocked" };
};

// Explicit one-record backfill entry point; no migration is run automatically.
const backfillCleanupAsset = registerCleanupAsset;

export { registerCleanupAsset, backfillCleanupAsset };
