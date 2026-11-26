import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { openTestDatabase, closeTestDatabase } from "./testDatabase.js";
import { createExpirationScheduler } from "../../src/services/expirationScheduler.service.js";

const available = Boolean(process.env.TEST_MONGODB_URI);
let owned;
before(async () => {
    if (!available) return;
    owned = await openTestDatabase();
    await mongoose.connection.db.collection("moments").createIndex({ expiresAt: 1, _id: 1 }, { name: "moment_expiration_scan" });
    await mongoose.connection.db.collection("notifications").createIndex({ expiresAt: 1, _id: 1 }, { name: "notification_expiration_scan" });
});
after(async () => { if (owned) await closeTestDatabase(owned); });
const dbtest = (name, fn) => test(name, { skip: !available && "TEST_MONGODB_URI is not configured" }, fn);

dbtest("test-only scheduler expires bounded batches and preserves cleanup metadata", async () => {
    const db = mongoose.connection.db; const owner = new mongoose.Types.ObjectId(); const moment = new mongoose.Types.ObjectId(); const notification = new mongoose.Types.ObjectId();
    await db.collection("moments").insertOne({ _id: moment, owner, mediaUrl: "legacy", mediaPublicId: "legacy", mediaType: "image", expiresAt: new Date(Date.now() - 1000) });
    await db.collection("notifications").insertOne({ _id: notification, recipient: owner, type: "system", title: "test", message: "test", expiresAt: new Date(Date.now() - 1000) });
    const scheduler = createExpirationScheduler({ enableTestOnly: true, ownerToken: owned.ownerToken, config: { batchSize: 1 } });
    try {
        assert.equal((await scheduler.runOnce()).processed, 1);
        assert.equal((await scheduler.runOnce()).processed, 1);
        assert.equal(await db.collection("moments").countDocuments({ _id: moment }), 0);
        assert.equal(await db.collection("notifications").countDocuments({ _id: notification }), 0);
        assert.equal((await db.collection("mediacleanuprecords").findOne({ _id: `moment:${moment}` })).status, "unresolved");
    } finally { await scheduler.stop(); }
});

dbtest("distributed lease prevents concurrent ownership and resumes after expiry", async () => {
    const db = mongoose.connection.db; const now = new Date();
    await db.collection("expirationschedulerleases").updateOne({ _id: "expiration" },
        { $set: { token: "other", expiresAt: new Date(now.getTime() + 60000), suspended: false, nextRetryAt: null } }, { upsert: true });
    const scheduler = createExpirationScheduler({ enableTestOnly: true, ownerToken: owned.ownerToken });
    try {
        assert.equal((await scheduler.runOnce()).status, "busy");
        await db.collection("expirationschedulerleases").updateOne({ _id: "expiration" }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
        assert.equal((await scheduler.runOnce()).status, "complete");
        const lease = await db.collection("expirationschedulerleases").findOne({ _id: "expiration" });
        assert.equal(lease.token, null); assert.ok(lease.fenceVersion >= 1);
    } finally { await scheduler.stop(); }
});
