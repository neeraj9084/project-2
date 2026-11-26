import mongoose from "mongoose";
import { Report } from "../models/report.model.js";
import { CopyrightClaim } from "../models/copyrightClaim.model.js";
import { Video } from "../models/video.model.js";
import { CloudinaryAsset } from "../models/cloudinaryAsset.model.js";
import { AssetModerationHold } from "../models/assetModerationHold.model.js";
import { verifiedAttachment } from "./messageAttachmentRegistry.service.js";
import { registerAssetReference } from "./cloudinaryAssetReference.service.js";
import { fenceMediaCoverage } from "./mediaCoverageBarrier.service.js";

const sources = { report: { model: Report, actor: "reporter" }, copyright: { model: CopyrightClaim, actor: "claimant" } };
const validDate = (value) => value instanceof Date && Number.isFinite(value.getTime());

// A page stops at its first failed case. Resume using nextCursor; that case
// will be retried. Existing holds, including releases and retention, are untouched.
const backfillModerationHolds = async ({ caseType, cursor, limit = 100, dryRun = true } = {}) => {
    const source = sources[caseType];
    if (!source || typeof dryRun !== "boolean" || !Number.isSafeInteger(limit) || limit < 1 || limit > 500 ||
        (cursor != null && (typeof cursor !== "string" || !/^[0-9a-f]{24}$/i.test(cursor)))) {
        throw new Error("Invalid moderation backfill options");
    }
    const filter = cursor ? { _id: { $gt: new mongoose.Types.ObjectId(cursor) } } : {};
    const cases = await source.model.find(filter).sort({ _id: 1 }).limit(limit + 1).lean();
    const page = cases.slice(0, limit);
    const result = { caseType, dryRun, scanned: 0, active: 0, unresolved: 0, existing: 0,
        failed: 0, failures: [], nextCursor: null, complete: false };
    let lastCursor = cursor || null;

    const processCase = async (initial, session) => {
        const query = source.model.findById(initial._id);
        if (session) query.session(session);
        const record = await query.lean();
        if (!record) throw new Error("Case no longer exists");
        const actor = record[source.actor];
        if (!mongoose.isValidObjectId(record.video) || !mongoose.isValidObjectId(actor)) throw new Error("Case has an invalid video or actor reference");
        const videoQuery = Video.findById(record.video).select("videoFile videoPublicId thumbnail thumbnailPublicId updatedAt isDeleted +videoDeliveryType +thumbnailDeliveryType +mediaRegistry");
        if (session) videoQuery.session(session);
        const video = await videoQuery.lean();
        const unchanged = video && !video.isDeleted && validDate(record.createdAt) && validDate(video.updatedAt) && video.updatedAt < record.createdAt;
        const counts = { active: 0, unresolved: 0, existing: 0 };
        if (session) await fenceMediaCoverage({ session });
        for (const slot of ["video", "thumbnail"]) {
            const id = `${caseType}:${record._id}:${slot}`;
            const holdQuery = AssetModerationHold.findById(id);
            if (session) holdQuery.session(session);
            const existing = await holdQuery.lean();
            if (existing) {
                if (existing.caseType !== caseType || String(existing.caseId) !== String(record._id) || existing.slot !== slot ||
                    String(existing.video) !== String(record.video) || String(existing.actor) !== String(actor)) throw new Error("Existing moderation hold conflicts with case");
                counts.existing++;
                continue;
            }
            const metadata = video?.mediaRegistry?.[slot];
            const verified = unchanged && verifiedAttachment({ url: slot === "video" ? video.videoFile : video.thumbnail,
                publicId: video[`${slot}PublicId`], resourceType: slot === "video" ? "video" : "image",
                deliveryType: video[`${slot}DeliveryType`], mediaRegistry: metadata });
            let asset = null;
            if (verified) {
                const assetQuery = CloudinaryAsset.findById(verified.asset);
                if (session) assetQuery.session(session);
                const registered = await assetQuery.lean();
                if (registered && registered.cloudName === verified.cloudName && registered.publicId === verified.publicId &&
                    registered.resourceType === verified.resourceType && registered.deliveryType === verified.deliveryType) asset = verified.asset;
            }
            counts[asset ? "active" : "unresolved"]++;
            if (!session) continue;
            if (asset) await registerAssetReference({ assetId: asset, sourceType: `moderation_${caseType}_${slot}`,
                sourceId: record._id, userId: actor, session });
            await AssetModerationHold.create([{ _id: id, caseType, caseId: record._id, video: record.video,
                actor, slot, asset, status: asset ? "active" : "unresolved" }], { session });
        }
        return counts;
    };

    for (const record of page) {
        try {
            let counts;
            if (dryRun) counts = await processCase(record, null);
            else {
                const session = await mongoose.startSession();
                try { await session.withTransaction(async () => { counts = await processCase(record, session); }); }
                finally { await session.endSession(); }
            }
            result.scanned++;
            for (const key of ["active", "unresolved", "existing"]) result[key] += counts[key];
            lastCursor = String(record._id);
        } catch (error) {
            result.failed++;
            result.failures.push({ caseId: String(record._id), message: error.message });
            result.nextCursor = lastCursor;
            return result;
        }
    }
    result.complete = cases.length <= limit;
    result.nextCursor = result.complete ? null : lastCursor;
    return result;
};

export { backfillModerationHolds };
