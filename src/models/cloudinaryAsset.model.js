import mongoose from "mongoose";

const cloudinaryAssetSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    cloudName: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ["image", "video", "raw"], required: true },
    deliveryType: { type: String, required: true },
    // Asset eligibility is deliberately unavailable until the protection phases exist.
    deletionStatus: { type: String, enum: ["blocked"], default: "blocked" },
    fenceVersion: { type: Number, default: 0, min: 0 },
    lifecycleStatus: {
        type: String,
        enum: ["active", "deletion_reserved", "deletion_in_progress", "deleted"],
        default: "active"
    },
    reservationToken: { type: String, default: null, select: false },
    leaseExpiresAt: { type: Date, default: null },
    cleanupLeaseToken: { type: String, default: null, select: false },
    cleanupLeaseExpiresAt: { type: Date, default: null },
    cleanupFenceVersion: { type: Number, default: 0, min: 0 }
}, { timestamps: true, versionKey: false });

cloudinaryAssetSchema.index(
    { cloudName: 1, publicId: 1, resourceType: 1, deliveryType: 1 },
    { unique: true, name: "cloudinary_asset_identity" }
);

export const CloudinaryAsset = mongoose.models.CloudinaryAsset ||
    mongoose.model("CloudinaryAsset", cloudinaryAssetSchema);
