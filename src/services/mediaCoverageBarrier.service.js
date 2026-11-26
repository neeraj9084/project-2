import { MediaCoverageBarrier } from "../models/mediaCoverageBarrier.model.js";
import { MediaCoverageApproval } from "../models/mediaCoverageApproval.model.js";

// All participating writes fence the same document in their transaction.
// There is intentionally no operation that sets coverage to complete.
const fenceMediaCoverage = async ({ session } = {}) => {
    if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required");
    await MediaCoverageBarrier.updateOne({ _id: "global" },
        { $set: { coverageStatus: "blocked", verifiedVersion: null, verifiedAt: null, testRelease: false, testApprovalId: null }, $inc: { fenceVersion: 1 } },
        { upsert: true, session });
    await MediaCoverageApproval.updateMany({ status: "test_approved" },
        { $set: { status: "invalidated", invalidatedAt: new Date(), invalidationReason: "coverage_mutation" } }, { session });
};

// Offline validation only; a matching version is necessary but not sufficient.
const isCoverageSnapshotCurrent = (snapshot, currentVersion) => Number.isSafeInteger(currentVersion) &&
    currentVersion >= 0 && snapshot?.stable === true && snapshot?.fenceVersion === currentVersion;

const approveMediaCoverage = async ({ session, snapshot } = {}) => {
    if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required");
    const barrier = await MediaCoverageBarrier.findById("global").session(session).lean();
    if (!barrier || !isCoverageSnapshotCurrent(snapshot, barrier.fenceVersion)) throw new Error("Coverage verification is stale or unavailable");
    // No completion until independent path, migration and concurrency audits exist.
    throw new Error("Coverage completion is disabled until prerequisites are independently verified");
};

const requireCompleteMediaCoverage = async ({ session } = {}) => {
    if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required");
    await fenceMediaCoverage({ session });
    // No deployment can lift this barrier until a separate audited protocol
    // proves complete reference and moderation coverage.
    throw new Error("Media coverage is incomplete; deletion is disabled");
};

export { fenceMediaCoverage, requireCompleteMediaCoverage, isCoverageSnapshotCurrent, approveMediaCoverage };
