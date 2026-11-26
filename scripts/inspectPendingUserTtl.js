import mongoose from "mongoose";
import { validateMigrationTarget } from "../src/services/ttlMigrationSafety.service.js";

// Read-only preparation. Dropping an existing TTL index requires a separate
// coordinated migration; this helper never modifies indexes or records.
const inspectPendingUserTtl = async ({ uri, dbName } = {}) => {
    validateMigrationTarget({ uri, dbName, nodeEnv: process.env.NODE_ENV });
    const connection = await mongoose.createConnection(uri, { autoIndex: false, serverSelectionTimeoutMS: 5000 }).asPromise();
    try {
        const db = connection.db;
        if (db.databaseName !== dbName || !await db.collection("_migration_safety").findOne({ _id: "ttl_index_migration", environment: "local_test", database: dbName })) throw new Error("Verified test marker required");
        const hello = await db.admin().command({ hello: 1 });
        const hosts = [...(hello.hosts || []), ...(hello.passives || []), ...(hello.arbiters || [])];
        if (!hello.setName || !hosts.length || hosts.some((host) => !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host))) throw new Error("Local replica set required");
        const indexes = await db.collection("pendingusers").indexes();
        return { dryRun: true, ttlIndexes: indexes.filter((index) => index.key?.verificationOtpExpiry && index.expireAfterSeconds !== undefined).map((index) => index.name),
            replacementExists: indexes.some((index) => index.name === "pending_user_expiration_scan" && index.key?.verificationOtpExpiry === 1 && index.key?._id === 1 && index.expireAfterSeconds === undefined) };
    } finally { await connection.close(); }
};
export { inspectPendingUserTtl };
