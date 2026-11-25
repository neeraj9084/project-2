import crypto from "crypto";
import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js";
import { Moment } from "../models/moment.model.js";
import { Message } from "../models/message.model.js";
import { Conversation } from "../models/conversation.model.js";
import { PendingUser } from "../models/pendingUser.model.js";
import { Notification } from "../models/notification.model.js";
import { CloudinaryAsset } from "../models/cloudinaryAsset.model.js";
import { registerAssetReference } from "./cloudinaryAssetReference.service.js";

// Only trusted internal verification may set identityVerified. URLs and the
// currently configured Cloudinary environment are never evidence of identity.
const sources = {
    users: { model: User, owner: (d) => d._id, slots: [
        ["avatar", "avatar", "avatarPublicId", "avatarDeliveryType"],
        ["coverImage", "coverImage", "coverImagePublicId", "coverImageDeliveryType"]
    ] },
    videos: { model: Video, owner: (d) => d.owner, slots: [
        ["video", "videoFile", "videoPublicId", "videoDeliveryType"],
        ["thumbnail", "thumbnail", "thumbnailPublicId", "thumbnailDeliveryType"]
    ] },
    moments: { model: Moment, owner: (d) => d.owner, slots: [
        ["moment", "mediaUrl", "mediaPublicId", "mediaDeliveryType"]
    ] },
    messages: { model: Message, owner: (d) => d.sender, slots: [
        ["attachment", "attachment.url", "attachment.publicId", "attachment.deliveryType"]
    ] },
    notifications: { model: Notification, owner: (d) => d.recipient, slots: [
        ["notificationThumbnail", "data.videoThumbnail", null, null],
        ["notificationThumbnail", "data.thumbnail", null, null]
    ] },
    conversations: { model: Conversation, owner: (d) => d.mediaRegistry?.avatar?.referenceUser || d.createdBy, slots: [
        ["avatar", "avatar", null, null]
    ] },
    // Pending registrations have no User ObjectId; retain them as unresolved.
    pendingUsers: { model: PendingUser, owner: () => null, slots: [
        ["avatar", "avatar", null, null], ["coverImage", "coverImage", null, null]
    ] }
};

const valueAt = (object, path) => path?.split(".").reduce((value, key) => value?.[key], object);
const validString = (value) => typeof value === "string" && value.length > 0 &&
    value === value.trim() && value !== "[deleted]";
const registryPath = (source, slot) => source === "messages" ? "attachment.mediaRegistry"
    : source === "notifications" ? "mediaRegistry.thumbnail" : `mediaRegistry.${slot}`;

const inspectSlot = (document, source, slot, owner) => {
    const [name, urlPath, publicIdPath, deliveryTypePath] = slot;
    const url = valueAt(document, urlPath);
    const path = registryPath(source, name);
    const metadata = valueAt(document, path) || {};
    if (!url && !valueAt(document, publicIdPath) && !metadata.publicId && !metadata.asset) return null;
    const identity = {
        cloudName: metadata.cloudName,
        publicId: publicIdPath ? valueAt(document, publicIdPath) : metadata.publicId,
        resourceType: metadata.resourceType,
        deliveryType: deliveryTypePath ? valueAt(document, deliveryTypePath) : metadata.deliveryType
    };
    const verified = metadata.identityVerified === true && validString(identity.cloudName) &&
        validString(identity.publicId) && ["image", "video", "raw"].includes(identity.resourceType) &&
        validString(identity.deliveryType) && validString(url) && metadata.url === url &&
        metadata.publicId === identity.publicId && metadata.deliveryType === identity.deliveryType &&
        (source !== "moments" || !document.mediaResourceType || document.mediaResourceType === identity.resourceType) &&
        (source !== "messages" || !document.attachment?.resourceType || document.attachment.resourceType === identity.resourceType) &&
        mongoose.isValidObjectId(owner);
    const assetId = verified ? crypto.createHash("sha256").update(JSON.stringify([
        identity.cloudName, identity.publicId, identity.resourceType, identity.deliveryType
    ])).digest("hex") : null;
    return { name, path, identity, assetId, verified: verified && (!metadata.asset || metadata.asset === assetId) };
};

// One page per call; callers persist nextCursor after each successful page.
// No coverage-complete flag is set here: controllers still need integration.
const backfillMediaReferences = async ({ source, cursor, limit = 100, dryRun = true } = {}) => {
    const config = sources[source];
    if (!config || !Number.isSafeInteger(limit) || limit < 1 || limit > 500 ||
        typeof dryRun !== "boolean" || (cursor && !mongoose.isValidObjectId(cursor))) {
        throw new Error("Invalid media backfill options");
    }
    const filter = cursor ? { _id: { $gt: new mongoose.Types.ObjectId(cursor) } } : {};
    const docs = await config.model.collection.find(filter).sort({ _id: 1 }).limit(limit + 1).toArray();
    const page = docs.slice(0, limit);
    const stats = { scanned: 0, linked: 0, unresolved: 0, dryRun, coverageComplete: false,
        nextCursor: docs.length > limit ? String(page[page.length - 1]._id) : null };

    for (const initial of page) {
        const process = async (document, session) => {
            if (!document) return;
            const owner = config.owner(document);
            for (const slot of config.slots) {
                const entry = inspectSlot(document, source, slot, owner);
                if (!entry) continue;
                if (!entry.verified) {
                    stats.unresolved++;
                    if (session) await config.model.collection.updateOne({ _id: document._id },
                        { $set: { [`${entry.path}.status`]: "unresolved" } }, { session });
                    continue;
                }
                stats.linked++;
                if (!session) continue;
                await CloudinaryAsset.updateOne({ _id: entry.assetId },
                    { $setOnInsert: { ...entry.identity, deletionStatus: "blocked" } },
                    { upsert: true, session });
                const asset = await CloudinaryAsset.findById(entry.assetId).session(session).lean();
                if (!asset || Object.keys(entry.identity).some((key) => asset[key] !== entry.identity[key])) {
                    throw new Error("Asset identity conflict");
                }
                await registerAssetReference({ assetId: entry.assetId, sourceType: entry.name,
                    sourceId: document._id, userId: owner, session });
                const updates = { [`${entry.path}.asset`]: entry.assetId, [`${entry.path}.status`]: "linked" };
                if (source === "conversations") updates[`${entry.path}.referenceUser`] = owner;
                await config.model.collection.updateOne({ _id: document._id },
                    { $set: updates },
                    { session });
            }
        };
        if (dryRun) await process(initial, null);
        else {
            const session = await mongoose.startSession();
            try {
                // Do not count failed/retried transactions more than once.
                const before = { linked: stats.linked, unresolved: stats.unresolved };
                await session.withTransaction(async () => {
                    stats.linked = before.linked;
                    stats.unresolved = before.unresolved;
                    const document = await config.model.collection.findOne({ _id: initial._id }, { session });
                    await process(document, session);
                });
            } finally { await session.endSession(); }
        }
        stats.scanned++;
    }
    return stats;
};

export { backfillMediaReferences };
