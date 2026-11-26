import crypto from "node:crypto";
import mongoose from "mongoose";
import { assertIsolatedMediaTest } from "./testMediaCoverageApproval.service.js";
import { backfillMediaReferences } from "./backfillMediaReferences.service.js";
import { fenceMediaCoverage } from "./mediaCoverageBarrier.service.js";

const sources = new Set(["users", "pendingUsers", "videos", "moments", "messages", "conversations", "notifications", "moderationReports", "moderationCopyright"]);
const transaction = async (fn) => { const session = await mongoose.startSession();
    try { return await session.withTransaction(() => fn(session)); } finally { await session.endSession(); } };
const validId = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);

// Deliberately limited to harness-owned local databases. The marker only
// simulates authorization, backup and maintenance evidence for tests.
const runGuardedBackfillPage = async ({ source, runId, ownerToken, dryRun = true, limit = 100, cursor,
    operator, backupEvidence, maintenanceId, token, recover = false, quiescenceConfirmed = false, leaseMs = 120000 } = {}) => {
    if (!sources.has(source) || !validId(runId) || typeof dryRun !== "boolean" || typeof recover !== "boolean" ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 3600000) throw new Error("Invalid guarded backfill options");
    await transaction((session) => assertIsolatedMediaTest({ session, ownerToken }));
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    const hosts = [...(hello.hosts || []), ...(hello.passives || []), ...(hello.arbiters || [])];
    if (!hello.setName || !hosts.length || hello.msg === "isdbgrid" || hosts.some((host) => !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host))) throw new Error("Exclusively local replica set required");
    if (dryRun) return { dryRun: true, result: await backfillMediaReferences({ source, cursor, limit, dryRun: true }) };
    if (![operator, backupEvidence, maintenanceId].every(validId)) throw new Error("Verified test authorization, backup and maintenance evidence required");
    const db = mongoose.connection.db; const checkpoints = db.collection("_guarded_backfill_runs");
    const locks = db.collection("_migration_locks");
    let currentToken = token;
    await transaction(async (session) => {
        await assertIsolatedMediaTest({ session, ownerToken });
        const proof = await db.collection("_backfill_preflight").findOne({ _id: "controlled_backfill", database: db.databaseName,
            ownerToken, operator, backupEvidence, maintenanceId, authorized: true, maintenanceActive: true }, { session });
        if (!proof) throw new Error("Verified test authorization, backup and maintenance evidence required");
        const migration = await db.collection("_media_index_migration").findOne({ _id: "expiration_indexes" }, { session });
        if (migration && migration.status !== "complete") throw new Error("Unresolved index migration blocks backfill");
        const previous = await checkpoints.findOne({ _id: runId }, { session });
        if (previous && (previous.source !== source || previous.operator !== operator || previous.backupEvidence !== backupEvidence || previous.maintenanceId !== maintenanceId)) throw new Error("Backfill checkpoint identity mismatch");
        if (previous?.status === "complete") { currentToken = null; return; }
        if (previous && token === previous.token && previous.status === "active" && previous.leaseUntil > new Date() && !recover) {
            const held = await locks.updateOne({ _id: "expiration_indexes", token, runId }, { $set: { leaseUntil: new Date(Date.now() + leaseMs) } }, { session });
            if (held.matchedCount !== 1) throw new Error("Backfill ownership is stale");
            await checkpoints.updateOne({ _id: runId, token, status: "active" }, { $set: { leaseUntil: new Date(Date.now() + leaseMs) } }, { session });
            return;
        }
        if (previous) {
            if (!recover || quiescenceConfirmed !== true || token !== previous.token || !["active", "failed"].includes(previous.status) ||
                (previous.status === "active" && (!(previous.leaseUntil instanceof Date) || previous.leaseUntil > new Date()))) throw new Error("Backfill requires reviewed recovery or ownership is stale");
            const lock = await locks.findOne({ _id: "expiration_indexes" }, { session });
            if (!lock || lock.token !== token || lock.runId !== runId) throw new Error("Backfill lock is uncertain");
            await locks.deleteOne({ _id: "expiration_indexes", token, runId }, { session });
        }
        currentToken = crypto.randomUUID();
        await locks.insertOne({ _id: "expiration_indexes", token: currentToken, runId, kind: "backfill", leaseUntil: new Date(Date.now() + leaseMs) }, { session });
        await checkpoints.updateOne({ _id: runId }, { $set: { source, operator, backupEvidence, maintenanceId, token: currentToken,
            status: "active", leaseUntil: new Date(Date.now() + leaseMs), updatedAt: new Date() }, $setOnInsert: { cursor: null }, $inc: { fenceVersion: 1 } }, { upsert: true, session });
        await fenceMediaCoverage({ session });
    });
    if (!currentToken) return { dryRun: false, status: "complete", alreadyComplete: true };
    const guard = async (session) => {
        await assertIsolatedMediaTest({ session, ownerToken });
        const now = new Date();
        const proof = await db.collection("_backfill_preflight").findOne({ _id: "controlled_backfill", database: db.databaseName,
            ownerToken, operator, backupEvidence, maintenanceId, authorized: true, maintenanceActive: true }, { session });
        if (!proof) throw new Error("Test maintenance authorization is no longer valid");
        const lock = await locks.updateOne({ _id: "expiration_indexes", runId, token: currentToken, leaseUntil: { $gt: now } },
            { $set: { leaseUntil: new Date(now.getTime() + leaseMs) } }, { session });
        const state = await checkpoints.updateOne({ _id: runId, token: currentToken, status: "active", leaseUntil: { $gt: now } },
            { $set: { leaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now } }, { session });
        if (lock.matchedCount !== 1 || state.matchedCount !== 1) throw new Error("Backfill ownership is stale");
    };
    const state = await checkpoints.findOne({ _id: runId, token: currentToken });
    if (!state) throw new Error("Backfill ownership is stale");
    const page = await backfillMediaReferences({ source, cursor: state.cursor, limit, dryRun: false, transactionGuard: guard });
    await transaction(async (session) => {
        await guard(session);
        await fenceMediaCoverage({ session });
        const status = page.failed ? "failed" : page.complete ? "complete" : "active";
        const update = await checkpoints.updateOne({ _id: runId, token: currentToken, status: "active" },
            { $set: { cursor: page.nextCursor, status, updatedAt: new Date(), lastFailure: page.failed ? "page_failed" : null },
                $inc: { pages: 1, scanned: page.scanned || 0 } }, { session });
        if (update.matchedCount !== 1) throw new Error("Backfill ownership is stale");
        if (status === "complete") await locks.deleteOne({ _id: "expiration_indexes", runId, token: currentToken }, { session });
    });
    return { dryRun: false, status: page.failed ? "failed" : page.complete ? "complete" : "active", token: currentToken, result: page };
};
export { runGuardedBackfillPage };
