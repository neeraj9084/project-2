import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import { validateMigrationTarget, planExpirationIndexes } from "../src/services/ttlMigrationSafety.service.js";

// This tool only accepts an explicitly marked local test database. It is never
// imported by the app and never runs on import.
const migrateExpirationIndexes = async ({ uri, dbName, execute = false, confirmedDb, acknowledged = false,
    recover = false, expectedToken, quiescenceConfirmed = false, leaseMs = 60000 } = {}) => {
    validateMigrationTarget({ uri, dbName, execute, confirmedDb, acknowledged, nodeEnv: process.env.NODE_ENV });
    if (typeof recover !== "boolean" || typeof quiescenceConfirmed !== "boolean" || !Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 3600000) throw new Error("Invalid migration recovery options");
    // The operator must actually stop the former process and confirm any DDL
    // has ended. A lease timeout or token fence cannot cancel an in-flight DDL.
    if (execute && recover && (quiescenceConfirmed !== true || typeof expectedToken !== "string" || !expectedToken)) throw new Error("Recovery requires the prior token and confirmed owner quiescence");
    const connection = await mongoose.createConnection(uri, { autoIndex: false, serverSelectionTimeoutMS: 5000 }).asPromise();
    let locked = false;
    let completed = false;
    let alreadyRecovered = false;
    const token = crypto.randomUUID();
    let fencingVersion;
    try {
        if (connection.db.databaseName !== dbName) throw new Error("Connected database differs from confirmed target");
        const marker = await connection.db.collection("_migration_safety").findOne({ _id: "ttl_index_migration", environment: "local_test", database: dbName });
        if (!marker) throw new Error("Verified local test database marker is required");
        const hello = await connection.db.admin().command({ hello: 1 });
        const hosts = [...(hello.hosts || []), ...(hello.passives || []), ...(hello.arbiters || [])];
        if (!hello.setName || !hosts.length || hello.msg === "isdbgrid" || hosts.some((host) => !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host))) throw new Error("An exclusively local replica set is required");
        const targets = [{ collection: "moments", name: "moment_expiration_scan", field: "expiresAt" },
            { collection: "notifications", name: "notification_expiration_scan", field: "expiresAt" },
            { collection: "pendingusers", name: "pending_user_expiration_scan", field: "verificationOtpExpiry" }];
        const report = [];
        for (const target of targets) {
            const exists = await connection.db.listCollections({ name: target.collection }, { nameOnly: true }).hasNext();
            if (!exists) throw new Error(`Collection ${target.collection} does not exist`);
            const indexes = await connection.db.collection(target.collection).indexes();
            report.push({ ...target, ...planExpirationIndexes(indexes, target.name, target.field) });
        }
        if (!execute) return { dryRun: true, database: dbName, collections: report };
        const locks = connection.db.collection("_migration_locks");
        const session = await connection.startSession();
        try { await session.withTransaction(async () => {
            const state = await connection.db.collection("_media_index_migration").findOne({ _id: "expiration_indexes" }, { session });
            if (recover && state?.status === "complete" && state.recoveredFrom === expectedToken) { alreadyRecovered = true; return; }
            if (recover && (!state || state.status === "complete")) throw new Error("No unresolved migration to recover or stale recovery token");
            if (state && state.status !== "complete") {
                if (!recover || state.token !== expectedToken || !["active", "failed"].includes(state.status)) throw new Error("Unresolved migration or stale recovery token");
                if (state.status === "active" && (!(state.leaseUntil instanceof Date) || state.leaseUntil > new Date())) throw new Error("Active or uncertain migration lease cannot be recovered");
                const existingLock = await locks.findOne({ _id: "expiration_indexes" }, { session });
                if (existingLock && existingLock.token !== expectedToken) throw new Error("Migration lock ownership is uncertain");
                if (existingLock) await locks.deleteOne({ _id: "expiration_indexes", token: expectedToken }, { session });
            }
            fencingVersion = (state?.version || 0) + 1;
            await locks.insertOne({ _id: "expiration_indexes", token, startedAt: new Date(), database: dbName }, { session });
            await connection.db.collection("_media_index_migration").updateOne({ _id: "expiration_indexes" },
                { $set: { status: "active", token, recoveredFrom: recover ? expectedToken : null, startedAt: new Date(), leaseUntil: new Date(Date.now() + leaseMs), database: dbName }, $inc: { version: 1 } }, { upsert: true, session });
            await connection.db.collection("mediacoveragebarriers").updateOne({ _id: "global" },
                { $set: { coverageStatus: "blocked", verifiedVersion: null, verifiedAt: null, testRelease: false, testApprovalId: null }, $inc: { fenceVersion: 1 } }, { upsert: true, session });
            await connection.db.collection("mediacoverageapprovals").updateMany({ status: "test_approved" },
                { $set: { status: "invalidated", invalidatedAt: new Date(), invalidationReason: "index_migration" } }, { session });
        }); } finally { await session.endSession(); }
        if (alreadyRecovered) {
            if (report.some((entry) => !entry.replacementExists || entry.ttlIndexes.length)) throw new Error("Recovered index evidence is stale; review required");
            return { dryRun: false, database: dbName, alreadyRecovered: true, collections: report };
        }
        locked = true;
        const assertOwnership = async () => {
            const result = await connection.db.collection("_media_index_migration").updateOne(
                { _id: "expiration_indexes", token, version: fencingVersion, status: "active", leaseUntil: { $gt: new Date() } },
                { $set: { leaseUntil: new Date(Date.now() + leaseMs) } });
            if (result.matchedCount !== 1) throw new Error("Stale migration ownership or expired lease");
        };
        for (const item of report) {
            const collection = connection.db.collection(item.collection);
            await assertOwnership();
            const current = planExpirationIndexes(await collection.indexes(), item.name, item.field);
            if (!current.replacementExists) { await assertOwnership(); await collection.createIndex({ [item.field]: 1, _id: 1 }, { name: item.name }); }
            for (const index of current.ttlIndexes) {
                // Recheck actual metadata immediately before each targeted drop.
                const verified = planExpirationIndexes(await collection.indexes(), item.name, item.field).ttlIndexes;
                if (!verified.some((candidate) => candidate.name === index.name && candidate.expireAfterSeconds === index.expireAfterSeconds)) throw new Error("TTL index changed during migration");
                await assertOwnership();
                await collection.dropIndex(index.name);
            }
            const final = planExpirationIndexes(await collection.indexes(), item.name, item.field);
            if (!final.replacementExists || final.ttlIndexes.length) throw new Error(`Expiration index verification failed for ${item.collection}`);
        }
        await assertOwnership();
        completed = true;
        return { dryRun: false, database: dbName, collections: report };
    } finally {
        if (locked) {
            const session = await connection.startSession();
            try { await session.withTransaction(async () => {
                const finalized = await connection.db.collection("_media_index_migration").updateOne({ _id: "expiration_indexes", token, version: fencingVersion, status: "active" },
                    { $set: { status: completed ? "complete" : "failed", finishedAt: new Date() }, $inc: { version: 1 } }, { session });
                if (finalized.matchedCount !== 1) throw new Error("Stale migration owner cannot finalize");
                await connection.db.collection("_migration_locks").deleteOne({ _id: "expiration_indexes", database: dbName, token }, { session });
                await connection.db.collection("mediacoveragebarriers").updateOne({ _id: "global" },
                    { $set: { coverageStatus: "blocked", verifiedVersion: null, verifiedAt: null, testRelease: false, testApprovalId: null }, $inc: { fenceVersion: 1 } }, { upsert: true, session });
                await connection.db.collection("mediacoverageapprovals").updateMany({ status: "test_approved" },
                    { $set: { status: "invalidated", invalidatedAt: new Date(), invalidationReason: "index_migration" } }, { session });
            }); } finally { await session.endSession(); }
        }
        await connection.close();
    }
};

const main = async () => {
    const args = process.argv.slice(2);
    const execute = args.includes("--execute");
    const get = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
    const result = await migrateExpirationIndexes({ uri: process.env.TTL_MIGRATION_URI, dbName: get("--db"), execute,
        confirmedDb: get("--confirm-db"), acknowledged: args.includes("--acknowledge-local-test-only"),
        recover: args.includes("--recover"), expectedToken: get("--expected-token"), quiescenceConfirmed: args.includes("--confirm-previous-owner-stopped") });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => { process.stderr.write(`Migration failed: ${error.message}\n`); process.exitCode = 1; });
}
export { migrateExpirationIndexes };
