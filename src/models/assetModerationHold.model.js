import mongoose from "mongoose";

const schema = new mongoose.Schema({
    _id: { type: String, required: true },
    caseType: { type: String, enum: ["report", "copyright"], required: true },
    caseId: { type: mongoose.Schema.Types.ObjectId, required: true },
    video: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    slot: { type: String, enum: ["video", "thumbnail"], required: true },
    asset: { type: String, ref: "CloudinaryAsset", default: null },
    status: { type: String, enum: ["active", "unresolved", "released"], required: true },
    retentionUntil: { type: Date, default: null },
    retentionApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    approvalReason: { type: String, default: null, maxlength: 500 },
    releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    releasedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });
schema.index({ caseType: 1, caseId: 1, slot: 1 }, { unique: true });
schema.index({ asset: 1, status: 1 });
export const AssetModerationHold = mongoose.models.AssetModerationHold || mongoose.model("AssetModerationHold", schema);
