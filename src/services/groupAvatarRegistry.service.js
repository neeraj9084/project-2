import { User } from "../models/user.model.js";
import { CloudinaryAssetReference } from "../models/cloudinaryAssetReference.model.js";
import { registerAssetReference, removeAssetReference } from "./cloudinaryAssetReference.service.js";
import { verifiedAttachment } from "./messageAttachmentRegistry.service.js";
import { queueVideoMedia } from "./videoAssetRegistry.service.js";
import { ApiError } from "../utils/ApiError.js";

// A submitted URL is not proof of Cloudinary identity. Only copy metadata
// from the creator's own verified profile media, or leave the URL unresolved.
const registerGroupAvatar = async ({ url, conversationId, userId, session }) => {
    if (!session?.inTransaction()) throw new Error("An active transaction is required");
    if (!url) return undefined;
    const user = await User.findById(userId).select("avatar coverImage +avatarPublicId +coverImagePublicId +avatarDeliveryType +coverImageDeliveryType +mediaRegistry").session(session).lean();
    for (const field of ["avatar", "coverImage"]) {
        if (user?.[field] !== url) continue;
        const metadata = verifiedAttachment({ url, publicId: user[`${field}PublicId`], resourceType: "image",
            deliveryType: user[`${field}DeliveryType`], mediaRegistry: user.mediaRegistry?.[field] });
        if (!metadata) continue;
        await registerAssetReference({ assetId: metadata.asset, sourceType: "avatar", sourceId: conversationId, userId, session });
        return { ...metadata, referenceUser: userId, status: "linked" };
    }
    throw new ApiError(400, "Group avatar must be a verified image from your profile");
};

const retireGroupAvatar = async (conversation, { session } = {}) => {
    if (!session?.inTransaction()) throw new Error("An active transaction is required");
    if (!conversation.avatar) return;
    const metadata = conversation.mediaRegistry?.avatar;
    const verified = verifiedAttachment({ url: conversation.avatar, publicId: metadata?.publicId,
        resourceType: metadata?.resourceType, deliveryType: metadata?.deliveryType, mediaRegistry: metadata });
    await queueVideoMedia({ metadata: verified || { url: conversation.avatar }, kind: "avatar",
        videoId: conversation._id, owner: conversation.createdBy, session });
    if (!verified) return;
    // The group owner may have changed since registration. Remove the actual
    // source references rather than assuming the current owner created them.
    const refs = await CloudinaryAssetReference.find({ asset: verified.asset, sourceType: "avatar",
        sourceId: conversation._id }).select("user").session(session).lean();
    for (const ref of refs) await removeAssetReference({ assetId: verified.asset, sourceType: "avatar",
        sourceId: conversation._id, userId: ref.user, session });
};

export { registerGroupAvatar, retireGroupAvatar };
