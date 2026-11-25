import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifiedAttachment } from "../src/services/messageAttachmentRegistry.service.js";
import { registerAssetReference, reserveAssetDeletion } from "../src/services/cloudinaryAssetReference.service.js";
import { deleteFromCloudinary } from "../src/utils/cloudinary.js";
import { registerGroupAvatar } from "../src/services/groupAvatarRegistry.service.js";
import { removeNotificationThumbnails } from "../src/services/notificationThumbnailRegistry.service.js";
import { createVideoModerationHolds, releaseModerationHolds } from "../src/services/assetModerationHold.service.js";

test("attachment verification binds the complete Cloudinary identity and URL", () => {
    const identity = { cloudName: "example", publicId: "folder/item", resourceType: "image", deliveryType: "upload" };
    const asset = crypto.createHash("sha256").update(JSON.stringify(Object.values(identity))).digest("hex");
    const attachment = { url: "https://example.invalid/item", publicId: identity.publicId,
        resourceType: identity.resourceType, deliveryType: identity.deliveryType,
        mediaRegistry: { ...identity, asset, url: "https://example.invalid/item", identityVerified: true } };
    assert.ok(verifiedAttachment(attachment));
    assert.equal(verifiedAttachment({ ...attachment, url: "https://example.invalid/other" }), null);
    assert.equal(verifiedAttachment({ ...attachment, mediaRegistry: { ...attachment.mediaRegistry, asset: "a".repeat(64) } }), null);
    assert.equal(verifiedAttachment({ ...attachment, mediaRegistry: undefined }), null);
});

test("registry mutations require a transaction and deletion is disabled", async () => {
    await assert.rejects(registerAssetReference({}), /active MongoDB transaction/);
    const session = { inTransaction: () => true };
    await assert.rejects(reserveAssetDeletion({ assetId: "a".repeat(64), session }), /disabled/);
    await assert.rejects(deleteFromCloudinary(), /disabled/);
    await assert.rejects(registerGroupAvatar({ url: "https://example.invalid/image" }), /active transaction/);
    await assert.rejects(removeNotificationThumbnails([]), /active transaction/);
    await assert.rejects(createVideoModerationHolds({}), /active transaction/);
    await assert.rejects(releaseModerationHolds({}), /active transaction/);
});
