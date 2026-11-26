import mongoose from "mongoose";

const schema = new mongoose.Schema({
    _id: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sourceType: { type: String, required: true },
    cloudName: { type: String, required: true },
    plannedPublicId: { type: String, required: true },
    publicId: String, resourceType: String, deliveryType: String, url: String,
    status: { type: String, enum: ["started", "uncertain", "uploaded", "referenced", "review_required"], required: true }
}, { timestamps: true, versionKey: false });
schema.index({ cloudName: 1, plannedPublicId: 1 }, { unique: true });
schema.index({ status: 1, updatedAt: 1 });
export const MediaUploadIntent = mongoose.models.MediaUploadIntent || mongoose.model("MediaUploadIntent", schema);
