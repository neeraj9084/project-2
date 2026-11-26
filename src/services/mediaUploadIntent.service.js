import crypto from "node:crypto";
import mongoose from "mongoose";
import { MediaUploadIntent } from "../models/mediaUploadIntent.model.js";
import { CloudinaryAsset } from "../models/cloudinaryAsset.model.js";
import { MediaCleanupRecord } from "../models/mediaCleanupRecord.model.js";
import { fenceMediaCoverage } from "./mediaCoverageBarrier.service.js";

const transaction = async (fn) => { const session = await mongoose.startSession();
    try { return await session.withTransaction(() => fn(session)); } finally { await session.endSession(); } };
const nonempty = (v) => typeof v === "string" && v.length > 0 && v.trim() === v;

// Identity requested before the external operation is a recovery hint only.
// It is never treated as a verified Cloudinary identity without a response.
const performTrackedUpload = async ({ user, sourceId, sourceType, cloudName, upload }) => {
    if (!mongoose.isValidObjectId(user) || !mongoose.isValidObjectId(sourceId) || !nonempty(sourceType) || !nonempty(cloudName) || typeof upload !== "function") throw new Error("Upload tracking context is required");
    const id = crypto.randomUUID(); const plannedPublicId = `tracked_uploads/${id}`;
    await transaction(async (session) => { await fenceMediaCoverage({ session });
        await MediaUploadIntent.create([{ _id: id, user, sourceId, sourceType, cloudName, plannedPublicId, status: "started" }], { session }); });
    try {
        const response = await upload(plannedPublicId);
        if (!response || response.public_id !== plannedPublicId || !["image", "video", "raw"].includes(response.resource_type) ||
            !nonempty(response.type) || !nonempty(response.secure_url)) throw new Error("Upload response identity is unresolved");
        await transaction(async (session) => { await fenceMediaCoverage({ session });
            const result = await MediaUploadIntent.updateOne({ _id: id, status: "started" }, { $set: { publicId: response.public_id,
                resourceType: response.resource_type, deliveryType: response.type, url: response.secure_url, status: "uploaded" } }, { session });
            if (result.matchedCount !== 1) throw new Error("Upload intent changed"); });
        return response;
    } catch (error) {
        // Failure to write here leaves the original durable 'started' record.
        try { await transaction(async (session) => { await fenceMediaCoverage({ session });
            await MediaUploadIntent.updateOne({ _id: id, status: "started" }, { $set: { status: "uncertain" } }, { session }); }); } catch { /* original intent remains a blocker */ }
        throw error;
    }
};

const markUploadReferenced = async ({ metadata, kind, sourceId, user, session }) => {
    if (!session?.inTransaction()) throw new Error("An active transaction is required");
    await MediaUploadIntent.updateOne({ user, sourceId, sourceType: kind, cloudName: metadata.cloudName, publicId: metadata.publicId,
        resourceType: metadata.resourceType, deliveryType: metadata.deliveryType, url: metadata.url, status: "uploaded" },
        { $set: { status: "referenced" } }, { session });
};

// Explicit internal reconciliation. Uncertain outcomes stay blocked for review.
const reconcileUploadIntent = async (id, { session } = {}) => {
    if (!session?.inTransaction()) throw new Error("An active transaction is required");
    const intent = await MediaUploadIntent.findById(id).session(session).lean();
    if (!intent) throw new Error("Upload intent not found");
    if (intent.status === "review_required" || intent.status === "referenced") return intent.status;
    if (intent.status !== "uploaded") throw new Error("Upload outcome is uncertain; manual verification required");
    const { cloudName, publicId, resourceType, deliveryType, url } = intent;
    if (![cloudName, publicId, deliveryType, url].every(nonempty) || !["image", "video", "raw"].includes(resourceType) || publicId !== intent.plannedPublicId) throw new Error("Upload identity is unresolved");
    await fenceMediaCoverage({ session });
    const asset = crypto.createHash("sha256").update(JSON.stringify([cloudName, publicId, resourceType, deliveryType])).digest("hex");
    await CloudinaryAsset.updateOne({ _id: asset }, { $setOnInsert: { cloudName, publicId, resourceType, deliveryType, deletionStatus: "blocked" } }, { upsert: true, session });
    const registered = await CloudinaryAsset.findOne({ _id: asset, cloudName, publicId, resourceType, deliveryType, deletionStatus: "blocked", lifecycleStatus: { $in: ["active", null] } }).session(session).lean();
    if (!registered) throw new Error("Asset identity or lifecycle is unavailable");
    await MediaCleanupRecord.updateOne({ _id: `upload-intent:${id}` }, { $setOnInsert: { user: intent.user, sourceId: intent.sourceId,
        sourceType: intent.sourceType, asset, cloudName, publicId, resourceType, deliveryType, url, status: "review_required" } }, { upsert: true, session });
    const changed = await MediaUploadIntent.updateOne({ _id: id, status: "uploaded" }, { $set: { status: "review_required" } }, { session });
    if (changed.matchedCount !== 1) throw new Error("Upload intent changed");
    return "review_required";
};
export { performTrackedUpload, markUploadReferenced, reconcileUploadIntent };
