import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { openTestDatabase, closeTestDatabase } from "./testDatabase.js";
import { CloudinaryAsset } from "../../src/models/cloudinaryAsset.model.js";
import { MediaCleanupRecord } from "../../src/models/mediaCleanupRecord.model.js";
import { MediaCoverageBarrier } from "../../src/models/mediaCoverageBarrier.model.js";
import { fenceMediaCoverage } from "../../src/services/mediaCoverageBarrier.service.js";
import { approveEmptyTestCoverage } from "../../src/services/testMediaCoverageApproval.service.js";
import { reserveSyntheticTestAsset, cancelSyntheticTestReservation } from "../../src/services/mediaDeletionEligibility.service.js";
import { registerAssetReference } from "../../src/services/cloudinaryAssetReference.service.js";

const available = Boolean(process.env.TEST_MONGODB_URI); let owned;
before(async () => { if (available) owned = await openTestDatabase(); });
after(async () => { if (owned) await closeTestDatabase(owned); });
const tx = async (fn) => { const session = await mongoose.startSession(); try { return await session.withTransaction(() => fn(session)); } finally { await session.endSession(); } };

test("synthetic eligibility, reservation, cancellation, rollback and concurrent reference fencing", { skip: !available && "TEST_MONGODB_URI is not configured" }, async () => {
    const db = mongoose.connection.db;
    await db.collection("moments").createIndex({ expiresAt: 1, _id: 1 }, { name: "moment_expiration_scan" });
    await db.collection("notifications").createIndex({ expiresAt: 1, _id: 1 }, { name: "notification_expiration_scan" });
    await db.collection("pendingusers").createIndex({ verificationOtpExpiry: 1, _id: 1 }, { name: "pending_user_expiration_scan" });
    const identity = { cloudName: "isolated-test.invalid", publicId: "synthetic/example", resourceType: "image", deliveryType: "upload" };
    const assetId = crypto.createHash("sha256").update(JSON.stringify(Object.values(identity))).digest("hex");
    await CloudinaryAsset.create({ _id: assetId, ...identity });
    await MediaCleanupRecord.create({ _id: "synthetic-job", user: new mongoose.Types.ObjectId(), sourceType: "test", sourceId: new mongoose.Types.ObjectId(),
        asset: assetId, ...identity, status: "pending" });
    await tx((session) => fenceMediaCoverage({ session }));
    const barrier = await MediaCoverageBarrier.findById("global").lean();
    const approval = await tx((session) => approveEmptyTestCoverage({ session, ownerToken: owned.ownerToken, syntheticAssetId: assetId,
        snapshot: { stable: true, fenceVersion: barrier.fenceVersion }, evidence: { scope: "global", backfillsVerified: true,
            moderationVerified: true, indexMigrationVerified: true, isolatedTest: true } }));
    const args = { assetId, approvalId: approval.approvalId, ownerToken: owned.ownerToken };
    await assert.rejects(tx(async (session) => { await reserveSyntheticTestAsset({ ...args, session }); throw new Error("rollback test"); }), /rollback test/);
    assert.equal((await CloudinaryAsset.findById(assetId).lean()).lifecycleStatus, "active");
    const claim = await tx((session) => reserveSyntheticTestAsset({ ...args, session }));
    assert.equal(claim.authorizedForDeletion, false);
    await assert.rejects(tx((session) => reserveSyntheticTestAsset({ ...args, session })));
    await tx((session) => cancelSyntheticTestReservation({ ownerToken: owned.ownerToken, session, assetId, token: claim.token, fenceVersion: claim.fenceVersion }));
    const actor = new mongoose.Types.ObjectId(); const sourceId = new mongoose.Types.ObjectId();
    const outcomes = await Promise.allSettled([
        tx((session) => reserveSyntheticTestAsset({ ...args, session })),
        tx((session) => registerAssetReference({ assetId, sourceType: "attachment", sourceId, userId: actor, session }))
    ]);
    assert.notEqual(outcomes[0].status, outcomes[1].status);
    if (outcomes[0].status === "fulfilled") assert.equal((await CloudinaryAsset.findById(assetId).lean()).lifecycleStatus, "deletion_reserved");
    else assert.equal((await MediaCoverageBarrier.findById("global").lean()).testRelease, false);
});
