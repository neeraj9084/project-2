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
import { CloudinaryAssetReference } from "../models/cloudinaryAssetReference.model.js";
import { registerAssetReference } from "./cloudinaryAssetReference.service.js";
import { backfillModerationHolds } from "./backfillModerationHolds.service.js";
import { fenceMediaCoverage } from "./mediaCoverageBarrier.service.js";
import { messageAttachments } from "./messageAttachmentRegistry.service.js";

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
        ["attachment", "attachment.url", "attachment.publicId", "attachment.deliveryType"],
        ["attachment", "attachments.1.url", "attachments.1.publicId", "attachments.1.deliveryType"]
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
const registryPath = (source, slot, urlPath) => source === "messages" ? (urlPath.startsWith("attachments.1.") ? "attachments.1.mediaRegistry" : "attachment.mediaRegistry")
    : source === "notifications" ? "mediaRegistry.thumbnail" : `mediaRegistry.${slot}`;

const inspectSlot = (document, source, slot, owner) => {
    const [name, urlPath, publicIdPath, deliveryTypePath] = slot;
    const url = valueAt(document, urlPath);
    const path = registryPath(source, name, urlPath);
    const metadata = valueAt(document, path) || {};
    // Notification thumbnail aliases share metadata; do not treat an absent
    // alias as a second reference to the same asset.
    if (source === "notifications" && !url && (document.data?.videoThumbnail || document.data?.thumbnail)) return null;
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
        (source !== "messages" || !valueAt(document, urlPath.replace(/\.url$/, ".resourceType")) || valueAt(document, urlPath.replace(/\.url$/, ".resourceType")) === identity.resourceType) &&
        mongoose.isValidObjectId(owner);
    const assetId = verified ? crypto.createHash("sha256").update(JSON.stringify([
        identity.cloudName, identity.publicId, identity.resourceType, identity.deliveryType
    ])).digest("hex") : null;
    return { name, path, identity, assetId, verified: verified && (!metadata.asset || metadata.asset === assetId) };
};

// Read-only reconciliation: orphaned or ambiguous references are retained
// until an independent review establishes retention and ownership.
const auditRegistryReferences = async ({ cursor, limit = 100, dryRun = true } = {}) => {
    if (typeof dryRun !== "boolean" || !Number.isSafeInteger(limit) || limit < 1 || limit > 500 ||
        (cursor != null && (typeof cursor !== "string" || !/^[a-f0-9]{64}$/.test(cursor)))) throw new Error("Invalid registry audit options");
    const refs = await CloudinaryAssetReference.find(cursor ? { _id: { $gt: cursor } } : {})
        .sort({ _id: 1 }).limit(limit + 1).lean();
    const page = refs.slice(0, limit);
    const stats = { source: "registryReferences", dryRun, scanned: 0, matching: 0, reviewRequired: 0,
        moderationReferences: 0, coverageComplete: false, complete: refs.length <= limit,
        nextCursor: refs.length > limit ? page[page.length - 1]._id : null };
    for (const ref of page) {
        stats.scanned++;
        if (ref.sourceType.startsWith("moderation_")) { stats.moderationReferences++; continue; }
        let matches = 0;
        for (const [name, config] of Object.entries(sources)) {
            const applicable = config.slots.filter((slot) => slot[0] === ref.sourceType);
            if (!applicable.length) continue;
            const document = await config.model.collection.findOne({ _id: ref.sourceId });
            if (!document) continue;
            if (name === "messages") { try { messageAttachments(document); } catch { continue; } }
            for (const slot of applicable) {
                const entry = inspectSlot(document, name, slot, config.owner(document));
                if (entry?.verified && entry.assetId === ref.asset && String(config.owner(document)) === String(ref.user)) matches++;
            }
        }
        if (matches === 1) stats.matching++;
        else stats.reviewRequired++;
    }
    return stats;
};

// One page per call; callers persist nextCursor after each successful page.
// No coverage-complete flag is set here: controllers still need integration.
const backfillMediaReferences = async ({ source, cursor, limit = 100, dryRun = true, transactionGuard } = {}) => {
    if (source === "registryReferences") return auditRegistryReferences({ cursor, limit, dryRun });
    if (source === "moderationReports" || source === "moderationCopyright") {
        const result = await backfillModerationHolds({ caseType: source === "moderationReports" ? "report" : "copyright", cursor, limit, dryRun, transactionGuard });
        return { ...result, source, coverageComplete: false };
    }
    const config = sources[source];
    if (!config || !Number.isSafeInteger(limit) || limit < 1 || limit > 500 ||
        typeof dryRun !== "boolean" || (cursor != null && (typeof cursor !== "string" || !/^[a-f0-9]{24}$/i.test(cursor)))) {
        throw new Error("Invalid media backfill options");
    }
    const filter = cursor ? { _id: { $gt: new mongoose.Types.ObjectId(cursor) } } : {};
    const docs = await config.model.collection.find(filter).sort({ _id: 1 }).limit(limit + 1).toArray();
    const page = docs.slice(0, limit);
    const stats = { source, scanned: 0, linked: 0, existing: 0, unresolved: 0,
        staleReferences: 0, failed: 0, failures: [], dryRun, coverageComplete: false,
        complete: false, nextCursor: null };
    let lastCursor = cursor || null;

    for (const initial of page) {
        const process = async (document, session) => {
            if (!document) throw new Error("Source document no longer exists");
            if (session && transactionGuard) await transactionGuard(session);
            if (session && !transactionGuard && await mongoose.connection.db.collection("_migration_locks").findOne({ _id: "expiration_indexes" }, { session })) throw new Error("Coordinated migration or backfill is active");
            if (session && !transactionGuard && await mongoose.connection.db.collection("_media_index_migration").findOne({ _id: "expiration_indexes", status: { $ne: "complete" } }, { session })) throw new Error("Unresolved index migration blocks backfill");
            if (session) await fenceMediaCoverage({ session });
            const counts = { linked: 0, existing: 0, unresolved: 0, staleReferences: 0 };
            const owner = config.owner(document);
            if (source === "messages") messageAttachments(document);
            for (const slot of config.slots) {
                const entry = inspectSlot(document, source, slot, owner);
                if (!entry) continue;
                const referencesQuery = CloudinaryAssetReference.find({ sourceType: entry.name, sourceId: document._id }).lean();
                if (session) referencesQuery.session(session);
                const references = await referencesQuery;
                const currentReference = entry.verified && references.some((ref) => ref.asset === entry.assetId && String(ref.user) === String(owner));
                // Do not remove references merely because the current source differs:
                // they may protect historical media or an in-flight migration.
                const validEntries = config.slots.map((candidate) => inspectSlot(document, source, candidate, owner)).filter((candidate) => candidate?.verified);
                counts.staleReferences += references.filter((ref) => !validEntries.some((candidate) => ref.asset === candidate.assetId) || String(ref.user) !== String(owner)).length;
                if (!entry.verified) {
                    counts.unresolved++;
                    if (session) await config.model.collection.updateOne({ _id: document._id },
                        { $set: { [`${entry.path}.status`]: "unresolved", ...(source === "messages" && slot[1] === "attachment.url" && document.attachments?.length ? { "attachments.0.mediaRegistry.status": "unresolved" } : {}) } }, { session });
                    continue;
                }
                counts[currentReference ? "existing" : "linked"]++;
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
                if (source === "messages" && slot[1] === "attachment.url" && document.attachments?.length) {
                    updates["attachments.0.mediaRegistry.asset"] = entry.assetId;
                    updates["attachments.0.mediaRegistry.status"] = "linked";
                }
                if (source === "conversations") updates[`${entry.path}.referenceUser`] = owner;
                await config.model.collection.updateOne({ _id: document._id },
                    { $set: updates },
                    { session });
            }
            return counts;
        };
        try {
            let counts;
            if (dryRun) counts = await process(initial, null);
            else {
                const session = await mongoose.startSession();
                try { await session.withTransaction(async () => {
                    const document = await config.model.collection.findOne({ _id: initial._id }, { session });
                    counts = await process(document, session);
                }); } finally { await session.endSession(); }
            }
            for (const key of ["linked", "existing", "unresolved", "staleReferences"]) stats[key] += counts[key];
            stats.scanned++;
            lastCursor = String(initial._id);
        } catch (error) {
            stats.failed++;
            stats.failures.push({ sourceId: String(initial._id), message: error.message });
            stats.nextCursor = lastCursor;
            return stats;
        }
    }
    stats.complete = docs.length <= limit;
    stats.nextCursor = stats.complete ? null : lastCursor;
    return stats;
};

export { backfillMediaReferences };
