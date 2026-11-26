import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import crypto from "node:crypto";
import { openTestDatabase, closeTestDatabase } from "./testDatabase.js";
import { runIsolatedAccountDeletion } from "../../src/services/accountDeletionLifecycle.service.js";
import { Video } from "../../src/models/video.model.js";

const available = Boolean(process.env.TEST_MONGODB_URI); let owned;
beforeEach(async () => { if (available) owned = await openTestDatabase(); });
afterEach(async () => { if (owned) { await closeTestDatabase(owned); owned = null; } });
const dbtest = (name, fn) => test(name, { skip: !available && "TEST_MONGODB_URI is not configured" }, fn);
const seed = async () => {
    const userId = new mongoose.Types.ObjectId();
    await mongoose.connection.db.collection("users").insertOne({ _id: userId, username: `test_lifecycle_${userId}`,
        email: `${userId}@invalid.invalid`, fullName: "Test User", isActive: false, isVerified: true, role: "user",
        deletionRequestedAt: new Date(), testLifecycleFixture: true, databaseCleanupStatus: "pending",
        deletionLifecycle: { state: "requested", version: 0, retryCount: 0 } });
    return userId;
};

dbtest("isolated lifecycle coordinates database cleanup and simulated completion", async () => {
    const userId = await seed();
    const result = await runIsolatedAccountDeletion({ userId, ownerToken: owned.ownerToken });
    assert.equal(result.state, "completed"); assert.equal(result.permanentDeletionComplete, false);
    const user = await mongoose.connection.db.collection("users").findOne({ _id: userId });
    assert.ok(user.anonymizedAt); assert.equal(user.databaseCleanupStatus, "complete");
    assert.equal(user.deletionLifecycle.testOnly, true); assert.equal(user.isActive, false);
    assert.equal(await mongoose.connection.db.collection("auditlogs").countDocuments({ resourceId: userId, action: "test_account_cleanup_assessed" }), 1);
    assert.equal((await runIsolatedAccountDeletion({ userId, ownerToken: owned.ownerToken })).reason, "unavailable_or_claimed");
});

dbtest("cleanup failure rolls back, records sanitized state and can retry", async () => {
    const userId = await seed(); const originalFind = Video.find;
    Video.find = () => { throw new Error("sensitive injected detail"); };
    try { await assert.rejects(runIsolatedAccountDeletion({ userId, ownerToken: owned.ownerToken }), /sensitive injected detail/); }
    finally { Video.find = originalFind; }
    const db = mongoose.connection.db;
    const failed = await db.collection("users").findOne({ _id: userId });
    assert.equal(failed.anonymizedAt, undefined); assert.equal(failed.deletionLifecycle.lastError, "cleanup_failed");
    assert.notEqual(failed.databaseCleanupStatus, "complete");
    await db.collection("users").updateOne({ _id: userId }, { $set: { "deletionLifecycle.nextRetryAt": new Date(0) } });
    assert.equal((await runIsolatedAccountDeletion({ userId, ownerToken: owned.ownerToken })).state, "completed");
});

dbtest("concurrent lifecycle requests do not duplicate database cleanup", async () => {
    const userId = await seed();
    const results = await Promise.all([runIsolatedAccountDeletion({ userId, ownerToken: owned.ownerToken }),
        runIsolatedAccountDeletion({ userId, ownerToken: owned.ownerToken })]);
    assert.equal(results.filter((result) => result.state === "completed").length, 1);
    assert.equal(await mongoose.connection.db.collection("auditlogs").countDocuments({ resourceId: userId, action: "test_account_cleanup_assessed" }), 1);
});

dbtest("unresolved media blocks simulated completion", async () => {
    const userId = await seed();
    await mongoose.connection.db.collection("mediacleanuprecords").insertOne({ _id: `test:${userId}`, user: userId,
        sourceType: "test", sourceId: new mongoose.Types.ObjectId(), status: "unresolved" });
    const result = await runIsolatedAccountDeletion({ userId, ownerToken: owned.ownerToken });
    assert.equal(result.state, "blocked"); assert.equal(result.permanentDeletionComplete, false);
});

dbtest("synthetic media completes only after separate test approval and mock cleanup", async () => {
    const { CloudinaryAsset } = await import("../../src/models/cloudinaryAsset.model.js");
    const { MediaCleanupRecord } = await import("../../src/models/mediaCleanupRecord.model.js");
    const { MediaCoverageBarrier } = await import("../../src/models/mediaCoverageBarrier.model.js");
    const { fenceMediaCoverage } = await import("../../src/services/mediaCoverageBarrier.service.js");
    const { approveEmptyTestCoverage } = await import("../../src/services/testMediaCoverageApproval.service.js");
    const { createMockCloudinaryAdapter } = await import("../../src/services/mediaCleanupWorker.service.js");
    const tx = async (fn) => { const session = await mongoose.startSession(); try { return await session.withTransaction(() => fn(session)); } finally { await session.endSession(); } };
    const db = mongoose.connection.db; const userId = await seed();
    await db.collection("moments").createIndex({ expiresAt: 1, _id: 1 }, { name: "moment_expiration_scan" });
    await db.collection("notifications").createIndex({ expiresAt: 1, _id: 1 }, { name: "notification_expiration_scan" });
    await db.collection("pendingusers").createIndex({ verificationOtpExpiry: 1, _id: 1 }, { name: "pending_user_expiration_scan" });
    const identity = { cloudName: "isolated-test.invalid", publicId: "synthetic/lifecycle", resourceType: "image", deliveryType: "upload" };
    const assetId = crypto.createHash("sha256").update(JSON.stringify(Object.values(identity))).digest("hex");
    await CloudinaryAsset.create({ _id: assetId, ...identity });
    await MediaCleanupRecord.create({ _id: "lifecycle-job", user: userId, sourceType: "test", sourceId: new mongoose.Types.ObjectId(), asset: assetId, ...identity, status: "pending" });
    assert.equal((await runIsolatedAccountDeletion({ userId, ownerToken: owned.ownerToken })).state, "media_cleanup");
    await tx((session) => fenceMediaCoverage({ session }));
    const barrier = await MediaCoverageBarrier.findById("global").lean();
    const approval = await tx((session) => approveEmptyTestCoverage({ session, ownerToken: owned.ownerToken, syntheticAssetId: assetId,
        syntheticAccountId: userId, snapshot: { stable: true, fenceVersion: barrier.fenceVersion }, evidence: { scope: "global",
            backfillsVerified: true, moderationVerified: true, indexMigrationVerified: true, isolatedTest: true } }));
    const result = await runIsolatedAccountDeletion({ userId, ownerToken: owned.ownerToken, approvalId: approval.approvalId,
        adapter: createMockCloudinaryAdapter(["success"]) });
    assert.equal(result.state, "completed"); assert.equal(result.permanentDeletionComplete, false);
    assert.equal((await MediaCleanupRecord.findById("lifecycle-job").lean()).status, "completed");
    assert.ok(await db.collection("users").findOne({ _id: userId }));
});
