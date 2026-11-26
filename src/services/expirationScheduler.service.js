import crypto from "crypto";
import mongoose from "mongoose";
import { Moment } from "../models/moment.model.js";
import { Notification } from "../models/notification.model.js";
import { ExpirationSchedulerLease } from "../models/expirationSchedulerLease.model.js";
import { expireMoment } from "./expireMoment.service.js";
import { expireNotification } from "./expireNotification.service.js";
import { validateMigrationTarget } from "./ttlMigrationSafety.service.js";

const validateExpirationSchedulerConfig = ({ batchSize = 100, maxRetries = 3, retryDelayMs = 1000,
    concurrency = 1, intervalMs = 60000, leaseMs = 120000 } = {}) => {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500 ||
        !Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 10 ||
        !Number.isSafeInteger(retryDelayMs) || retryDelayMs < 100 || retryDelayMs > 60000 || concurrency !== 1 ||
        !Number.isSafeInteger(intervalMs) || intervalMs < 1000 || intervalMs > 86400000 ||
        !Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 3600000) throw new Error("Invalid expiration scheduler configuration");
    return { batchSize, maxRetries, retryDelayMs, concurrency, intervalMs, leaseMs };
};

const verifyIsolatedExpirationTarget = async (ownerToken) => {
    const uri = process.env.TEST_MONGODB_URI;
    if (!uri || process.env.NODE_ENV === "production") throw new Error("Isolated test database required");
    let parsed;
    try { parsed = new URL(uri); } catch { throw new Error("Isolated test database required"); }
    validateMigrationTarget({ uri, dbName: parsed.pathname.slice(1), nodeEnv: process.env.NODE_ENV });
    const connection = mongoose.connection; const db = connection.db;
    if (!db || !/^test_codex_[a-f0-9]{24}$/.test(db.databaseName) || !["localhost", "127.0.0.1"].includes(connection.host) ||
        Number(connection.port) !== Number(parsed.port || 27017) || typeof ownerToken !== "string" || !/^[a-f0-9]{64}$/.test(ownerToken)) throw new Error("Isolated test database required");
    if (!await db.collection("_test_run_owner").findOne({ _id: "owner", ownerToken })) throw new Error("Test ownership marker required");
    const hello = await db.admin().command({ hello: 1 });
    const hosts = [...(hello.hosts || []), ...(hello.passives || []), ...(hello.arbiters || [])];
    if (!hello.setName || hello.msg === "isdbgrid" || !hosts.length || hosts.some((h) => !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(h))) throw new Error("An exclusively local replica set is required");
    for (const [collection, expected] of [["moments", "moment_expiration_scan"], ["notifications", "notification_expiration_scan"]]) {
        const indexes = await db.collection(collection).indexes();
        if (!indexes.some((i) => i.name === expected && i.key?.expiresAt === 1 && i.key?._id === 1 && i.expireAfterSeconds === undefined) ||
            indexes.some((i) => i.key?.expiresAt && i.expireAfterSeconds !== undefined)) throw new Error("Expiration index migration is incomplete");
    }
};

const createExpirationScheduler = ({ config, ownerToken, enableTestOnly = false,
    momentExpiration = expireMoment, notificationExpiration = expireNotification, logger = () => {} } = {}) => {
    const settings = validateExpirationSchedulerConfig(config);
    if (typeof momentExpiration !== "function" || typeof notificationExpiration !== "function" || typeof logger !== "function") throw new Error("Invalid expiration dependencies");
    let running = null; let timer = null; let stopping = false;
    const runOnce = async () => {
        if (enableTestOnly !== true) return { status: "disabled", processed: 0, retryable: false };
        if (running) return { status: "busy", processed: 0 };
        running = (async () => {
            await verifyIsolatedExpirationTarget(ownerToken);
            const now = new Date(); const token = crypto.randomUUID();
            let lease;
            try {
                lease = await ExpirationSchedulerLease.findOneAndUpdate({ _id: "expiration", suspended: { $ne: true },
                    $and: [{ $or: [{ token: null }, { expiresAt: { $lte: now } }] }, { $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }] }] },
                { $set: { token, expiresAt: new Date(now.getTime() + settings.leaseMs) }, $inc: { fenceVersion: 1 } },
                { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }).select("+token").lean();
            } catch (error) { if (error.code === 11000) return { status: "busy", processed: 0 }; throw error; }
            if (!lease) return { status: "busy", processed: 0 };
            const fence = lease.fenceVersion; let processed = 0;
            try {
                for (let index = 0; index < settings.batchSize && !stopping; index++) {
                    const session = await mongoose.startSession(); let found = false;
                    try { await session.withTransaction(async () => {
                        const current = new Date();
                        const held = await ExpirationSchedulerLease.updateOne({ _id: "expiration", token, fenceVersion: fence, expiresAt: { $gt: current } },
                            { $set: { expiresAt: new Date(current.getTime() + settings.leaseMs) } }, { session });
                        if (held.matchedCount !== 1) throw new Error("Scheduler lease is stale");
                        const first = index % 2 ? "notification" : "moment";
                        for (const kind of [first, first === "moment" ? "notification" : "moment"]) {
                            const model = kind === "moment" ? Moment : Notification;
                            const item = await model.findOne({ expiresAt: { $type: "date", $lte: current } }).select("_id").sort({ expiresAt: 1, _id: 1 }).session(session).lean();
                            if (!item) continue;
                            found = true;
                            if (kind === "moment") await momentExpiration(item._id, { session });
                            else await notificationExpiration(item._id, { session, asOf: current });
                            break;
                        }
                    }); } finally { await session.endSession(); }
                    if (!found) break;
                    processed++;
                }
                const released = await ExpirationSchedulerLease.updateOne({ _id: "expiration", token, fenceVersion: fence, expiresAt: { $gt: new Date() } },
                    { $set: { token: null, expiresAt: null, retryCount: 0, nextRetryAt: null, lastError: null, lastCompletedAt: new Date() } });
                if (released.matchedCount !== 1) throw new Error("Scheduler lease is stale");
                return { status: "complete", processed };
            } catch (error) {
                const retries = (lease.retryCount || 0) + 1; const exhausted = retries > settings.maxRetries;
                const delay = Math.min(3600000, settings.retryDelayMs * (2 ** Math.min(retries - 1, 20)));
                await ExpirationSchedulerLease.updateOne({ _id: "expiration", token, fenceVersion: fence, expiresAt: { $gt: new Date() } },
                    { $set: { token: null, expiresAt: null, retryCount: retries, suspended: exhausted,
                        nextRetryAt: exhausted ? null : new Date(Date.now() + delay), lastError: "expiration_batch_failed" } });
                try { logger({ event: "expiration_batch_failed", retryable: !exhausted }); } catch { /* logging is noncritical */ }
                return { status: "failed", processed, retryable: !exhausted, error: "expiration_batch_failed" };
            }
        })();
        try { return await running; } finally { running = null; }
    };
    const start = async () => {
        if (enableTestOnly !== true) throw new Error("Expiration scheduler activation is disabled");
        await verifyIsolatedExpirationTarget(ownerToken);
        if (timer) throw new Error("Expiration scheduler already started");
        stopping = false;
        timer = setInterval(() => { runOnce().catch(() => { try { logger({ event: "expiration_scheduler_failed" }); } catch {} }); }, settings.intervalMs);
        return { status: "started_test_only" };
    };
    const stop = async () => { stopping = true; if (timer) clearInterval(timer); timer = null; if (running) await running.catch(() => {}); };
    return { settings, runOnce, start, stop };
};

export { validateExpirationSchedulerConfig, createExpirationScheduler };
