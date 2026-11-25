import mongoose from "mongoose";

// Private, trusted provenance. Verification must describe the exact source value.
export const mediaReferenceSchema = new mongoose.Schema({
    asset: { type: String, ref: "CloudinaryAsset" },
    referenceUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cloudName: String,
    publicId: String,
    resourceType: { type: String, enum: ["image", "video", "raw"] },
    deliveryType: String,
    url: String,
    identityVerified: { type: Boolean, default: false },
    status: { type: String, enum: ["linked", "unresolved"] }
}, { _id: false });

export const mediaRegistrySchema = new mongoose.Schema({
    avatar: mediaReferenceSchema,
    coverImage: mediaReferenceSchema,
    video: mediaReferenceSchema,
    thumbnail: mediaReferenceSchema,
    moment: mediaReferenceSchema
}, { _id: false });
