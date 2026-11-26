import mongoose from "mongoose";
import { PendingUser } from "../models/pendingUser.model.js";
import { PendingMediaRetention } from "../models/pendingMediaRetention.model.js";
import { fenceMediaCoverage } from "./mediaCoverageBarrier.service.js";
import { verifiedAttachment } from "./messageAttachmentRegistry.service.js";

// Retain media without inventing a User owner or removing a shared reference.
const retirePendingUser = async (pendingId, { session, expiredOnly = false, now = new Date(), expectedOtp } = {}) => {
    if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required");
    if (!mongoose.isValidObjectId(pendingId)) throw new Error("Invalid pending user ID");
    const filter = { _id: pendingId, ...(expiredOnly ? { verificationOtpExpiry: { $lte: now } } : {}),
        ...(expectedOtp !== undefined ? { verificationOtp: expectedOtp, isEmailVerified: false } : {}) };
    const pending = await PendingUser.findOne(filter).select("+mediaRegistry").session(session).lean();
    if (!pending) return false;
    await fenceMediaCoverage({ session });
    for (const slot of ["avatar", "coverImage"]) {
        const url = pending[slot]; const metadata = pending.mediaRegistry?.[slot];
        if (!url && !metadata) continue;
        const verified = verifiedAttachment({ url, publicId: metadata?.publicId, resourceType: metadata?.resourceType,
            deliveryType: metadata?.deliveryType, mediaRegistry: metadata });
        await PendingMediaRetention.updateOne({ _id: `${pending._id}:${slot}` }, { $setOnInsert: {
            pendingUser: pending._id, slot, url: url || null, metadata: metadata || null,
            status: verified ? "review_required" : "unresolved"
        } }, { upsert: true, session });
    }
    const deleted = await PendingUser.deleteOne(filter, { session });
    if (deleted.deletedCount !== 1) throw new Error("Pending registration changed during retirement");
    return true;
};

const expirePendingUser = (pendingId, options = {}) => retirePendingUser(pendingId, { ...options, expiredOnly: true });
export { retirePendingUser, expirePendingUser };
