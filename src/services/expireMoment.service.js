import mongoose from "mongoose";
import { Moment } from "../models/moment.model.js";
import { MomentView } from "../models/momentView.model.js";
import { MediaCleanupRecord } from "../models/mediaCleanupRecord.model.js";
import { removeAssetReference } from "./cloudinaryAssetReference.service.js";
import { verifiedAttachment } from "./messageAttachmentRegistry.service.js";
import { fenceMediaCoverage } from "./mediaCoverageBarrier.service.js";

const recordMomentMedia = async (moment, { session } = {}) => {
    if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required");
    await fenceMediaCoverage({ session });
    const publicId = typeof moment.mediaPublicId === "string" && moment.mediaPublicId.trim()
        ? moment.mediaPublicId : null;
    const deliveryType = typeof moment.mediaDeliveryType === "string" && moment.mediaDeliveryType.trim()
        ? moment.mediaDeliveryType : null;
    const resourceType = ["image", "video"].includes(moment.mediaResourceType)
        ? moment.mediaResourceType : null;
    const metadata = moment.mediaRegistry?.moment;
    const verified = verifiedAttachment({ url: moment.mediaUrl, publicId, resourceType,
        deliveryType, mediaRegistry: metadata });
    await MediaCleanupRecord.updateOne(
        { _id: `moment:${moment._id}` },
        { $setOnInsert: {
            user: moment.owner,
            sourceType: "moment",
            sourceId: moment._id,
            url: moment.mediaUrl || null,
            publicId,
            resourceType,
            deliveryType,
            cloudName: verified ? metadata.cloudName : null,
            asset: verified ? metadata.asset : null,
            status: verified ? "review_required" : "unresolved"
        } },
        { upsert: true, session }
    );
    if (!verified) {
        // A previously created legacy job is never made eligible by partial identifiers.
        await MediaCleanupRecord.updateOne({ _id: `moment:${moment._id}`, status: { $ne: "completed" } },
            { $set: { status: "unresolved" } }, { session });
    }
    // This runs in the same transaction as removal of the source Moment.
    if (verified) await removeAssetReference({ assetId: metadata.asset, sourceType: "moment",
        sourceId: moment._id, userId: moment.owner, session });
    await MediaCleanupRecord.updateOne(
        {
            _id: `moment:${moment._id}`,
            status: "review_required",
            $or: [
                { publicId: null }, { publicId: "" },
                { deliveryType: null }, { deliveryType: "" },
                { resourceType: null }
            ]
        },
        { $set: { status: "unresolved" } },
        { session }
    );
};

// The caller supplies an active transaction and schedules execution separately.
const expireMoment = async (momentId, { session } = {}) => {
    if (!mongoose.isValidObjectId(momentId)) throw new Error("Invalid moment ID");
    if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required");

    const moment = await Moment.findOne({ _id: momentId, expiresAt: { $lte: new Date() } })
        .select("owner mediaUrl mediaPublicId mediaType +mediaDeliveryType +mediaResourceType +mediaRegistry")
        .session(session).lean();
    if (!moment) return false;

    await recordMomentMedia(moment, { session });
    await MomentView.deleteMany({ moment: moment._id }, { session });
    await Moment.deleteOne({ _id: moment._id, expiresAt: { $lte: new Date() } }, { session });
    return true;
};

export { expireMoment, recordMomentMedia };
