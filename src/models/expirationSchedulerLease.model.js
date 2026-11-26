import mongoose from "mongoose";

const schema = new mongoose.Schema({
    _id: { type: String, default: "expiration" },
    token: { type: String, default: null, select: false },
    fenceVersion: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null },
    retryCount: { type: Number, default: 0 },
    nextRetryAt: { type: Date, default: null },
    suspended: { type: Boolean, default: false },
    lastError: { type: String, default: null },
    lastCompletedAt: { type: Date, default: null }
}, { versionKey: false, timestamps: true });
export const ExpirationSchedulerLease = mongoose.models.ExpirationSchedulerLease || mongoose.model("ExpirationSchedulerLease", schema);
