import test from "node:test";
import assert from "node:assert/strict";
import { validateMigrationTarget, planExpirationIndexes } from "../src/services/ttlMigrationSafety.service.js";
import { createExpirationScheduler, validateExpirationSchedulerConfig } from "../src/services/expirationScheduler.service.js";

test("migration guard blocks production, remote databases and unconfirmed execution", () => {
    const safe = { uri: "mongodb://localhost:27017/test_expiration", dbName: "test_expiration" };
    assert.equal(validateMigrationTarget(safe).execute, false);
    assert.throws(() => validateMigrationTarget({ ...safe, nodeEnv: "production" }), /Production/);
    assert.throws(() => validateMigrationTarget({ ...safe, uri: "mongodb://remote:27017/test_expiration" }), /local test/);
    assert.throws(() => validateMigrationTarget({ ...safe, execute: true }), /authorization/);
    assert.equal(validateMigrationTarget({ ...safe, execute: true, confirmedDb: "test_expiration", acknowledged: true }).execute, true);
});

test("TTL detection uses index metadata and rejects replacement conflicts", () => {
    const plan = planExpirationIndexes([{ name: "custom_ttl", key: { expiresAt: 1 }, expireAfterSeconds: 0 },
        { name: "other", key: { createdAt: 1 }, expireAfterSeconds: 0 }], "expiration_scan");
    assert.deepEqual(plan.ttlIndexes.map((item) => item.name), ["custom_ttl"]);
    assert.throws(() => planExpirationIndexes([{ name: "expiration_scan", key: { expiresAt: 1 }, expireAfterSeconds: 0 }], "expiration_scan"), /conflicts/);
    const pending = planExpirationIndexes([{ name: "renamed_ttl", key: { verificationOtpExpiry: 1 }, expireAfterSeconds: 0 }], "pending_user_expiration_scan", "verificationOtpExpiry");
    assert.equal(pending.ttlIndexes[0].name, "renamed_ttl");
    assert.throws(() => planExpirationIndexes([{ name: "pending_user_expiration_scan", key: { verificationOtpExpiry: 1, _id: 1 }, partialFilterExpression: { active: true } }], "pending_user_expiration_scan", "verificationOtpExpiry"), /conflicts/);
});

test("scheduler is disabled and validates limits without invoking dependencies", async () => {
    let calls = 0;
    const scheduler = createExpirationScheduler({ momentExpiration: async () => { calls++; }, notificationExpiration: async () => { calls++; } });
    assert.equal((await scheduler.runOnce()).status, "disabled");
    await assert.rejects(scheduler.start(), /disabled/);
    assert.throws(() => validateExpirationSchedulerConfig({ concurrency: 2 }), /Invalid/);
    assert.throws(() => validateExpirationSchedulerConfig({ batchSize: 501 }), /Invalid/);
    assert.throws(() => validateExpirationSchedulerConfig({ intervalMs: 1 }), /Invalid/);
    assert.equal(calls, 0);
});
