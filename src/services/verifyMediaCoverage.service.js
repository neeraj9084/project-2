import { MediaCoverageBarrier } from "../models/mediaCoverageBarrier.model.js";
import { CloudinaryAssetReference } from "../models/cloudinaryAssetReference.model.js";
import { MediaCleanupRecord } from "../models/mediaCleanupRecord.model.js";
import { AssetModerationHold } from "../models/assetModerationHold.model.js";
import { Moment } from "../models/moment.model.js";
import { Notification } from "../models/notification.model.js";
import { PendingUser } from "../models/pendingUser.model.js";
import { backfillMediaReferences } from "./backfillMediaReferences.service.js";
import { PendingMediaRetention } from "../models/pendingMediaRetention.model.js";
import { MediaUploadIntent } from "../models/mediaUploadIntent.model.js";
import crypto from "node:crypto";
import mongoose from "mongoose";

const sourceNames = ["users", "videos", "moments", "messages", "notifications", "conversations", "pendingUsers", "registryReferences", "moderationReports", "moderationCopyright"];

// Catalog reads are not transactional. This is diagnostic evidence only: an
// out-of-band DDL operation can occur immediately after either observation.
const inspectExpirationIndexEvidence = (indexes) => {
    const result = {};
    for (const [collection, name, field] of [["moments", "moment_expiration_scan", "expiresAt"], ["notifications", "notification_expiration_scan", "expiresAt"], ["pendingusers", "pending_user_expiration_scan", "verificationOtpExpiry"]]) {
        const list = indexes?.[collection];
        if (!Array.isArray(list)) throw new Error("Expiration index metadata unavailable");
        const ttlIndexes = list.filter((index) => index.key?.[field] && index.expireAfterSeconds !== undefined).map((index) => index.name).sort();
        const replacement = list.some((index) => index.name === name && JSON.stringify(index.key) === JSON.stringify({ [field]: 1, _id: 1 }) &&
            index.expireAfterSeconds === undefined && !index.partialFilterExpression && !index.sparse && !index.hidden && !index.collation);
        const catalog = list.map((index) => JSON.stringify(index)).sort();
        result[collection] = { replacement, ttlIndexes, catalog };
    }
    return { collections: result, fingerprint: crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex"),
        complete: Object.values(result).every((item) => item.replacement && !item.ttlIndexes.length) };
};

const readExpirationEvidence = async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error("Database unavailable");
    const lockBefore = await db.collection("_migration_locks").findOne({ _id: "expiration_indexes" });
    const stateBefore = await db.collection("_media_index_migration").findOne({ _id: "expiration_indexes" });
    const indexes = { moments: await Moment.collection.indexes(), notifications: await Notification.collection.indexes(), pendingusers: await PendingUser.collection.indexes() };
    const lockAfter = await db.collection("_migration_locks").findOne({ _id: "expiration_indexes" });
    const stateAfter = await db.collection("_media_index_migration").findOne({ _id: "expiration_indexes" });
    const migrationActive = Boolean(lockBefore || lockAfter || (stateBefore && stateBefore.status !== "complete") ||
        (stateAfter && stateAfter.status !== "complete") || stateBefore?.version !== stateAfter?.version);
    return { ...inspectExpirationIndexEvidence(indexes), migrationActive, migrationVersion: stateAfter?.version ?? null };
};

// Read-only diagnostic page. Independent pages do not constitute a snapshot
// or proof that all code paths participate in the fence.
const verifyMediaCoverage = async ({ cursors = {}, limit = 100 } = {}) => {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500 || !cursors || typeof cursors !== "object" || Array.isArray(cursors)) throw new Error("Invalid coverage verification options");
    const before = await MediaCoverageBarrier.findById("global").lean();
    const indexesBefore = await readExpirationEvidence();
    const pages = {};
    for (const source of sourceNames) pages[source] = await backfillMediaReferences({ source, cursor: cursors[source] ?? null, limit, dryRun: true });
    const [unresolvedHolds, activeHolds, incompleteRetention, unresolvedJobs, incompleteJobs, duplicateReferences, inconsistentJobs, orphanReferences, retainedPendingMedia, unresolvedUploads] = await Promise.all([
        AssetModerationHold.countDocuments({ status: "unresolved" }).maxTimeMS(30000),
        AssetModerationHold.countDocuments({ status: "active" }).maxTimeMS(30000),
        AssetModerationHold.countDocuments({ status: "active", $or: [{ asset: null }, { retentionUntil: null }, { retentionApprovedBy: null }] }).maxTimeMS(30000),
        MediaCleanupRecord.countDocuments({ status: "unresolved" }).maxTimeMS(30000),
        MediaCleanupRecord.countDocuments({ status: { $in: ["pending", "processing", "completed"] }, $or: [{ asset: null }, { cloudName: null }, { publicId: null }, { resourceType: null }, { deliveryType: null }] }).maxTimeMS(30000),
        CloudinaryAssetReference.aggregate([{ $group: { _id: { asset: "$asset", sourceType: "$sourceType", sourceId: "$sourceId", user: "$user" }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $count: "groups" }]).option({ maxTimeMS: 30000 }),
        MediaCleanupRecord.aggregate([{ $match: { asset: { $ne: null } } }, { $lookup: { from: "cloudinaryassets", localField: "asset", foreignField: "_id", as: "registry" } }, { $match: { $expr: { $or: [ { $ne: [{ $size: "$registry" }, 1] }, ...["cloudName", "publicId", "resourceType", "deliveryType"].map((field) => ({ $ne: [`$${field}`, { $arrayElemAt: [`$registry.${field}`, 0] }] })) ] } } }, { $count: "count" }]).option({ maxTimeMS: 30000 }),
        CloudinaryAssetReference.aggregate([{ $lookup: { from: "cloudinaryassets", localField: "asset", foreignField: "_id", as: "registry" } }, { $match: { "registry.0": { $exists: false } } }, { $count: "count" }]).option({ maxTimeMS: 30000 }),
        PendingMediaRetention.countDocuments({}).maxTimeMS(30000),
        MediaUploadIntent.countDocuments({ status: { $ne: "referenced" } }).maxTimeMS(30000)
    ]);
    const indexesAfter = await readExpirationEvidence();
    const after = await MediaCoverageBarrier.findById("global").lean();
    const fenceVersion = before?.fenceVersion;
    const stable = Number.isSafeInteger(fenceVersion) && fenceVersion === after?.fenceVersion;
    const indexStable = indexesBefore.complete && indexesAfter.complete && !indexesBefore.migrationActive && !indexesAfter.migrationActive && indexesBefore.fingerprint === indexesAfter.fingerprint && indexesBefore.migrationVersion === indexesAfter.migrationVersion;
    const ttlIndexes = Object.entries(indexesAfter.collections).flatMap(([collection, item]) => item.ttlIndexes.map((name) => ({ collection, name })));
    const blockingReasons = ["Reference-writing path coverage requires independent audit", "Backfill completion and isolated concurrency tests are not established", "Deletion eligibility is disabled"];
    if (!stable) blockingReasons.push("Coverage barrier is absent or changed during verification");
    if (Object.values(pages).some((page) => !page.complete || page.failed)) blockingReasons.push("One or more backfill audits have additional pages or failures");
    if (Object.values(pages).some((page) => page.unresolved || page.staleReferences || page.reviewRequired || page.linked || page.active)) blockingReasons.push("Missing, unresolved, stale or unbackfilled records require review");
    if (unresolvedHolds || incompleteRetention) blockingReasons.push("Moderation identities or retention approvals are incomplete");
    if (unresolvedJobs || incompleteJobs) blockingReasons.push("Cleanup queue records need identity or consistency review");
    if (duplicateReferences.length) blockingReasons.push("Duplicate asset references require review");
    if (inconsistentJobs.length || orphanReferences.length) blockingReasons.push("Cleanup records or references disagree with the asset registry");
    if (retainedPendingMedia) blockingReasons.push("Retained pending-registration media requires review");
    if (unresolvedUploads) blockingReasons.push("Unresolved upload intents require review");
    if (!indexStable) blockingReasons.push("Expiration index evidence is incomplete, changing, or migration is active");
    if (Object.values(cursors).some((cursor) => cursor != null)) blockingReasons.push("A resumed page alone cannot establish complete coverage");
    blockingReasons.push("Index evidence is non-transactional and cannot authorize deletion without coordinated DDL fencing");
    return { coverageComplete: false, stable, fenceVersion: stable ? fenceVersion : null, pages,
        statistics: { unresolvedHolds, activeHolds, incompleteRetention, unresolvedJobs, incompleteJobs, duplicateReferenceGroups: duplicateReferences[0]?.groups || 0,
            inconsistentJobs: inconsistentJobs[0]?.count || 0, orphanReferences: orphanReferences[0]?.count || 0, retainedPendingMedia, unresolvedUploads },
        expiration: { ttlIndexes, indexStable, indexEvidence: indexesAfter, notificationSchedulerEnabled: false, momentSchedulerEnabled: false }, blockingReasons };
};

export { verifyMediaCoverage, inspectExpirationIndexEvidence };
