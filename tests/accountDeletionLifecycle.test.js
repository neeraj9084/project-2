import test from "node:test";
import assert from "node:assert/strict";
import { assessDeletionLifecycle, runAccountDeletionLifecycle, refreshAccountDeletionLifecycle } from "../src/services/accountDeletionLifecycle.service.js";

test("pending, unresolved and failed jobs cannot complete deletion", () => {
    assert.equal(assessDeletionLifecycle({ databaseCleanupStatus: "pending" }).state, "requested");
    assert.equal(assessDeletionLifecycle({ databaseCleanupStatus: "complete", jobs: [{ status: "pending" }] }).state, "media_cleanup");
    assert.equal(assessDeletionLifecycle({ databaseCleanupStatus: "complete", jobs: [{ status: "unresolved" }] }).state, "blocked");
    assert.equal(assessDeletionLifecycle({ databaseCleanupStatus: "complete", jobs: [{ status: "failed" }] }).state, "failed");
    assert.equal(assessDeletionLifecycle({ databaseCleanupStatus: "complete", jobs: [{ status: "completed" }] }).canComplete, false);
});

test("retained assets are counted separately and never bypass review", () => {
    const result = assessDeletionLifecycle({ databaseCleanupStatus: "complete", jobs: [{ status: "review_required", retentionDecision: "retain_shared" },
        { status: "review_required", retentionDecision: "retain_moderation" }] });
    assert.equal(result.state, "media_review");
    assert.equal(result.counts.retainedShared, 1);
    assert.equal(result.counts.retainedModeration, 1);
    assert.equal(result.canComplete, false);
});

test("disabled execution never invokes cleanup, including retries", async () => {
    let calls = 0;
    for (let i = 0; i < 2; i++) {
        const result = await runAccountDeletionLifecycle({ userId: "507f1f77bcf86cd799439011", databaseCleanup: async () => { calls++; } });
        assert.equal(result.executionEnabled, false);
    }
    assert.equal(calls, 0);
    await assert.rejects(refreshAccountDeletionLifecycle("507f1f77bcf86cd799439011"), /active MongoDB transaction/);
});
