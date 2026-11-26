import crypto from "node:crypto";
import mongoose from "mongoose";
import { validateMigrationTarget } from "../../src/services/ttlMigrationSafety.service.js";

// TEST_MONGODB_URI is the only input. The marker database is read-only; every
// write goes to a new, empty, randomly named database on the same local server.
const openTestDatabase = async ({ uri = process.env.TEST_MONGODB_URI } = {}) => {
    if (!uri) throw new Error("TEST_MONGODB_URI is required");
    const parsed = new URL(uri);
    const markerDb = decodeURIComponent(parsed.pathname.slice(1));
    validateMigrationTarget({ uri, dbName: markerDb, nodeEnv: process.env.NODE_ENV });
    if (mongoose.connection.readyState !== 0) throw new Error("Default Mongoose connection must be disconnected");
    const markerConnection = await mongoose.createConnection(uri, { autoIndex: false, serverSelectionTimeoutMS: 5000 }).asPromise();
    let testDb;
    try {
        const hello = await markerConnection.db.admin().command({ hello: 1 });
        const hosts = [...(hello.hosts || []), ...(hello.passives || []), ...(hello.arbiters || [])];
        if (!hello.setName || hello.msg === "isdbgrid" || !hosts.length ||
            hosts.some((host) => !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host))) throw new Error("An exclusively local replica set is required");
        const marker = await markerConnection.db.collection("_integration_safety").findOne({ _id: "account_deletion_tests", environment: "local_test", database: markerDb });
        if (!marker) throw new Error("Verified local test marker is required");
        testDb = `test_codex_${crypto.randomBytes(12).toString("hex")}`;
        const existing = await markerConnection.db.admin().listDatabases({ nameOnly: true });
        if (existing.databases.some((db) => db.name === testDb)) throw new Error("Generated test database already exists");
    } finally { await markerConnection.close(); }
    parsed.pathname = `/${testDb}`;
    await mongoose.connect(parsed.toString(), { autoIndex: false, serverSelectionTimeoutMS: 5000 });
    if (mongoose.connection.db.databaseName !== testDb) { await mongoose.disconnect(); throw new Error("Unexpected test database"); }
    const ownerToken = crypto.randomBytes(32).toString("hex");
    await mongoose.connection.db.collection("_test_run_owner").insertOne({ _id: "owner", ownerToken });
    return { dbName: testDb, ownerToken };
};

const closeTestDatabase = async ({ dbName, ownerToken } = {}) => {
    const db = mongoose.connection.db;
    try {
        if (!db || db.databaseName !== dbName || !/^test_codex_[a-f0-9]{24}$/.test(dbName || "")) throw new Error("Refusing cleanup of unexpected database");
        const owner = await db.collection("_test_run_owner").findOne({ _id: "owner", ownerToken });
        if (!owner) throw new Error("Refusing cleanup without test ownership marker");
        // The database was verified absent before this run; every document here
        // is test-owned. Never drop a database, collection or index.
        const collections = await db.listCollections({}, { nameOnly: true }).toArray();
        for (const collection of collections) {
            if (collection.name === "_test_run_owner" || collection.name.startsWith("system.")) continue;
            await db.collection(collection.name).deleteMany({});
        }
        await db.collection("_test_run_owner").deleteOne({ _id: "owner", ownerToken });
    } finally { await mongoose.disconnect(); }
};

export { openTestDatabase, closeTestDatabase };
