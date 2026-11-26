import test from "node:test";
import assert from "node:assert/strict";
import { retryDecision, claimCleanupJob, recordCleanupFailure, quarantineExpiredCleanup, runCleanupWorkerOnce,
    createMockCloudinaryAdapter, runSyntheticCleanupBatch, createSyntheticCleanupWorker } from "../src/services/mediaCleanupWorker.service.js";

test("worker stays disabled even with injected deletion dependency", async () => {
    let calls = 0;
    const result = await runCleanupWorkerOnce({ cloudinaryDelete: async () => { calls++; }, eligibility: async () => { calls++; return { authorizedForDeletion: true }; } });
    assert.equal(result.status, "disabled");
    assert.equal(result.authorizedForDeletion, false);
    assert.equal(calls, 0);
});

test("synthetic worker only accepts the in-memory mock adapter", async () => {
    await assert.rejects(runSyntheticCleanupBatch({ adapter: { next: () => "success" } }), /mock adapter/);
    assert.throws(() => createMockCloudinaryAdapter(["delete remotely"]), /Invalid/);
    const worker = createSyntheticCleanupWorker({ adapter: createMockCloudinaryAdapter() });
    await worker.stop();
    assert.equal((await worker.runOnce()).status, "stopped");
});

test("retry limits, jitter and uncertain outcomes remain fail-closed", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const retry = retryDecision({ retryCount: 1, baseDelayMs: 1000, random: () => 0, now });
    assert.equal(retry.status, "pending");
    assert.equal(retry.nextRetryAt.getTime() - now.getTime(), 1000);
    assert.equal(retryDecision({ retryCount: 4, maxRetries: 5, now }).status, "failed");
    assert.equal(retryDecision({ retryCount: 0, outcomeUncertain: true, now }).status, "review_required");
});

test("claim, failure and recovery require an active transaction", async () => {
    await assert.rejects(claimCleanupJob({}), /active MongoDB transaction/);
    await assert.rejects(recordCleanupFailure({}), /active MongoDB transaction/);
    await assert.rejects(quarantineExpiredCleanup({}), /active MongoDB transaction/);
});
