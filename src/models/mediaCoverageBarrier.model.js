import mongoose from "mongoose";

// Globally blocked until an independently verified coverage protocol exists.
const schema = new mongoose.Schema({
    _id: { type: String, default: "global" },
    fenceVersion: { type: Number, default: 0, min: 0 },
    coverageStatus: { type: String, enum: ["blocked"], default: "blocked" },
    verifiedVersion: { type: Number, default: null },
    verifiedAt: { type: Date, default: null },
    testRelease: { type: Boolean, default: false },
    testApprovalId: { type: String, default: null },
    testReservationFence: { type: Number, default: 0 }
}, { versionKey: false, timestamps: true });

export const MediaCoverageBarrier = mongoose.models.MediaCoverageBarrier || mongoose.model("MediaCoverageBarrier", schema);
