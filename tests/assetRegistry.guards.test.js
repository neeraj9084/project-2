import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifiedAttachment } from "../src/services/messageAttachmentRegistry.service.js";
import { registerAssetReference, reserveAssetDeletion } from "../src/services/cloudinaryAssetReference.service.js";
import { deleteFromCloudinary } from "../src/utils/cloudinary.js";
import { registerGroupAvatar } from "../src/services/groupAvatarRegistry.service.js";
import { removeNotificationThumbnails } from "../src/services/notificationThumbnailRegistry.service.js";
import { createVideoModerationHolds, releaseModerationHolds } from "../src/services/assetModerationHold.service.js";
import { fenceMediaCoverage, requireCompleteMediaCoverage, isCoverageSnapshotCurrent, approveMediaCoverage } from "../src/services/mediaCoverageBarrier.service.js";
import { evaluateMediaEligibility, getMediaDeletionEligibility, reserveSyntheticTestAsset, cancelSyntheticTestReservation, recoverSyntheticTestReservation } from "../src/services/mediaDeletionEligibility.service.js";
import { approveEmptyTestCoverage } from "../src/services/testMediaCoverageApproval.service.js";
import { inspectExpirationIndexEvidence } from "../src/services/verifyMediaCoverage.service.js";

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

test("deletion eligibility fails closed for unresolved and stale coverage", async () => {
    const result = evaluateMediaEligibility({ asset: { _id: "invalid", lifecycleStatus: "deletion_reserved" },
        barrier: { fenceVersion: 5 }, snapshot: { stable: true, fenceVersion: 4 }, unresolvedHolds: 1 });
    assert.equal(result.authorizedForDeletion, false);
    assert.equal(result.potentiallyEligible, false);
    for (const reason of ["unresolved_or_invalid_identity", "asset_not_active", "global_unresolved_identity", "coverage_snapshot_stale_or_unavailable", "deletion_disabled"]) {
        assert.ok(result.blockingReasons.includes(reason));
    }
    await assert.rejects(getMediaDeletionEligibility({ assetId: "bad" }), /Invalid asset ID/);
    const identity = { cloudName: "example", publicId: "asset", resourceType: "image", deliveryType: "upload" };
    const assetId = crypto.createHash("sha256").update(JSON.stringify(Object.values(identity))).digest("hex");
    const advisory = evaluateMediaEligibility({ asset: { _id: assetId, ...identity, lifecycleStatus: "active" },
        barrier: { fenceVersion: 1, verifiedVersion: 1, verifiedAt: new Date() },
        snapshot: { stable: true, fenceVersion: 1, coverageComplete: true }, jobs: [{ asset: assetId, ...identity, status: "pending" }] });
    assert.equal(advisory.potentiallyEligible, true);
    assert.equal(advisory.authorizedForDeletion, false);
    assert.ok(advisory.blockingReasons.includes("deletion_disabled"));
    const uploadBlocked = evaluateMediaEligibility({ asset: { _id: assetId, ...identity, lifecycleStatus: "active" },
        barrier: { fenceVersion: 1, verifiedVersion: 1, verifiedAt: new Date() },
        snapshot: { stable: true, fenceVersion: 1, coverageComplete: true },
        jobs: [{ asset: assetId, ...identity, status: "pending" }], unresolvedUploads: 1 });
    assert.equal(uploadBlocked.potentiallyEligible, false);
    assert.ok(uploadBlocked.blockingReasons.includes("global_unresolved_identity"));
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
    await assert.rejects(fenceMediaCoverage({}), /active MongoDB transaction/);
    await assert.rejects(requireCompleteMediaCoverage({}), /active MongoDB transaction/);
    await assert.rejects(approveMediaCoverage({}), /active MongoDB transaction/);
    await assert.rejects(approveEmptyTestCoverage({}), /active MongoDB transaction/);
    await assert.rejects(reserveSyntheticTestAsset({}), /active MongoDB transaction/);
    await assert.rejects(cancelSyntheticTestReservation({}), /active MongoDB transaction/);
    await assert.rejects(recoverSyntheticTestReservation({}), /active MongoDB transaction/);
});

test("coverage snapshot becomes stale after fence version changes", () => {
    assert.equal(isCoverageSnapshotCurrent({ stable: true, fenceVersion: 4 }, 4), true);
    assert.equal(isCoverageSnapshotCurrent({ stable: true, fenceVersion: 4 }, 5), false);
    assert.equal(isCoverageSnapshotCurrent({ stable: false, fenceVersion: 4 }, 4), false);
    assert.equal(isCoverageSnapshotCurrent({ stable: true, fenceVersion: 4 }, undefined), false);
});

test("index evidence requires all query indexes and rejects TTL metadata", () => {
    const index = (name) => ({ name, key: { expiresAt: 1, _id: 1 } });
    const indexes = { moments: [index("moment_expiration_scan")], notifications: [index("notification_expiration_scan")],
        pendingusers: [{ name: "pending_user_expiration_scan", key: { verificationOtpExpiry: 1, _id: 1 } }] };
    const good = inspectExpirationIndexEvidence(indexes);
    assert.equal(good.complete, true);
    assert.equal(inspectExpirationIndexEvidence({ ...indexes, moments: [] }).complete, false);
    const changed = inspectExpirationIndexEvidence({ ...indexes, moments: [...indexes.moments, { name: "old_ttl", key: { expiresAt: 1 }, expireAfterSeconds: 0 }] });
    assert.equal(changed.complete, false);
    assert.notEqual(good.fingerprint, changed.fingerprint);
    assert.equal(inspectExpirationIndexEvidence({ ...indexes, pendingusers: [...indexes.pendingusers, { name: "pending_ttl", key: { verificationOtpExpiry: 1 }, expireAfterSeconds: 0 }] }).complete, false);
    assert.throws(() => inspectExpirationIndexEvidence({ moments: [] }), /metadata unavailable/);
});
