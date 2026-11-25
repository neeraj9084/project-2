import mongoose from "mongoose";
import { Video } from "../models/video.model.js";
import { MediaCleanupRecord } from "../models/mediaCleanupRecord.model.js";
import { registerAssetReference } from "./cloudinaryAssetReference.service.js";
import { verifiedAttachment } from "./messageAttachmentRegistry.service.js";

// Media records and the tombstone must commit together.
const tombstoneVideo = async (videoId, { session } = {}) => {
    if (!mongoose.isValidObjectId(videoId)) {
        throw new Error("Invalid video ID");
    }
    if (!session?.inTransaction()) {
        throw new Error("An active MongoDB transaction is required");
    }

    const video = await Video.findOneAndUpdate(
        { _id: videoId, isDeleted: { $ne: true } },
        [{ $set: {
            deletionMedia: {
                videoFile: "$videoFile",
                videoPublicId: "$videoPublicId",
                videoDeliveryType: { $ifNull: ["$videoDeliveryType", null] },
                thumbnail: "$thumbnail",
                thumbnailPublicId: "$thumbnailPublicId",
                thumbnailDeliveryType: { $ifNull: ["$thumbnailDeliveryType", null] }
            },
            videoFile: "[deleted]",
            videoPublicId: "[deleted]",
            thumbnail: "[deleted]",
            thumbnailPublicId: "[deleted]",
            title: "[deleted]",
            description: "[deleted]",
            isPublished: false,
            isDeleted: true,
            deletedAt: new Date()
        } }],
        { new: true, session, updatePipeline: true }
    ).select("_id owner isDeleted deletedAt +deletionMedia +mediaRegistry");

    const tombstone = video || await Video.findById(videoId)
        .select("_id owner isDeleted deletedAt +deletionMedia +mediaRegistry").session(session);
    if (!tombstone?.isDeleted) throw new Error("Video not found");

    const assets = [
        { kind: "video", url: tombstone.deletionMedia?.videoFile,
            publicId: tombstone.deletionMedia?.videoPublicId,
            deliveryType: tombstone.deletionMedia?.videoDeliveryType, resourceType: "video" },
        { kind: "thumbnail", url: tombstone.deletionMedia?.thumbnail,
            publicId: tombstone.deletionMedia?.thumbnailPublicId,
            deliveryType: tombstone.deletionMedia?.thumbnailDeliveryType, resourceType: "image" }
    ];

    for (const asset of assets) {
        const metadata = tombstone.mediaRegistry?.[asset.kind];
        const verified = verifiedAttachment({ ...asset, mediaRegistry: metadata });
        // Tombstones retain media for moderation, so their registry references remain active.
        if (verified) await registerAssetReference({ assetId: metadata.asset, sourceType: asset.kind,
            sourceId: tombstone._id, userId: tombstone.owner, session });
        const id = `video:${tombstone._id}:${asset.kind}`;
        await MediaCleanupRecord.updateOne(
            { _id: id },
            { $setOnInsert: {
                user: tombstone.owner,
                sourceType: asset.kind,
                sourceId: tombstone._id,
                url: asset.url || null,
                publicId: asset.publicId || null,
                cloudName: verified ? metadata.cloudName : null,
                resourceType: asset.resourceType,
                deliveryType: asset.deliveryType || null,
                asset: verified ? metadata.asset : null,
                status: verified
                    ? "review_required" : "unresolved"
            } },
            { upsert: true, session }
        );
    }

    return { _id: tombstone._id, isDeleted: true, deletedAt: tombstone.deletedAt };
};

export { tombstoneVideo };
