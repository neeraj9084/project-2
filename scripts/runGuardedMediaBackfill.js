import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateMigrationTarget } from "../src/services/ttlMigrationSafety.service.js";
import { runGuardedBackfillPage } from "../src/services/guardedMediaBackfill.service.js";

// This executable accepts only a harness-created local test database. It is
// intentionally not a production runner and performs no work on import.
const main = async () => {
    const args = process.argv.slice(2); const get = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
    const uri = process.env.TEST_MONGODB_URI; if (!uri) throw new Error("TEST_MONGODB_URI is required");
    const parsed = new URL(uri); const dbName = parsed.pathname.slice(1);
    validateMigrationTarget({ uri, dbName, nodeEnv: process.env.NODE_ENV });
    if (!/^test_codex_[a-f0-9]{24}$/.test(dbName)) throw new Error("Harness-owned test database is required");
    await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
    try {
        const hello = await mongoose.connection.db.admin().command({ hello: 1 });
        const hosts = [...(hello.hosts || []), ...(hello.passives || []), ...(hello.arbiters || [])];
        if (!hello.setName || !hosts.length || hello.msg === "isdbgrid" || hosts.some((host) => !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host))) throw new Error("Exclusively local replica set required");
        const result = await runGuardedBackfillPage({ source: get("--source"), runId: get("--run-id"), ownerToken: process.env.TEST_RUN_OWNER_TOKEN,
            dryRun: !args.includes("--execute"), cursor: get("--cursor"), limit: get("--limit") ? Number(get("--limit")) : 100,
            operator: process.env.TEST_BACKFILL_OPERATOR, backupEvidence: process.env.TEST_BACKFILL_BACKUP_EVIDENCE,
            maintenanceId: process.env.TEST_BACKFILL_MAINTENANCE_ID, token: process.env.TEST_BACKFILL_TOKEN,
            recover: args.includes("--recover"), quiescenceConfirmed: args.includes("--confirm-previous-owner-stopped") });
        process.stdout.write(`${JSON.stringify(result)}\n`);
    } finally { await mongoose.disconnect(); }
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
export { main };
