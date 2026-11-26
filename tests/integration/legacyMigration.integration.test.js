import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { openTestDatabase, closeTestDatabase } from "./testDatabase.js";
import { backfillMediaReferences } from "../../src/services/backfillMediaReferences.service.js";
import { verifyMediaCoverage } from "../../src/services/verifyMediaCoverage.service.js";
import { migrateExpirationIndexes } from "../../scripts/prepareExpirationIndexes.js";
import { fenceMediaCoverage } from "../../src/services/mediaCoverageBarrier.service.js";
import { approveEmptyTestCoverage } from "../../src/services/testMediaCoverageApproval.service.js";
import { MediaUploadIntent } from "../../src/models/mediaUploadIntent.model.js";
import { PendingMediaRetention } from "../../src/models/pendingMediaRetention.model.js";
import { CloudinaryAsset } from "../../src/models/cloudinaryAsset.model.js";
import { CloudinaryAssetReference } from "../../src/models/cloudinaryAssetReference.model.js";
import { MediaCleanupRecord } from "../../src/models/mediaCleanupRecord.model.js";
import { MediaCoverageBarrier } from "../../src/models/mediaCoverageBarrier.model.js";
import { MediaCoverageApproval } from "../../src/models/mediaCoverageApproval.model.js";
import { AssetModerationHold } from "../../src/models/assetModerationHold.model.js";
import { ExpirationSchedulerLease } from "../../src/models/expirationSchedulerLease.model.js";

test("synthetic legacy backfill and TTL migration remain fail-closed", { skip: !process.env.TEST_MONGODB_URI && "TEST_MONGODB_URI is not configured" }, async (t) => {
    const owned = await openTestDatabase();
    try {
        const db = mongoose.connection.db; const objectId = () => new mongoose.Types.ObjectId();
        const user = objectId(), video = objectId(), moment = objectId(), conversation = objectId(), notification = objectId();
        const messages = [objectId(), objectId()]; const pending = objectId(), report = objectId(), claim = objectId();
        const identity = (publicId, resourceType) => {
            const value = { cloudName: "isolated-test.invalid", publicId, resourceType, deliveryType: "upload" };
            return { ...value, asset: crypto.createHash("sha256").update(JSON.stringify(Object.values(value))).digest("hex"),
                url: `https://synthetic.invalid/${publicId}`, identityVerified: true };
        };
        const shared = identity("synthetic/shared", "image"), videoMedia = identity("synthetic/video", "video");
        const models = [MediaUploadIntent, PendingMediaRetention, CloudinaryAsset, CloudinaryAssetReference,
            MediaCleanupRecord, MediaCoverageBarrier, MediaCoverageApproval, AssetModerationHold, ExpirationSchedulerLease];
        for (const model of models) { await model.createCollection(); await model.createIndexes();
            const actual = await model.collection.indexes();
            for (const [key, options] of model.schema.indexes()) assert.ok(actual.some((index) => JSON.stringify(index.key) === JSON.stringify(key) && (!options.unique || index.unique === true)), `${model.modelName} index missing`);
        }
        const future = new Date(Date.now() + 86400000), old = new Date(Date.now() - 86400000);
        await db.collection("users").insertOne({ _id: user, username: "legacy1", email: "legacy1@invalid.invalid", fullName: "Legacy", avatar: shared.url, avatarPublicId: shared.publicId, avatarDeliveryType: shared.deliveryType, mediaRegistry: { avatar: shared } });
        await db.collection("pendingusers").insertOne({ _id: pending, username: "pending1", email: "pending1@invalid.invalid", fullName: "Pending", avatar: "https://legacy.invalid/unknown", verificationOtpExpiry: future });
        await db.collection("videos").insertOne({ _id: video, owner: user, title: "Legacy", description: "Legacy", duration: 1, videoFile: videoMedia.url, videoPublicId: videoMedia.publicId, videoDeliveryType: "upload", thumbnail: shared.url, thumbnailPublicId: shared.publicId, thumbnailDeliveryType: "upload", mediaRegistry: { video: videoMedia, thumbnail: shared }, updatedAt: old });
        await db.collection("moments").insertOne({ _id: moment, owner: user, mediaUrl: shared.url, mediaPublicId: shared.publicId, mediaDeliveryType: "upload", mediaResourceType: "image", mediaType: "image", mediaRegistry: { moment: shared }, expiresAt: future });
        await db.collection("conversations").insertOne({ _id: conversation, type: "group", createdBy: user, participants: [user], avatar: shared.url, mediaRegistry: { avatar: { ...shared, referenceUser: user } } });
        await db.collection("messages").insertMany(messages.map((_id) => ({ _id, conversation, sender: user, type: "image", attachment: { url: shared.url, publicId: shared.publicId, resourceType: "image", deliveryType: "upload", mediaRegistry: shared } })));
        await db.collection("notifications").insertOne({ _id: notification, recipient: user, data: { videoThumbnail: shared.url }, mediaRegistry: { thumbnail: shared }, expiresAt: future });
        await db.collection("reports").insertOne({ _id: report, reporter: user, video, reason: "other", status: "pending", createdAt: new Date() });
        await db.collection("copyrightclaims").insertOne({ _id: claim, claimant: user, video, reason: "test", description: "test", status: "pending", createdAt: new Date() });
        await MediaUploadIntent.create({ _id: "synthetic-uncertain", user, sourceId: video, sourceType: "video", cloudName: "isolated-test.invalid", plannedPublicId: "synthetic/unknown", status: "uncertain" });
        for (const [name, field] of [["moments", "expiresAt"], ["notifications", "expiresAt"], ["pendingusers", "verificationOtpExpiry"]]) await db.collection(name).createIndex({ [field]: 1 }, { name: `legacy_${name}_ttl`, expireAfterSeconds: 315360000 });
        await db.collection("_migration_safety").insertOne({ _id: "ttl_index_migration", environment: "local_test", database: owned.dbName });
        const session = await mongoose.startSession(); try { await session.withTransaction(() => fenceMediaCoverage({ session })); } finally { await session.endSession(); }
        const before = await verifyMediaCoverage({ limit: 20 });
        assert.equal(before.coverageComplete, false); assert.equal(before.statistics.unresolvedUploads, 1);
        assert.ok(before.expiration.ttlIndexes.some((item) => item.collection === "pendingusers"));
        assert.ok(before.pages.messages.linked >= 2); assert.ok(before.pages.pendingUsers.unresolved >= 1);
        const uri = new URL(process.env.TEST_MONGODB_URI); uri.pathname = `/${owned.dbName}`;
        const opts = { uri: uri.toString(), dbName: owned.dbName };
        const dryRun = await migrateExpirationIndexes(opts); assert.equal(dryRun.collections.filter((item) => item.ttlIndexes.length === 1).length, 3);
        await migrateExpirationIndexes({ ...opts, execute: true, confirmedDb: owned.dbName, acknowledged: true });
        const totals = {};
        for (const source of ["users", "pendingUsers", "videos", "moments", "messages", "conversations", "notifications", "moderationReports", "moderationCopyright"]) {
            let cursor = null, pages = 0, linked = 0, unresolved = 0, active = 0;
            do { const page = await backfillMediaReferences({ source, cursor, limit: 1, dryRun: false });
                assert.equal(page.failed, 0, `${source}: ${JSON.stringify(page.failures)}`); pages++; linked += page.linked || 0; unresolved += page.unresolved || 0; active += page.active || 0; cursor = page.nextCursor;
                if (page.complete) break; assert.ok(cursor); assert.ok(pages < 10);
            } while (true);
            totals[source] = { pages, linked, unresolved, active };
        }
        assert.equal(totals.messages.pages, 2); assert.equal(totals.messages.linked, 2); assert.equal(totals.pendingUsers.unresolved, 1);
        const refs = await CloudinaryAssetReference.find({ asset: shared.asset }).lean();
        assert.equal(refs.filter((ref) => ref.sourceType === "attachment").length, 2);
        assert.equal(await AssetModerationHold.countDocuments({ caseId: { $in: [report, claim] } }), 4);
        const replay = await backfillMediaReferences({ source: "messages", limit: 20, dryRun: false });
        assert.equal(replay.existing, 2); assert.equal(await CloudinaryAssetReference.countDocuments({ sourceType: "attachment", sourceId: { $in: messages } }), 2);
        const holdsReplay = await backfillMediaReferences({ source: "moderationReports", limit: 20, dryRun: false }); assert.equal(holdsReplay.existing, 2);
        const after = await verifyMediaCoverage({ limit: 20 }); assert.equal(after.coverageComplete, false); assert.equal(after.statistics.unresolvedUploads, 1);
        assert.equal(after.expiration.ttlIndexes.length, 0); assert.equal(after.expiration.indexStable, true);
        const approvalSession = await mongoose.startSession();
        try { await assert.rejects(approvalSession.withTransaction(() => approveEmptyTestCoverage({ session: approvalSession, ownerToken: owned.ownerToken,
            snapshot: { stable: true, fenceVersion: after.fenceVersion }, evidence: { scope: "global", backfillsVerified: true, moderationVerified: true, indexMigrationVerified: true, isolatedTest: true } })), /Unresolved upload intents/); }
        finally { await approvalSession.endSession(); }
        assert.equal((await db.collection("reports").findOne({ _id: report })).status, "pending");
        assert.equal((await db.collection("copyrightclaims").findOne({ _id: claim })).status, "pending");
        t.diagnostic(`synthetic backfill stats: ${JSON.stringify(totals)}; coverage blockers before=${before.blockingReasons.length} after=${after.blockingReasons.length}`);
    } finally { await closeTestDatabase(owned); }
});
