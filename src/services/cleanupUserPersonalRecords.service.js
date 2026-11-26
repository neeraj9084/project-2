import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js";
import { Playlist } from "../models/playList.model.js";
import { WatchHistory } from "../models/watchHistory.model.js";
import { Subscribe } from "../models/subscribe.model.js";
import { Moment } from "../models/moment.model.js";
import { MomentView } from "../models/momentView.model.js";
import { Notification } from "../models/notification.model.js";
import { BlockedUser } from "../models/blockedUser.model.js";
import { Conversation } from "../models/conversation.model.js";
import { ConversationMember } from "../models/conversationMember.model.js";
import { Message } from "../models/message.model.js";
import { MediaCleanupRecord } from "../models/mediaCleanupRecord.model.js";
import { recordMomentMedia } from "./expireMoment.service.js";
import { verifiedAttachment, messageAttachments } from "./messageAttachmentRegistry.service.js";
import { unregisterVideoMedia } from "./videoAssetRegistry.service.js";
import { removeNotificationThumbnails } from "./notificationThumbnailRegistry.service.js";
import { fenceMediaCoverage } from "./mediaCoverageBarrier.service.js";

// Run group ownership cleanup first; the caller owns the transaction and retries.
const cleanupUserPersonalRecords = async (userId, { session } = {}) => {
    if (!mongoose.isValidObjectId(userId)) throw new Error("Invalid user ID");
    if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required");
    await fenceMediaCoverage({ session });

    const user = await User.findOne({
        _id: userId, isActive: false,
        deletionRequestedAt: { $ne: null }, anonymizedAt: { $ne: null }
    }).select("_id +deletionMedia +mediaRegistry").session(session).lean();
    if (!user) throw new Error("User must be deletion-pending and anonymized");

    const unfinishedGroup = await Conversation.exists({
        type: "group", isActive: true,
        $or: [{ createdBy: user._id }, { participants: user._id }]
    }).session(session);
    const activeMemberships = await ConversationMember.exists({
        user: user._id, isActive: true
    }).session(session);
    if (unfinishedGroup || activeMemberships) {
        throw new Error("Group membership cleanup must run first");
    }

    const moments = await Moment.find({ owner: user._id })
        .select("_id owner mediaUrl mediaPublicId mediaType +mediaDeliveryType +mediaResourceType +mediaRegistry").session(session).lean();
    for (const moment of moments) {
        await recordMomentMedia(moment, { session });
    }
    const media = [];
    for (const field of ["avatar", "coverImage"]) {
        if (user.deletionMedia?.[field]) {
            const metadata = verifiedAttachment({ url: user.deletionMedia[field],
                publicId: user.deletionMedia[`${field}PublicId`], resourceType: "image",
                deliveryType: user.deletionMedia[`${field}DeliveryType`], mediaRegistry: user.mediaRegistry?.[field] });
            media.push({
                _id: `user:${user._id}:${field}`,
                user: user._id, sourceType: field, sourceId: user._id,
                url: user.deletionMedia[field],
                publicId: user.deletionMedia[`${field}PublicId`] || null,
                resourceType: "image",
                deliveryType: user.deletionMedia[`${field}DeliveryType`] || null,
                cloudName: metadata?.cloudName || null, asset: metadata?.asset || null,
                status: metadata ? "review_required" : "unresolved"
            });
            if (metadata) await unregisterVideoMedia({ metadata, kind: field, videoId: user._id, owner: user._id, session });
        }
    }
    for (const item of media) {
        await MediaCleanupRecord.updateOne(
            { _id: item._id }, { $setOnInsert: item }, { upsert: true, session }
        );
        if (item.status === "unresolved") await MediaCleanupRecord.updateOne(
            { _id: item._id, status: { $ne: "completed" } }, { $set: { status: "unresolved" } }, { session });
    }

    const attachments = await Message.find({
        sender: user._id, $or: [{ attachment: { $ne: null } }, { "attachments.0": { $exists: true } }]
    }).select("_id attachment.url attachment.publicId attachment.resourceType attachment.deliveryType attachments.url attachments.publicId attachments.resourceType attachments.deliveryType +attachment.mediaRegistry +attachments.mediaRegistry").session(session).lean();
    for (const message of attachments) {
      for (const [index, attachment] of messageAttachments(message).entries()) {
        const recordId = index === 0 ? `attachment:${message._id}` : `attachment:${message._id}:${index}`;
        const resourceType = ["image", "video", "raw"].includes(attachment.resourceType)
            ? attachment.resourceType : null;
        const metadata = verifiedAttachment(attachment);
        await MediaCleanupRecord.updateOne(
            { _id: recordId },
            { $setOnInsert: {
                user: user._id,
                sourceType: "attachment",
                sourceId: message._id,
                url: attachment.url || null,
                publicId: attachment.publicId || null,
                resourceType,
                deliveryType: attachment.deliveryType || null,
                cloudName: metadata?.cloudName || null,
                asset: metadata?.asset || null,
                status: metadata ? "review_required" : "unresolved"
            } },
            { upsert: true, session }
        );
        if (!metadata) await MediaCleanupRecord.updateOne(
            { _id: recordId, status: { $ne: "completed" } },
            { $set: { status: "unresolved" } }, { session });
      }
    }

    const momentIds = moments.map((moment) => moment._id);
    const otherViews = await MomentView.find({
        viewer: user._id, moment: { $nin: momentIds }
    }).select("moment").session(session).lean();
    for (const view of otherViews) {
        await Moment.updateOne(
            { _id: view.moment, views: { $gt: 0 } },
            { $inc: { views: -1 } }, { session }
        );
    }
    await MomentView.deleteMany({
        $or: [{ viewer: user._id }, { moment: { $in: momentIds } }]
    }, { session });
    await Moment.deleteMany({ owner: user._id }, { session });

    const tombstones = await Video.find({ owner: user._id, isDeleted: true })
        .select("_id").session(session).lean();
    const videoIds = tombstones.map((video) => video._id);
    await Playlist.deleteMany({ owner: user._id }, { session });
    await Playlist.updateMany({ videos: { $in: videoIds } },
        { $pull: { videos: { $in: videoIds } } }, { session });
    await WatchHistory.deleteMany({
        $or: [{ user: user._id }, { video: { $in: videoIds } }]
    }, { session });
    await User.updateMany({ watchHistory: { $in: videoIds } },
        { $pull: { watchHistory: { $in: videoIds } } }, { session });
    await User.updateOne({ _id: user._id }, { $set: { watchHistory: [] } }, { session });
    await Subscribe.deleteMany({
        $or: [{ subscriber: user._id }, { channel: user._id }]
    }, { session });
    const personalNotifications = await Notification.find({ recipient: user._id }).select("+mediaRegistry").session(session).lean();
    await removeNotificationThumbnails(personalNotifications, { session });
    await Notification.deleteMany({ _id: { $in: personalNotifications.map((item) => item._id) }, recipient: user._id }, { session });
    await BlockedUser.deleteMany({
        $or: [{ blocker: user._id }, { blockedUser: user._id }]
    }, { session });
    await Conversation.updateMany({ "directReadStatus.user": user._id },
        { $pull: { directReadStatus: { user: user._id } } }, { session });
    await ConversationMember.updateMany({ user: user._id, isActive: false },
        { $set: { lastReadAt: null, clearedAt: null, mutedUntil: null, isHidden: false } },
        { session });
};

export { cleanupUserPersonalRecords };
