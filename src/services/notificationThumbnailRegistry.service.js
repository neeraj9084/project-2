import mongoose from "mongoose";
import { Notification } from "../models/notification.model.js";
import { Video } from "../models/video.model.js";
import { verifiedAttachment } from "./messageAttachmentRegistry.service.js";
import { registerAssetReference, removeAssetReference } from "./cloudinaryAssetReference.service.js";
import { queueVideoMedia } from "./videoAssetRegistry.service.js";

// Only copy a thumbnail if its current source supplies a complete verified identity.
const createThumbnailNotifications = async (items) => {
    const batch = Array.isArray(items) ? items : [items];
    const session = await mongoose.startSession();
    try {
        let created;
        await session.withTransaction(async () => {
            const prepared = [];
            for (const item of batch) {
                const notification = { ...item, _id: new mongoose.Types.ObjectId(), data: { ...item.data } };
                const fields = ["videoThumbnail", "thumbnail"].filter((field) => notification.data[field]);
                if (fields.length) {
                    const videoId = notification.data.videoId;
                    const video = mongoose.isValidObjectId(videoId) ? await Video.findById(videoId)
                        .select("thumbnail thumbnailPublicId +thumbnailDeliveryType +mediaRegistry").session(session).lean() : null;
                    const metadata = video?.mediaRegistry?.thumbnail;
                    const verified = verifiedAttachment({ url: video?.thumbnail, publicId: video?.thumbnailPublicId,
                        resourceType: "image", deliveryType: video?.thumbnailDeliveryType, mediaRegistry: metadata });
                    // Missing provenance must not create an untracked reference.
                    for (const field of fields) if (!verified || notification.data[field] !== video.thumbnail) notification.data[field] = null;
                    if (verified && fields.some((field) => notification.data[field])) {
                        await registerAssetReference({ assetId: verified.asset, sourceType: "notificationThumbnail",
                            sourceId: notification._id, userId: notification.recipient, session });
                        notification.mediaRegistry = { thumbnail: { ...verified, referenceUser: notification.recipient } };
                    }
                }
                prepared.push(notification);
            }
            created = await Notification.insertMany(prepared, { session });
        });
        return Array.isArray(items) ? created : created[0];
    } finally { await session.endSession(); }
};

const removeNotificationThumbnails = async (notifications, { session } = {}) => {
    if (!session?.inTransaction()) throw new Error("An active transaction is required");
    for (const notification of notifications) {
        const metadata = notification.mediaRegistry?.thumbnail;
        const url = notification.data?.videoThumbnail || notification.data?.thumbnail;
        const verified = verifiedAttachment({ url, publicId: metadata?.publicId, resourceType: metadata?.resourceType,
            deliveryType: metadata?.deliveryType, mediaRegistry: metadata });
        if (url) await queueVideoMedia({ metadata: verified || { url }, kind: "notificationThumbnail",
            videoId: notification._id, owner: notification.recipient, session });
        if (verified) await removeAssetReference({ assetId: verified.asset, sourceType: "notificationThumbnail",
            sourceId: notification._id, userId: metadata.referenceUser || notification.recipient, session });
    }
};

export { createThumbnailNotifications, removeNotificationThumbnails };
