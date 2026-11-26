import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { openTestDatabase, closeTestDatabase } from "./testDatabase.js";
import { CloudinaryAsset } from "../../src/models/cloudinaryAsset.model.js";
import { MediaCleanupRecord } from "../../src/models/mediaCleanupRecord.model.js";
import { MediaCoverageBarrier } from "../../src/models/mediaCoverageBarrier.model.js";
import { fenceMediaCoverage } from "../../src/services/mediaCoverageBarrier.service.js";
import { approveEmptyTestCoverage } from "../../src/services/testMediaCoverageApproval.service.js";
import { reserveSyntheticTestAsset } from "../../src/services/mediaDeletionEligibility.service.js";
import { claimCleanupJob, createMockCloudinaryAdapter, runSyntheticCleanupBatch } from "../../src/services/mediaCleanupWorker.service.js";

const available = Boolean(process.env.TEST_MONGODB_URI); let owned;
beforeEach(async () => { if (available) owned = await openTestDatabase(); });
afterEach(async () => { if (owned) { await closeTestDatabase(owned); owned = null; } });
const dbtest = (name, fn) => test(name, { skip: !available && "TEST_MONGODB_URI is not configured" }, fn);
const tx = async (fn) => { const session = await mongoose.startSession(); try { return await session.withTransaction(() => fn(session)); } finally { await session.endSession(); } };

const fixture = async () => {
    const db = mongoose.connection.db;
    await db.collection("moments").createIndex({ expiresAt: 1, _id: 1 }, { name: "moment_expiration_scan" });
    await db.collection("notifications").createIndex({ expiresAt: 1, _id: 1 }, { name: "notification_expiration_scan" });
    await db.collection("pendingusers").createIndex({ verificationOtpExpiry: 1, _id: 1 }, { name: "pending_user_expiration_scan" });
    const identity = { cloudName: "isolated-test.invalid", publicId: "synthetic/worker", resourceType: "image", deliveryType: "upload" };
    const assetId = crypto.createHash("sha256").update(JSON.stringify(Object.values(identity))).digest("hex");
    await CloudinaryAsset.create({ _id: assetId, ...identity });
    await MediaCleanupRecord.create({ _id: "synthetic-worker-job", user: new mongoose.Types.ObjectId(), sourceId: new mongoose.Types.ObjectId(),
        sourceType: "test", asset: assetId, ...identity, status: "pending" });
    await tx((session) => fenceMediaCoverage({ session }));
    const barrier = await MediaCoverageBarrier.findById("global").lean();
    const approval = await tx((session) => approveEmptyTestCoverage({ session, ownerToken: owned.ownerToken, syntheticAssetId: assetId,
        snapshot: { stable: true, fenceVersion: barrier.fenceVersion }, evidence: { scope: "global", backfillsVerified: true,
            moderationVerified: true, indexMigrationVerified: true, isolatedTest: true } }));
    return { assetId, ownerToken: owned.ownerToken, approvalId: approval.approvalId };
};

dbtest("mock success finalizes one synthetic asset atomically", async () => {
    const args = await fixture();
    const result = await runSyntheticCleanupBatch({ ...args, adapter: createMockCloudinaryAdapter(["success"]) });
    assert.equal(result.results[0].status, "completed");
    assert.equal((await MediaCleanupRecord.findById("synthetic-worker-job").lean()).status, "completed");
    assert.equal((await CloudinaryAsset.findById(args.assetId).lean()).lifecycleStatus, "deleted");
    assert.equal((await MediaCoverageBarrier.findById("global").lean()).testRelease, false);
});

dbtest("temporary failure retries and uncertain outcome stays protected", async () => {
    const args = await fixture(); const adapter = createMockCloudinaryAdapter(["temporary", "uncertain"]);
    const first = await runSyntheticCleanupBatch({ ...args, adapter, retryOptions: { baseDelayMs: 1, maxDelayMs: 10, random: () => 0 } });
    assert.equal(first.results[0].status, "pending");
    await MediaCleanupRecord.updateOne({ _id: "synthetic-worker-job" }, { $set: { nextRetryAt: new Date(0) } });
    const second = await runSyntheticCleanupBatch({ ...args, adapter });
    assert.equal(second.results[0].status, "review_required");
    const asset = await CloudinaryAsset.findById(args.assetId).select("+cleanupLeaseToken").lean();
    assert.equal(asset.lifecycleStatus, "deletion_reserved"); assert.ok(asset.cleanupLeaseToken);
});

dbtest("transaction rollback and competing workers cannot finalize twice", async () => {
    const args = await fixture();
    await assert.rejects(tx(async (session) => {
        const reservation = await reserveSyntheticTestAsset({ ...args, session });
        await claimCleanupJob({ jobId: "synthetic-worker-job", workerId: "rollback", reservation, session });
        throw new Error("rollback");
    }), /rollback/);
    assert.equal((await MediaCleanupRecord.findById("synthetic-worker-job").lean()).status, "pending");
    const outcomes = await Promise.all([
        runSyntheticCleanupBatch({ ...args, adapter: createMockCloudinaryAdapter(["success"]) }),
        runSyntheticCleanupBatch({ ...args, adapter: createMockCloudinaryAdapter(["success"]) })
    ]);
    assert.equal(outcomes.flatMap((item) => item.results).filter((item) => item.status === "completed").length, 1);
});
