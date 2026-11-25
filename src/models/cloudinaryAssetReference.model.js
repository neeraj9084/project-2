import mongoose from "mongoose";

const cloudinaryAssetReferenceSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    asset: { type: String, ref: "CloudinaryAsset", required: true, index: true },
    sourceType: { type: String, required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true, versionKey: false });

cloudinaryAssetReferenceSchema.index(
    { asset: 1, sourceType: 1, sourceId: 1, user: 1 },
    { unique: true, name: "asset_source_reference" }
);

export const CloudinaryAssetReference = mongoose.models.CloudinaryAssetReference ||
    mongoose.model("CloudinaryAssetReference", cloudinaryAssetReferenceSchema);
