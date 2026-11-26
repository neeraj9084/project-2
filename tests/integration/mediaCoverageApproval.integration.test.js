import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { openTestDatabase, closeTestDatabase } from "./testDatabase.js";
import { MediaCoverageBarrier } from "../../src/models/mediaCoverageBarrier.model.js";
import { MediaCoverageApproval } from "../../src/models/mediaCoverageApproval.model.js";
import { fenceMediaCoverage } from "../../src/services/mediaCoverageBarrier.service.js";
import { approveEmptyTestCoverage } from "../../src/services/testMediaCoverageApproval.service.js";
import { verifyMediaCoverage } from "../../src/services/verifyMediaCoverage.service.js";
import { CloudinaryAsset } from "../../src/models/cloudinaryAsset.model.js";
import { CloudinaryAssetReference } from "../../src/models/cloudinaryAssetReference.model.js";
import { registerAssetReference, removeAssetReference } from "../../src/services/cloudinaryAssetReference.service.js";

const available = Boolean(process.env.TEST_MONGODB_URI);
let owned;
before(async () => {
    if (!available) return;
    owned = await openTestDatabase();
    await mongoose.connection.db.collection("moments").createIndex({ expiresAt: 1, _id: 1 }, { name: "moment_expiration_scan" });
    await mongoose.connection.db.collection("notifications").createIndex({ expiresAt: 1, _id: 1 }, { name: "notification_expiration_scan" });
    await mongoose.connection.db.collection("pendingusers").createIndex({ verificationOtpExpiry: 1, _id: 1 }, { name: "pending_user_expiration_scan" });
});
after(async () => { if (owned) await closeTestDatabase(owned); });
const dbtest = (name, fn) => test(name, { skip: !available && "TEST_MONGODB_URI is not configured" }, fn);
const tx = async (fn) => { const session = await mongoose.startSession(); try { return await session.withTransaction(() => fn(session)); } finally { await session.endSession(); } };
const evidence = { scope: "global", backfillsVerified: true, moderationVerified: true, indexMigrationVerified: true, isolatedTest: true };

dbtest("isolated approval is invalidated by a fenced mutation", async () => {
    await tx((session) => fenceMediaCoverage({ session }));
    const barrier = await MediaCoverageBarrier.findById("global").lean();
    const snapshot = { stable: true, fenceVersion: barrier.fenceVersion };
    const approval = await tx((session) => approveEmptyTestCoverage({ session, snapshot, ownerToken: owned.ownerToken, evidence }));
    assert.equal(approval.authorizedForDeletion, false);
    await tx((session) => fenceMediaCoverage({ session }));
    assert.equal((await MediaCoverageApproval.findById(approval.approvalId).lean()).status, "invalidated");
    assert.equal((await MediaCoverageBarrier.findById("global").lean()).testRelease, false);
    await assert.rejects(tx((session) => approveEmptyTestCoverage({ session, snapshot, ownerToken: owned.ownerToken, evidence })), /stale/);
});

dbtest("pending-user TTL metadata blocks test-only approval", async () => {
    const db = mongoose.connection.db;
    await tx((session) => fenceMediaCoverage({ session }));
    const barrier = await MediaCoverageBarrier.findById("global").lean();
    await db.collection("pendingusers").createIndex({ verificationOtpExpiry: 1 }, { name: "test_pending_ttl", expireAfterSeconds: 315360000 });
    try { await assert.rejects(tx((session) => approveEmptyTestCoverage({ session, snapshot: { stable: true, fenceVersion: barrier.fenceVersion }, ownerToken: owned.ownerToken, evidence })), /index evidence is incomplete/); }
    finally { await db.collection("pendingusers").dropIndex("test_pending_ttl"); }
});

dbtest("approval rolls back and concurrent mutation invalidates snapshot", async () => {
    const before = await MediaCoverageBarrier.findById("global").lean();
    const snapshot = { stable: true, fenceVersion: before.fenceVersion };
    await assert.rejects(tx(async (session) => { await approveEmptyTestCoverage({ session, snapshot, ownerToken: owned.ownerToken, evidence }); throw new Error("abort test"); }), /abort test/);
    assert.equal((await MediaCoverageBarrier.findById("global").lean()).fenceVersion, before.fenceVersion);
    assert.equal(await MediaCoverageApproval.countDocuments({ status: "test_approved" }), 0);
    await tx((session) => fenceMediaCoverage({ session }));
    await assert.rejects(tx((session) => approveEmptyTestCoverage({ session, snapshot, ownerToken: owned.ownerToken, evidence })), /stale/);
});

dbtest("concurrent approval and mutation cannot leave stale approval active", async () => {
    const before = await MediaCoverageBarrier.findById("global").lean();
    const snapshot = { stable: true, fenceVersion: before.fenceVersion };
    const outcomes = await Promise.allSettled([
        tx((session) => approveEmptyTestCoverage({ session, snapshot, ownerToken: owned.ownerToken, evidence })),
        tx((session) => fenceMediaCoverage({ session }))
    ]);
    assert.equal(outcomes[1].status, "fulfilled");
    const barrier = await MediaCoverageBarrier.findById("global").lean();
    if (outcomes[0].status === "fulfilled") {
        // Approval after mutation is forbidden by its snapshot check; if it
        // committed first, the later mutation must invalidate it.
        assert.equal((await MediaCoverageApproval.findById(outcomes[0].value.approvalId).lean()).status, "invalidated");
    }
    assert.equal(barrier.testRelease, false);
    assert.equal(barrier.coverageStatus, "blocked");
});

dbtest("active index migration blocks test approval and diagnostic coverage", async () => {
    const db = mongoose.connection.db;
    await tx((session) => fenceMediaCoverage({ session }));
    const barrier = await MediaCoverageBarrier.findById("global").lean();
    const snapshot = { stable: true, fenceVersion: barrier.fenceVersion };
    await db.collection("_migration_locks").insertOne({ _id: "expiration_indexes", database: owned.dbName });
    try {
        await assert.rejects(tx((session) => approveEmptyTestCoverage({ session, snapshot, ownerToken: owned.ownerToken, evidence })), /migration is active/);
        const report = await verifyMediaCoverage({ limit: 10 });
        assert.equal(report.coverageComplete, false);
        assert.equal(report.expiration.indexStable, false);
        assert.ok(report.blockingReasons.some((reason) => reason.includes("migration is active")));
    } finally { await db.collection("_migration_locks").deleteOne({ _id: "expiration_indexes", database: owned.dbName }); }
});

dbtest("interrupted migration remains blocked after its lock disappears", async () => {
    const db = mongoose.connection.db;
    await tx((session) => fenceMediaCoverage({ session }));
    const barrier = await MediaCoverageBarrier.findById("global").lean();
    const snapshot = { stable: true, fenceVersion: barrier.fenceVersion };
    await db.collection("_media_index_migration").insertOne({ _id: "expiration_indexes", status: "failed", version: 1 });
    try {
        await assert.rejects(tx((session) => approveEmptyTestCoverage({ session, snapshot, ownerToken: owned.ownerToken, evidence })), /requires review/);
        const report = await verifyMediaCoverage({ limit: 10 });
        assert.equal(report.expiration.indexStable, false);
        assert.equal(report.coverageComplete, false);
    } finally { await db.collection("_media_index_migration").deleteOne({ _id: "expiration_indexes", status: "failed" }); }
});

dbtest("migration and concurrent approval cannot leave prior coverage active", async () => {
    const { migrateExpirationIndexes } = await import("../../scripts/prepareExpirationIndexes.js");
    const db = mongoose.connection.db; const uri = new URL(process.env.TEST_MONGODB_URI); uri.pathname = `/${owned.dbName}`;
    await db.collection("pendingusers").createIndex({ verificationOtpExpiry: 1, _id: 1 }, { name: "pending_user_expiration_scan" });
    await db.collection("_migration_safety").insertOne({ _id: "ttl_index_migration", environment: "local_test", database: owned.dbName });
    await tx((session) => fenceMediaCoverage({ session }));
    const barrier = await MediaCoverageBarrier.findById("global").lean();
    const outcomes = await Promise.allSettled([
        tx((session) => approveEmptyTestCoverage({ session, snapshot: { stable: true, fenceVersion: barrier.fenceVersion }, ownerToken: owned.ownerToken, evidence })),
        migrateExpirationIndexes({ uri: uri.toString(), dbName: owned.dbName, execute: true, confirmedDb: owned.dbName, acknowledged: true })
    ]);
    assert.equal(outcomes[1].status, "fulfilled");
    assert.equal((await MediaCoverageBarrier.findById("global").lean()).testRelease, false);
    if (outcomes[0].status === "fulfilled") assert.equal((await MediaCoverageApproval.findById(outcomes[0].value.approvalId).lean()).status, "invalidated");
});

dbtest("reference rollback and removal cannot produce an approved coverage report", async () => {
    const assetId = "b".repeat(64); const sourceId = new mongoose.Types.ObjectId(); const userId = new mongoose.Types.ObjectId();
    await CloudinaryAsset.create({ _id: assetId, cloudName: "isolated-test.invalid", publicId: "synthetic/ref", resourceType: "image", deliveryType: "upload" });
    const args = { assetId, sourceType: "attachment", sourceId, userId };
    const before = await MediaCoverageBarrier.findById("global").lean();
    await assert.rejects(tx(async (session) => { await registerAssetReference({ ...args, session }); throw new Error("rollback reference"); }), /rollback reference/);
    assert.equal(await CloudinaryAssetReference.countDocuments({ asset: assetId }), 0);
    assert.equal((await MediaCoverageBarrier.findById("global").lean()).fenceVersion, before.fenceVersion);
    await tx((session) => registerAssetReference({ ...args, session }));
    const [report] = await Promise.all([verifyMediaCoverage({ limit: 10 }), tx((session) => removeAssetReference({ ...args, session }))]);
    assert.equal(report.coverageComplete, false);
    assert.equal(await CloudinaryAssetReference.countDocuments({ asset: assetId }), 0);
    assert.equal((await MediaCoverageBarrier.findById("global").lean()).testRelease, false);
});
