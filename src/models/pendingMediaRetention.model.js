import mongoose from "mongoose";

// Pending registrations have no User owner. Never enqueue these as deletable.
const schema = new mongoose.Schema({
    _id: { type: String, required: true },
    pendingUser: { type: mongoose.Schema.Types.ObjectId, required: true },
    slot: { type: String, enum: ["avatar", "coverImage"], required: true },
    url: String,
    metadata: mongoose.Schema.Types.Mixed,
    status: { type: String, enum: ["unresolved", "review_required"], required: true }
}, { timestamps: true, versionKey: false });
export const PendingMediaRetention = mongoose.models.PendingMediaRetention || mongoose.model("PendingMediaRetention", schema);
