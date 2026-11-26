import crypto from "crypto";
import mongoose from "mongoose";
import { MediaCoverageBarrier } from "../models/mediaCoverageBarrier.model.js";
import { MediaCoverageApproval } from "../models/mediaCoverageApproval.model.js";
import { isCoverageSnapshotCurrent } from "./mediaCoverageBarrier.service.js";
import { validateMigrationTarget } from "./ttlMigrationSafety.service.js";
import { CloudinaryAsset } from "../models/cloudinaryAsset.model.js";
import { MediaCleanupRecord } from "../models/mediaCleanupRecord.model.js";

const assertIsolatedMediaTest = async ({ session, ownerToken }) => {
    if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required");
    const uri = process.env.TEST_MONGODB_URI;
    if (!uri || process.env.NODE_ENV === "production") throw new Error("Isolated test database required");
    let parsed;
    try { parsed = new URL(uri); } catch { throw new Error("Isolated test database required"); }
    validateMigrationTarget({ uri, dbName: parsed.pathname.slice(1), nodeEnv: process.env.NODE_ENV });
    const connection = mongoose.connection; const db = connection.db;
    if (!db || !/^test_codex_[a-f0-9]{24}$/.test(db.databaseName) || !["localhost", "127.0.0.1"].includes(connection.host) ||
        Number(connection.port) !== Number(parsed.port || 27017) || typeof ownerToken !== "string" || !/^[a-f0-9]{64}$/.test(ownerToken)) throw new Error("Isolated test database required");
    if (!await db.collection("_test_run_owner").findOne({ _id: "owner", ownerToken }, { session })) throw new Error("Test ownership marker required");
    return db;
};

// Only an empty, ephemeral database created by the integration harness may
// exercise this protocol. It cannot enable production or Cloudinary deletion.
const approveEmptyTestCoverage = async ({ session, snapshot, ownerToken, evidence, syntheticAssetId, syntheticAccountId } = {}) => {
    const db = await assertIsolatedMediaTest({ session, ownerToken });
    if (await db.collection("_migration_locks").findOne({ _id: "expiration_indexes" }, { session })) throw new Error("Expiration index migration is active");
    if (await db.collection("mediauploadintents").findOne({ status: { $ne: "referenced" } }, { session })) throw new Error("Unresolved upload intents block coverage");
    const migration = await db.collection("_media_index_migration").findOne({ _id: "expiration_indexes" }, { session });
    if (migration && migration.status !== "complete") throw new Error("Expiration index migration requires review");
    if (!evidence || evidence.scope !== "global" || evidence.backfillsVerified !== true ||
        evidence.moderationVerified !== true || evidence.indexMigrationVerified !== true || evidence.isolatedTest !== true) {
        throw new Error("Complete test evidence is required");
    }
    const barrier = await MediaCoverageBarrier.findById("global").session(session).lean();
    if (!barrier || !isCoverageSnapshotCurrent(snapshot, barrier.fenceVersion) || barrier.testRelease) throw new Error("Coverage verification is stale or unavailable");
    const collections = ["pendingusers", "pendingmediaretentions", "videos", "moments", "messages", "conversations", "notifications",
        "cloudinaryassetreferences", "assetmoderationholds", "reports", "copyrightclaims"];
    for (const name of collections) {
        if (await db.collection(name).findOne({}, { session, projection: { _id: 1 } })) throw new Error(`Test coverage cannot be approved with records in ${name}`);
    }
    const users = await db.collection("users").find({}, { session, projection: { _id: 1, testLifecycleFixture: 1 } }).toArray();
    if (syntheticAccountId) {
        if (users.length !== 1 || String(users[0]._id) !== String(syntheticAccountId) || users[0].testLifecycleFixture !== true) throw new Error("Invalid synthetic account fixture");
    } else if (users.length) throw new Error("Test coverage requires an empty user fixture");
    const assets = await CloudinaryAsset.find({}, null, { session }).lean();
    const jobs = await MediaCleanupRecord.find({}, null, { session }).lean();
    if (syntheticAssetId) {
        const asset = assets[0]; const job = jobs[0];
        const expected = asset && crypto.createHash("sha256").update(JSON.stringify([asset.cloudName, asset.publicId, asset.resourceType, asset.deliveryType])).digest("hex");
        if (assets.length !== 1 || jobs.length !== 1 || asset._id !== syntheticAssetId || expected !== asset._id ||
            asset.cloudName !== "isolated-test.invalid" || !asset.publicId.startsWith("synthetic/") || asset.lifecycleStatus !== "active" ||
            !["image", "video", "raw"].includes(asset.resourceType) || asset.deliveryType !== "upload" ||
            job.asset !== asset._id || job.cloudName !== asset.cloudName || job.publicId !== asset.publicId || job.resourceType !== asset.resourceType ||
            job.deliveryType !== asset.deliveryType || job.status !== "pending" ||
            (syntheticAccountId && String(job.user) !== String(syntheticAccountId))) throw new Error("Invalid synthetic coverage fixture");
    } else if (assets.length || jobs.length) throw new Error("Test coverage requires an empty fixture");
    // Evidence must agree with real index metadata; missing collections or
    // scan indexes are not silently treated as migrated. Catalog commands cannot
    // participate in a transaction; use the verified harness database without
    // the transaction session. The approval and coverage fence remain transactional.
    for (const [collection, expected, field] of [["moments", "moment_expiration_scan", "expiresAt"], ["notifications", "notification_expiration_scan", "expiresAt"], ["pendingusers", "pending_user_expiration_scan", "verificationOtpExpiry"]]) {
        const indexes = await db.collection(collection).indexes();
        if (!indexes.some((index) => index.name === expected && JSON.stringify(index.key) === JSON.stringify({ [field]: 1, _id: 1 }) && index.expireAfterSeconds === undefined && !index.partialFilterExpression && !index.sparse && !index.hidden && !index.collation) ||
            indexes.some((index) => index.key?.[field] && index.expireAfterSeconds !== undefined)) throw new Error("Expiration index evidence is incomplete");
    }
    // This fresh non-session read catches migrations started during inspection.
    // Out-of-band DDL remains uncoordinated; production approval stays disabled.
    if (await db.collection("_migration_locks").findOne({ _id: "expiration_indexes" })) throw new Error("Expiration index migration is active");
    const approvalId = crypto.randomUUID();
    const approvedAt = new Date();
    const updated = await MediaCoverageBarrier.updateOne({ _id: "global", fenceVersion: barrier.fenceVersion, testRelease: { $ne: true } },
        { $inc: { fenceVersion: 1 }, $set: { testRelease: true, testApprovalId: approvalId, verifiedVersion: barrier.fenceVersion + 1, verifiedAt: approvedAt } }, { session });
    if (updated.modifiedCount !== 1) throw new Error("Coverage verification is stale");
    await MediaCoverageApproval.create([{ _id: approvalId, scope: "global", verificationVersion: barrier.fenceVersion,
        approvedVersion: barrier.fenceVersion + 1, approvedAt, evidence: { ...evidence, syntheticAssetId: syntheticAssetId || null,
            syntheticAccountId: syntheticAccountId ? String(syntheticAccountId) : null }, status: "test_approved" }], { session });
    return { approvalId, scope: "global", testOnly: true, authorizedForDeletion: false, fenceVersion: barrier.fenceVersion + 1 };
};

export { approveEmptyTestCoverage, assertIsolatedMediaTest };
