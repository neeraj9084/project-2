import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { openTestDatabase, closeTestDatabase } from "./testDatabase.js";
import { runGuardedBackfillPage } from "../../src/services/guardedMediaBackfill.service.js";
import { backfillMediaReferences } from "../../src/services/backfillMediaReferences.service.js";
import { migrateExpirationIndexes } from "../../scripts/prepareExpirationIndexes.js";

test("guarded backfill checkpoints pages and recovers failed synthetic work", { skip: !process.env.TEST_MONGODB_URI && "TEST_MONGODB_URI is not configured" }, async () => {
    const owned = await openTestDatabase();
    try {
        const db = mongoose.connection.db; const user = new mongoose.Types.ObjectId();
        const first = new mongoose.Types.ObjectId(), second = new mongoose.Types.ObjectId();
        const identity = { cloudName: "isolated-test.invalid", publicId: "synthetic/backfill", resourceType: "image", deliveryType: "upload" };
        const asset = crypto.createHash("sha256").update(JSON.stringify(Object.values(identity))).digest("hex");
        const url = "https://synthetic.invalid/backfill"; const mediaRegistry = { ...identity, asset, url, identityVerified: true };
        await db.collection("messages").insertMany([first, second].map((_id) => ({ _id, sender: user,
            attachment: { url, publicId: identity.publicId, resourceType: "image", deliveryType: "upload", mediaRegistry } })));
        const base = { source: "messages", runId: "test_backfill", ownerToken: owned.ownerToken, limit: 1 };
        const dry = await runGuardedBackfillPage(base); assert.equal(dry.dryRun, true); assert.equal(dry.result.scanned, 1);
        assert.equal(await db.collection("_guarded_backfill_runs").countDocuments(), 0);
        const execute = { ...base, dryRun: false, operator: "test_operator", backupEvidence: "test_backup", maintenanceId: "test_window" };
        await assert.rejects(runGuardedBackfillPage(execute), /authorization/);
        await db.collection("_backfill_preflight").insertOne({ _id: "controlled_backfill", database: owned.dbName, ownerToken: owned.ownerToken,
            operator: "test_operator", backupEvidence: "test_backup", maintenanceId: "test_window", authorized: true, maintenanceActive: true });
        const originalEnv = process.env.NODE_ENV;
        try { process.env.NODE_ENV = "production"; await assert.rejects(runGuardedBackfillPage(execute), /Isolated test database required/); }
        finally { process.env.NODE_ENV = originalEnv; }
        await db.collection("_media_index_migration").insertOne({ _id: "expiration_indexes", status: "failed" });
        await assert.rejects(runGuardedBackfillPage(execute), /Unresolved index migration/);
        await db.collection("_media_index_migration").deleteOne({ _id: "expiration_indexes", status: "failed" });
        const page = await runGuardedBackfillPage(execute); assert.equal(page.status, "active"); assert.equal(page.result.scanned, 1);
        await db.collection("_migration_safety").insertOne({ _id: "ttl_index_migration", environment: "local_test", database: owned.dbName });
        for (const [collection, field] of [["moments", "expiresAt"], ["notifications", "expiresAt"], ["pendingusers", "verificationOtpExpiry"]]) await db.collection(collection).createIndex({ [field]: 1 }, { name: `test_${collection}_ttl`, expireAfterSeconds: 315360000 });
        const uri = new URL(process.env.TEST_MONGODB_URI); uri.pathname = `/${owned.dbName}`;
        await assert.rejects(migrateExpirationIndexes({ uri: uri.toString(), dbName: owned.dbName, execute: true, confirmedDb: owned.dbName, acknowledged: true }), /duplicate key/i);
        assert.ok((await db.collection("pendingusers").indexes()).some((index) => index.name === "test_pendingusers_ttl"));
        const direct = await backfillMediaReferences({ source: "messages", dryRun: false, limit: 1 }); assert.equal(direct.failed, 1);
        await assert.rejects(runGuardedBackfillPage({ ...execute, token: "stale" }), /stale/);
        const finished = await runGuardedBackfillPage({ ...execute, token: page.token }); assert.equal(finished.status, "complete");
        assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ asset, sourceType: "attachment" }), 2);
        assert.equal((await runGuardedBackfillPage(execute)).alreadyComplete, true);
        const failedRun = { ...execute, runId: "failed_backfill" };
        await db.collection("cloudinaryassets").updateOne({ _id: asset }, { $set: { cloudName: "conflict.invalid" } });
        const failed = await runGuardedBackfillPage(failedRun); assert.equal(failed.status, "failed");
        await assert.rejects(runGuardedBackfillPage({ ...failedRun, token: failed.token, recover: true }), /recovery/);
        await db.collection("cloudinaryassets").updateOne({ _id: asset }, { $set: { cloudName: identity.cloudName } });
        const recovered = await runGuardedBackfillPage({ ...failedRun, token: failed.token, recover: true, quiescenceConfirmed: true });
        assert.equal(recovered.status, "active");
        assert.equal((await runGuardedBackfillPage({ ...failedRun, token: recovered.token })).status, "complete");
        assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ asset, sourceType: "attachment" }), 2);
        assert.equal((await db.collection("mediacoveragebarriers").findOne({ _id: "global" })).testRelease, false);
    } finally { await closeTestDatabase(owned); }
});
