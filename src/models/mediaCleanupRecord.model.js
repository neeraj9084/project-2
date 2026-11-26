import mongoose from "mongoose";

const mediaCleanupRecordSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sourceType: { type: String, required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    url: { type: String, default: null },
    publicId: { type: String, default: null },
    cloudName: { type: String, default: null },
    resourceType: { type: String, enum: ["image", "video", "raw", null], default: null },
    deliveryType: { type: String, default: null },
    asset: { type: String, ref: "CloudinaryAsset", default: null, index: true },
    status: {
        type: String,
        enum: ["pending", "review_required", "unresolved", "processing", "completed", "failed"],
        default: "review_required"
    },
    retryCount: { type: Number, default: 0, min: 0 },
    nextRetryAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    leaseOwner: { type: String, default: null },
    leaseExpiresAt: { type: Date, default: null },
    claimToken: { type: String, default: null, select: false },
    claimFenceVersion: { type: Number, default: null },
    operationState: { type: String, enum: ["not_started", "uncertain"], default: "not_started" },
    retentionDecision: { type: String, enum: ["retain_shared", "retain_moderation", null], default: null },
    retentionVerifiedAt: { type: Date, default: null },
    retentionEvidence: { type: String, default: null, select: false }
}, { timestamps: true, versionKey: false });

mediaCleanupRecordSchema.index({ status: 1, nextRetryAt: 1, leaseExpiresAt: 1 });
mediaCleanupRecordSchema.index({ publicId: 1, resourceType: 1, deliveryType: 1 });

export const MediaCleanupRecord = mongoose.models.MediaCleanupRecord ||
    mongoose.model("MediaCleanupRecord", mediaCleanupRecordSchema);
