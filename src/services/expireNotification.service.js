import mongoose from "mongoose";
import { Notification } from "../models/notification.model.js";
import { removeNotificationThumbnails } from "./notificationThumbnailRegistry.service.js";

// The caller owns the transaction, including retries and commit.
const expireNotification = async (notificationId, { session, asOf = new Date() } = {}) => {
    if (!mongoose.isValidObjectId(notificationId)) throw new Error("Invalid notification ID");
    if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required");
    if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime()) || asOf > new Date()) throw new Error("Invalid expiration cutoff");
    const filter = { _id: notificationId, expiresAt: { $type: "date", $lte: asOf } };
    const notification = await Notification.findOne(filter).select("+mediaRegistry").session(session).lean();
    if (!notification) return false;
    await removeNotificationThumbnails([notification], { session });
    const deleted = await Notification.deleteOne(filter, { session });
    if (deleted.deletedCount !== 1) throw new Error("Notification changed during expiration");
    return true;
};

// No scheduler invokes this function. Persist both asOf and nextCursor to
// resume the same scan; repeat from the beginning for later/backdated expiry.
const expireNotificationPage = async ({ cursor = null, limit = 100, dryRun = true, asOf = new Date() } = {}) => {
    if (typeof dryRun !== "boolean" || !Number.isSafeInteger(limit) || limit < 1 || limit > 500 ||
        !(asOf instanceof Date) || !Number.isFinite(asOf.getTime()) || asOf > new Date() ||
        (cursor !== null && (typeof cursor !== "string" || !/^[0-9a-f]{24}$/i.test(cursor)))) {
        throw new Error("Invalid notification expiration options");
    }
    const filter = { expiresAt: { $type: "date", $lte: asOf } };
    if (cursor) filter._id = { $gt: new mongoose.Types.ObjectId(cursor) };
    const candidates = await Notification.find(filter).select("_id").sort({ _id: 1 }).limit(limit + 1).lean();
    const result = { dryRun, asOf: asOf.toISOString(), scanned: 0, expired: 0, skipped: 0,
        failed: 0, failures: [], complete: false, nextCursor: null };
    let lastCursor = cursor;
    for (const item of candidates.slice(0, limit)) {
        try {
            if (dryRun) result.expired++;
            else {
                const session = await mongoose.startSession();
                let expired = false;
                try { await session.withTransaction(async () => { expired = await expireNotification(item._id, { session, asOf }); }); }
                finally { await session.endSession(); }
                if (expired) result.expired++; else result.skipped++;
            }
            result.scanned++;
            lastCursor = String(item._id);
        } catch (error) {
            result.failed++;
            result.failures.push({ notificationId: String(item._id), message: error.message });
            result.nextCursor = lastCursor;
            return result;
        }
    }
    result.complete = candidates.length <= limit;
    result.nextCursor = result.complete ? null : lastCursor;
    return result;
};

export {
     expireNotification,
     expireNotificationPage 
    };
