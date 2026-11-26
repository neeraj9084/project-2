import mongoose from "mongoose";

// Internal isolated-test evidence only; no public routes expose this model.
const schema = new mongoose.Schema({
    _id: { type: String, required: true },
    scope: { type: String, enum: ["global"], required: true },
    verificationVersion: { type: Number, required: true },
    approvedVersion: { type: Number, required: true },
    approvedAt: { type: Date, required: true },
    evidence: { type: mongoose.Schema.Types.Mixed, required: true },
    status: { type: String, enum: ["test_approved", "invalidated"], required: true },
    invalidatedAt: { type: Date, default: null },
    invalidationReason: { type: String, default: null }
}, { versionKey: false, timestamps: true });
export const MediaCoverageApproval = mongoose.models.MediaCoverageApproval || mongoose.model("MediaCoverageApproval", schema);
