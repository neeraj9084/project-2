import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { openTestDatabase, closeTestDatabase } from "./testDatabase.js";

const available = Boolean(process.env.TEST_MONGODB_URI);
let owned;
before(async () => { if (available) owned = await openTestDatabase(); });
after(async () => { if (owned) await closeTestDatabase(owned); });
const dbtest = (name, fn) => test(name, { skip: !available && "TEST_MONGODB_URI is not configured" }, fn);
const id = () => new mongoose.Types.ObjectId();
const tx = async (fn) => { const session = await mongoose.startSession(); try { return await session.withTransaction(() => fn(session)); } finally { await session.endSession(); } };
const seedUser = async (overrides = {}) => {
    const userId = id();
    await mongoose.connection.db.collection("users").insertOne({ _id: userId, username: `test_${userId}`, email: `${userId}@invalid.invalid`,
        fullName: "Test User", isActive: false, isVerified: true, role: "user", deletionRequestedAt: new Date(), ...overrides });
    return userId;
};

dbtest("pending expiration retains legacy media and leaves shared references untouched", async () => {
    const { expirePendingUser } = await import("../../src/services/expirePendingUser.service.js");
    const pendingId = id(); const owner = id(); const sourceId = id();
    const asset = "a".repeat(64);
    await mongoose.connection.db.collection("pendingusers").insertOne({ _id: pendingId, fullName: "Test User",
        username: `test_${pendingId}`, email: `${pendingId}@invalid.invalid`, avatar: "https://legacy.invalid/a", verificationOtpExpiry: new Date(Date.now() - 1000) });
    await mongoose.connection.db.collection("cloudinaryassetreferences").insertOne({ _id: `test-${pendingId}`, asset, user: owner, sourceId, sourceType: "attachment" });
    assert.equal(await tx((session) => expirePendingUser(pendingId, { session })), true);
    assert.equal(await tx((session) => expirePendingUser(pendingId, { session })), false);
    const retained = await mongoose.connection.db.collection("pendingmediaretentions").findOne({ _id: `${pendingId}:avatar` });
    assert.equal(retained.status, "unresolved");
    assert.equal(retained.url, "https://legacy.invalid/a");
    assert.equal(await mongoose.connection.db.collection("cloudinaryassetreferences").countDocuments({ _id: `test-${pendingId}` }), 1);
});

dbtest("upload intents survive uncertain responses, queue failures and retry without deleting shared media", async () => {
    const { performTrackedUpload, reconcileUploadIntent } = await import("../../src/services/mediaUploadIntent.service.js");
    const { MediaUploadIntent } = await import("../../src/models/mediaUploadIntent.model.js");
    const { MediaCleanupRecord } = await import("../../src/models/mediaCleanupRecord.model.js");
    const { CloudinaryAssetReference } = await import("../../src/models/cloudinaryAssetReference.model.js");
    const { registerAssetReference } = await import("../../src/services/cloudinaryAssetReference.service.js");
    const { registerVideoMedia } = await import("../../src/services/videoAssetRegistry.service.js");
    const user = id(); const sourceId = id(); const cloudName = "isolated-test.invalid";
    const options = { user, sourceId, sourceType: "avatar", cloudName };
    const barrierBefore = await mongoose.connection.db.collection("mediacoveragebarriers").findOne({ _id: "global" });
    await assert.rejects(performTrackedUpload({ ...options, upload: async () => { throw new Error("lost response"); } }), /lost response/);
    const uncertain = await MediaUploadIntent.findOne({ sourceId, status: "uncertain" }).lean();
    assert.ok(uncertain.plannedPublicId); assert.equal(uncertain.publicId, undefined);
    await assert.rejects(tx((session) => reconcileUploadIntent(uncertain._id, { session })), /uncertain/);
    const response = await performTrackedUpload({ ...options, upload: async (publicId) => ({ public_id: publicId,
        resource_type: "image", type: "upload", secure_url: "https://synthetic.invalid/upload" }) });
    const intent = await MediaUploadIntent.findOne({ sourceId, publicId: response.public_id }).lean();
    const original = MediaCleanupRecord.updateOne;
    try { MediaCleanupRecord.updateOne = () => { throw new Error("injected queue failure"); };
        await assert.rejects(tx((session) => reconcileUploadIntent(intent._id, { session })), /injected queue failure/);
    } finally { MediaCleanupRecord.updateOne = original; }
    assert.equal((await MediaUploadIntent.findById(intent._id).lean()).status, "uploaded");
    assert.equal(await tx((session) => reconcileUploadIntent(intent._id, { session })), "review_required");
    const job = await MediaCleanupRecord.findById(`upload-intent:${intent._id}`).lean();
    assert.equal(job.status, "review_required");
    await tx((session) => registerAssetReference({ assetId: job.asset, sourceType: "attachment", sourceId: id(), userId: user, session }));
    assert.equal(await tx((session) => reconcileUploadIntent(intent._id, { session })), "review_required");
    assert.equal(await CloudinaryAssetReference.countDocuments({ asset: job.asset }), 1);
    const barrierAfter = await mongoose.connection.db.collection("mediacoveragebarriers").findOne({ _id: "global" });
    assert.ok(barrierAfter.fenceVersion > (barrierBefore?.fenceVersion || 0));
    assert.equal(barrierAfter.testRelease, false);
    const nextSource = id();
    const next = await performTrackedUpload({ ...options, sourceId: nextSource, upload: async (publicId) => ({ public_id: publicId,
        resource_type: "image", type: "upload", secure_url: "https://synthetic.invalid/registered" }) });
    const nextIntent = await MediaUploadIntent.findOne({ sourceId: nextSource }).lean();
    const metadata = { cloudName, publicId: next.public_id, resourceType: "image", deliveryType: "upload", url: next.secure_url };
    metadata.asset = crypto.createHash("sha256").update(JSON.stringify([cloudName, metadata.publicId, metadata.resourceType, metadata.deliveryType])).digest("hex");
    const register = (session) => registerVideoMedia({ metadata, kind: "avatar", videoId: nextSource, owner: user, session });
    await assert.rejects(tx(async (session) => { await register(session); throw new Error("rollback registration"); }), /rollback registration/);
    assert.equal((await MediaUploadIntent.findById(nextIntent._id).lean()).status, "uploaded");
    await tx(register);
    assert.equal((await MediaUploadIntent.findById(nextIntent._id).lean()).status, "referenced");
});

dbtest("concurrent upload intents, reconciliation and shared references remain fenced", async () => {
    const { performTrackedUpload, reconcileUploadIntent } = await import("../../src/services/mediaUploadIntent.service.js");
    const { registerVideoMedia } = await import("../../src/services/videoAssetRegistry.service.js");
    const { MediaUploadIntent } = await import("../../src/models/mediaUploadIntent.model.js");
    const { CloudinaryAssetReference } = await import("../../src/models/cloudinaryAssetReference.model.js");
    const { MediaCleanupRecord } = await import("../../src/models/mediaCleanupRecord.model.js");
    const user = id(); const sourceId = id(); const cloudName = "isolated-test.invalid";
    const upload = async (publicId) => ({ public_id: publicId, resource_type: "image", type: "upload", secure_url: `https://synthetic.invalid/${publicId}` });
    const options = { user, sourceId, sourceType: "avatar", cloudName, upload };
    const responses = await Promise.all([performTrackedUpload(options), performTrackedUpload(options)]);
    assert.notEqual(responses[0].public_id, responses[1].public_id);
    const intents = await MediaUploadIntent.find({ user, sourceId }).lean();
    assert.equal(intents.length, 2); assert.ok(intents.every((intent) => intent.status === "uploaded"));
    const intent = intents[0]; const metadata = { cloudName, publicId: intent.publicId, resourceType: intent.resourceType, deliveryType: intent.deliveryType, url: intent.url };
    metadata.asset = crypto.createHash("sha256").update(JSON.stringify([cloudName, metadata.publicId, metadata.resourceType, metadata.deliveryType])).digest("hex");
    const actions = await Promise.allSettled([
        tx((session) => reconcileUploadIntent(intent._id, { session })),
        tx((session) => registerVideoMedia({ metadata, kind: "avatar", videoId: sourceId, owner: user, session }))
    ]);
    assert.equal(actions[1].status, "fulfilled");
    assert.equal(await CloudinaryAssetReference.countDocuments({ asset: metadata.asset, sourceId }), 1);
    const current = await MediaUploadIntent.findById(intent._id).lean();
    assert.ok(["referenced", "review_required"].includes(current.status));
    const repeat = await Promise.all([tx((session) => reconcileUploadIntent(intents[1]._id, { session })), tx((session) => reconcileUploadIntent(intents[1]._id, { session }))]);
    assert.deepEqual(repeat, ["review_required", "review_required"]);
    assert.equal(await MediaCleanupRecord.countDocuments({ _id: `upload-intent:${intents[1]._id}` }), 1);
    assert.equal((await mongoose.connection.db.collection("mediacoveragebarriers").findOne({ _id: "global" })).testRelease, false);
});

dbtest("profile avatar and cover endpoints register mocked uploads and reject anonymous access", async () => {
    process.env.ACCESS_TOKEN_SECRET = "isolated-integration-only-secret";
    const { default: jwt } = await import("jsonwebtoken");
    const { default: app } = await import("../../src/app.js");
    const { v2: cloudinary } = await import("cloudinary");
    const oldUpload = cloudinary.uploader.upload; const oldName = cloudinary.config().cloud_name;
    cloudinary.config({ cloud_name: "isolated-test.invalid" });
    cloudinary.uploader.upload = async (_path, options) => ({ public_id: options.public_id, resource_type: "image", type: "upload", secure_url: `https://synthetic.invalid/${options.public_id}` });
    const userId = await seedUser({ isActive: true, deletionRequestedAt: null, anonymizedAt: null });
    const token = jwt.sign({ _id: String(userId) }, process.env.ACCESS_TOKEN_SECRET);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    try {
        const base = `http://127.0.0.1:${server.address().port}/api/v1/users`;
        const makeForm = (field) => { const form = new FormData(); form.set(field, new Blob(["test image"], { type: "image/png" }), "test.png"); return form; };
        assert.equal((await fetch(`${base}/update-avatar`, { method: "PATCH", body: makeForm("avatar") })).status, 401);
        for (const [path, field] of [["update-avatar", "avatar"], ["update-cover-image", "coverImage"], ["update-avatar", "avatar"]]) {
            const result = await fetch(`${base}/${path}`, { method: "PATCH", headers: { authorization: `Bearer ${token}` }, body: makeForm(field) });
            assert.equal(result.status, 200);
        }
        const db = mongoose.connection.db; const user = await db.collection("users").findOne({ _id: userId });
        assert.equal(user.mediaRegistry.avatar.identityVerified, true); assert.equal(user.mediaRegistry.coverImage.identityVerified, true);
        assert.equal(await db.collection("mediauploadintents").countDocuments({ user: userId, status: "referenced" }), 3);
        assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ sourceId: userId }), 2);
        assert.ok(await db.collection("mediacleanuprecords").findOne({ sourceId: userId, sourceType: "avatar", status: "review_required" }));
        assert.equal((await db.collection("mediacoveragebarriers").findOne({ _id: "global" })).testRelease, false);
        const headers = { authorization: `Bearer ${token}` }; const peer = await seedUser({ isActive: true, deletionRequestedAt: null, anonymizedAt: null });
        const groupResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/conversation-members/group`, { method: "POST", headers: { ...headers, "content-type": "application/json" },
            body: JSON.stringify({ participantIds: [String(peer)], name: "Test group", avatar: user.avatar }) });
        assert.equal(groupResponse.status, 201);
        const groupId = (await groupResponse.json()).data._id;
        assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ sourceId: new mongoose.Types.ObjectId(groupId), asset: user.mediaRegistry.avatar.asset }), 1);
        const messageForm = makeForm("media"); messageForm.set("type", "image");
        const sentResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/messages/${groupId}`, { method: "POST", headers, body: messageForm });
        assert.equal(sentResponse.status, 201);
        const messageId = (await sentResponse.json()).data._id;
        const forwarded = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/messages/${messageId}/forward`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ conversationId: groupId }) });
        assert.equal(forwarded.status, 201);
        const message = await db.collection("messages").findOne({ _id: new mongoose.Types.ObjectId(messageId) });
        assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ asset: message.attachment.mediaRegistry.asset, sourceType: "attachment" }), 2);
        const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO7sAAAAASUVORK5CYII=", "base64");
        const momentForm = new FormData(); momentForm.set("media", new Blob([png], { type: "image/png" }), "moment.png");
        const moment = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/moments`, { method: "POST", headers, body: momentForm });
        assert.equal(moment.status, 201);
        const momentId = new mongoose.Types.ObjectId((await moment.json()).data._id);
        assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ sourceId: momentId, sourceType: "moment" }), 1);
        const videoId = id();
        await db.collection("videos").insertOne({ _id: videoId, owner: userId, title: "Test video", description: "Test", duration: 1,
            videoFile: "https://legacy.invalid/video", videoPublicId: "legacy-video", thumbnail: "https://legacy.invalid/thumb", thumbnailPublicId: "legacy-thumb", isPublished: true, isDeleted: false });
        const updated = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/videos/${videoId}`, { method: "PATCH", headers, body: makeForm("thumbnail") });
        assert.equal(updated.status, 200);
        assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ sourceId: videoId, sourceType: "thumbnail" }), 1);
        const deniedAdmin = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/videos/${videoId}`, { method: "DELETE", headers });
        assert.equal(deniedAdmin.status, 403);
        const adminId = await seedUser({ role: "admin", isActive: true, deletionRequestedAt: null, anonymizedAt: null });
        const adminToken = jwt.sign({ _id: String(adminId) }, process.env.ACCESS_TOKEN_SECRET);
        const adminDelete = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/videos/${videoId}`, { method: "DELETE", headers: { authorization: `Bearer ${adminToken}` } });
        assert.equal(adminDelete.status, 200);
        assert.equal((await db.collection("videos").findOne({ _id: videoId })).isDeleted, true);
    } finally {
        cloudinary.uploader.upload = oldUpload; cloudinary.config({ cloud_name: oldName });
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
});

dbtest("pending verification update and expiration cannot lose retained media", async () => {
    const { expirePendingUser } = await import("../../src/services/expirePendingUser.service.js");
    const pendingId = id(); const db = mongoose.connection.db;
    await db.collection("pendingusers").insertOne({ _id: pendingId, fullName: "Test User", username: `race_${pendingId}`,
        email: `${pendingId}@invalid.invalid`, avatar: "https://legacy.invalid/race", isEmailVerified: false,
        verificationOtpExpiry: new Date(Date.now() + 30000) });
    const outcomes = await Promise.allSettled([
        tx((session) => expirePendingUser(pendingId, { session, now: new Date(Date.now() + 60000) })),
        tx((session) => db.collection("pendingusers").updateOne({ _id: pendingId, isEmailVerified: false },
            { $set: { isEmailVerified: true, verificationOtpExpiry: new Date(Date.now() + 600000) } }, { session }))
    ]);
    assert.ok(outcomes.every((outcome) => outcome.status === "fulfilled"));
    const pending = await db.collection("pendingusers").findOne({ _id: pendingId });
    const retained = await db.collection("pendingmediaretentions").findOne({ _id: `${pendingId}:avatar` });
    assert.ok((pending && pending.isEmailVerified && !retained) || (!pending && retained?.url === "https://legacy.invalid/race"));
});

dbtest("registration verification endpoint races controlled pending expiration safely", async () => {
    process.env.ACCESS_TOKEN_SECRET = "isolated-integration-only-secret";
    const { default: app } = await import("../../src/app.js");
    const { expirePendingUser } = await import("../../src/services/expirePendingUser.service.js");
    const pendingId = id(); const email = `${pendingId}@invalid.invalid`; const db = mongoose.connection.db;
    await db.collection("pendingusers").insertOne({ _id: pendingId, fullName: "Test User", username: `otp_${pendingId}`, email,
        avatar: "https://legacy.invalid/verification", verificationOtp: "123456", verificationOtpAttempts: 0, isEmailVerified: false,
        verificationOtpExpiry: new Date(Date.now() + 30000) });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    try {
        const endpoint = `http://127.0.0.1:${server.address().port}/api/v1/users/register/verify-otp`;
        const [request, expiry] = await Promise.allSettled([
            fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, otp: "123456" }) }),
            tx((session) => expirePendingUser(pendingId, { session, now: new Date(Date.now() + 60000) }))
        ]);
        assert.equal(expiry.status, "fulfilled");
        assert.equal(request.status, "fulfilled");
        const pending = await db.collection("pendingusers").findOne({ _id: pendingId });
        const retained = await db.collection("pendingmediaretentions").findOne({ _id: `${pendingId}:avatar` });
        if (request.value.status === 200) { assert.ok(pending?.isEmailVerified); assert.equal(retained, null); }
        else { assert.ok([400, 404, 500].includes(request.value.status)); assert.equal(retained?.url, "https://legacy.invalid/verification"); }
    } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

dbtest("registration transfers legacy media as unresolved and consumes pending record once", async () => {
    process.env.ACCESS_TOKEN_SECRET = "isolated-integration-only-secret";
    const { default: jwt } = await import("jsonwebtoken");
    const { default: app } = await import("../../src/app.js");
    const pendingId = id();
    const email = `${pendingId}@invalid.invalid`;
    await mongoose.connection.db.collection("pendingusers").insertOne({ _id: pendingId, fullName: "Test User", email,
        username: `test_${pendingId}`, avatar: "https://legacy.invalid/a", coverImage: "", isEmailVerified: true,
        mediaRegistry: { avatar: { publicId: "unverified-legacy-id", identityVerified: false } },
        verificationOtpExpiry: new Date(Date.now() + 600000) });
    const token = jwt.sign({ _id: String(pendingId), purpose: "registration-completion" }, process.env.ACCESS_TOKEN_SECRET);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    try {
        const url = `http://127.0.0.1:${server.address().port}/api/v1/users/register/complete`;
        const request = () => fetch(url, { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ registrationToken: token, password: "test-password", confirmPassword: "test-password" }) });
        assert.equal((await request()).status, 201);
        const user = await mongoose.connection.db.collection("users").findOne({ email });
        assert.equal(user.avatar, "https://legacy.invalid/a");
        assert.equal(user.mediaRegistry.avatar.status, "unresolved");
        assert.equal(user.mediaRegistry.avatar.publicId, "unverified-legacy-id");
        assert.equal(user.mediaRegistry.avatar.identityVerified, false);
        assert.equal(await mongoose.connection.db.collection("pendingusers").countDocuments({ _id: pendingId }), 0);
        assert.equal((await request()).status, 404);
        assert.equal(await mongoose.connection.db.collection("users").countDocuments({ email }), 1);
    } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

dbtest("verified registration rolls back for reserved media and retries after release", async () => {
    process.env.ACCESS_TOKEN_SECRET = "isolated-integration-only-secret";
    const { default: jwt } = await import("jsonwebtoken");
    const { default: app } = await import("../../src/app.js");
    const pendingId = id(); const email = `${pendingId}@invalid.invalid`;
    const identity = { cloudName: "isolated-test.invalid", publicId: `synthetic/${pendingId}`, resourceType: "image", deliveryType: "upload" };
    const asset = crypto.createHash("sha256").update(JSON.stringify(Object.values(identity))).digest("hex");
    const url = "https://synthetic.invalid/avatar";
    await mongoose.connection.db.collection("cloudinaryassets").insertOne({ _id: asset, ...identity, deletionStatus: "blocked", lifecycleStatus: "deletion_reserved", fenceVersion: 1 });
    await mongoose.connection.db.collection("pendingusers").insertOne({ _id: pendingId, fullName: "Test User", email,
        username: `test_${pendingId}`, avatar: url, isEmailVerified: true, verificationOtpExpiry: new Date(Date.now() + 600000),
        mediaRegistry: { avatar: { ...identity, asset, url, identityVerified: true, status: "linked" } } });
    const token = jwt.sign({ _id: String(pendingId), purpose: "registration-completion" }, process.env.ACCESS_TOKEN_SECRET);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    try {
        const endpoint = `http://127.0.0.1:${server.address().port}/api/v1/users/register/complete`;
        const request = () => fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ registrationToken: token, password: "test-password", confirmPassword: "test-password" }) });
        assert.equal((await request()).status, 500);
        assert.equal(await mongoose.connection.db.collection("users").countDocuments({ email }), 0);
        assert.equal(await mongoose.connection.db.collection("pendingusers").countDocuments({ _id: pendingId }), 1);
        await mongoose.connection.db.collection("cloudinaryassets").updateOne({ _id: asset }, { $set: { lifecycleStatus: "active" } });
        assert.equal((await request()).status, 201);
        const user = await mongoose.connection.db.collection("users").findOne({ email });
        assert.equal(user.mediaRegistry.avatar.asset, asset);
        assert.equal(await mongoose.connection.db.collection("cloudinaryassetreferences").countDocuments({ asset, sourceId: user._id, sourceType: "avatar" }), 1);
    } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

dbtest("deletion request revokes API access and status requires its scoped cookie", async () => {
    process.env.ACCESS_TOKEN_SECRET = "isolated-integration-only-secret";
    const { default: jwt } = await import("jsonwebtoken");
    const { default: app } = await import("../../src/app.js");
    const userId = await seedUser({ isActive: true, deletionRequestedAt: null, anonymizedAt: null });
    const token = jwt.sign({ _id: String(userId) }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "5m" });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    try {
        const base = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
        const deleted = await fetch(`${base}/delete-account`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
        assert.equal(deleted.status, 200);
        const cookieHeader = deleted.headers.get("set-cookie") || "";
        const cookie = cookieHeader.match(/deletionStatus=([a-f0-9]{64})/);
        assert.ok(cookie);
        const denied = await fetch(`${base}/deletion-status`);
        assert.equal(denied.status, 401);
        const status = await fetch(`${base}/deletion-status`, { headers: { cookie: `deletionStatus=${cookie[1]}` } });
        assert.equal(status.status, 200);
        const payload = await status.json(); assert.equal(payload.data.permanentDeletionComplete, false);
        const protectedResponse = await fetch(`${base}/change-password`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
        assert.equal(protectedResponse.status, 403);
    } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

dbtest("anonymization retains user ObjectId and is idempotent", async () => {
    const { anonymizeUser } = await import("../../src/services/anonymizeUser.service.js");
    const userId = await seedUser();
    await tx((session) => anonymizeUser(userId, { session }));
    await tx((session) => anonymizeUser(userId, { session }));
    const user = await mongoose.connection.db.collection("users").findOne({ _id: userId });
    assert.equal(String(user._id), String(userId)); assert.equal(user.isActive, false); assert.ok(user.anonymizedAt);
});

dbtest("database transaction abort rolls back anonymization", async () => {
    const { anonymizeUser } = await import("../../src/services/anonymizeUser.service.js");
    const userId = await seedUser();
    await assert.rejects(tx(async (session) => { await anonymizeUser(userId, { session }); throw new Error("forced rollback"); }), /forced rollback/);
    const user = await mongoose.connection.db.collection("users").findOne({ _id: userId });
    assert.equal(user.anonymizedAt, undefined);
});

dbtest("group ownership transfers to an active admin", async () => {
    const { cleanupUserGroupMemberships } = await import("../../src/services/cleanupUserGroupMemberships.service.js");
    const former = await seedUser({ anonymizedAt: new Date() });
    const successor = await seedUser({ isActive: true, deletionRequestedAt: null, anonymizedAt: null });
    const group = id();
    await mongoose.connection.db.collection("conversations").insertOne({ _id: group, type: "group", isActive: true, createdBy: former, participants: [former, successor] });
    await mongoose.connection.db.collection("conversationmembers").insertMany([{ _id: id(), conversation: group, user: former, isActive: true, role: "admin" }, { _id: id(), conversation: group, user: successor, isActive: true, role: "admin", joinedAt: new Date() }]);
    await tx((session) => cleanupUserGroupMemberships(former, { session }));
    const updated = await mongoose.connection.db.collection("conversations").findOne({ _id: group });
    assert.equal(String(updated.createdBy), String(successor)); assert.equal(updated.participants.some((x) => String(x) === String(former)), false);
});

dbtest("video tombstone preserves ObjectId and creates review records", async () => {
    const { tombstoneVideo } = await import("../../src/services/tombstoneVideo.service.js");
    const owner = await seedUser(); const videoId = id();
    await mongoose.connection.db.collection("videos").insertOne({ _id: videoId, owner, videoFile: "legacy-video", videoPublicId: "legacy", thumbnail: "legacy-thumb", thumbnailPublicId: "legacy-thumb", title: "title", description: "description", duration: 1 });
    await tx((session) => tombstoneVideo(videoId, { session }));
    const video = await mongoose.connection.db.collection("videos").findOne({ _id: videoId });
    assert.equal(video.isDeleted, true); assert.equal(String(video._id), String(videoId));
    assert.equal(await mongoose.connection.db.collection("mediacleanuprecords").countDocuments({ sourceId: videoId }), 2);
});

dbtest("shared asset references are separate and deletion reservation remains disabled", async () => {
    const { CloudinaryAsset } = await import("../../src/models/cloudinaryAsset.model.js");
    const { CloudinaryAssetReference } = await import("../../src/models/cloudinaryAssetReference.model.js");
    const { registerAssetReference, removeAssetReference, reserveAssetDeletion } = await import("../../src/services/cloudinaryAssetReference.service.js");
    const asset = crypto.randomBytes(32).toString("hex"); const actor = await seedUser(); const one = id(); const two = id();
    await CloudinaryAsset.create({ _id: asset, cloudName: "test", publicId: asset, resourceType: "image", deliveryType: "upload" });
    await tx((session) => registerAssetReference({ assetId: asset, sourceType: "attachment", sourceId: one, userId: actor, session }));
    await tx((session) => registerAssetReference({ assetId: asset, sourceType: "attachment", sourceId: two, userId: actor, session }));
    await tx((session) => removeAssetReference({ assetId: asset, sourceType: "attachment", sourceId: one, userId: actor, session }));
    assert.equal(await CloudinaryAssetReference.countDocuments({ asset }), 1);
    await assert.rejects(tx((session) => reserveAssetDeletion({ assetId: asset, session })), /disabled/);
});

dbtest("expired notifications are removed transactionally", async () => {
    const { expireNotification } = await import("../../src/services/expireNotification.service.js");
    const user = await seedUser(); const notificationId = id();
    await mongoose.connection.db.collection("notifications").insertOne({ _id: notificationId, recipient: user, type: "system", title: "test", message: "test", expiresAt: new Date(Date.now() - 1000) });
    assert.equal(await tx((session) => expireNotification(notificationId, { session })), true);
    assert.equal(await tx((session) => expireNotification(notificationId, { session })), false);
});

dbtest("lifecycle coordinator never executes permanent cleanup", async () => {
    const { runAccountDeletionLifecycle } = await import("../../src/services/accountDeletionLifecycle.service.js");
    let called = false; const userId = await seedUser();
    const result = await runAccountDeletionLifecycle({ userId, databaseCleanup: async () => { called = true; } });
    assert.equal(result.executionEnabled, false); assert.equal(called, false);
});

dbtest("unresolved moderation identities create fenced holds", async () => {
    const { createVideoModerationHolds } = await import("../../src/services/assetModerationHold.service.js");
    const owner = await seedUser(); const actor = await seedUser(); const videoId = id(); const caseId = id();
    await mongoose.connection.db.collection("videos").insertOne({ _id: videoId, owner, videoFile: "legacy", videoPublicId: "legacy", thumbnail: "legacy", thumbnailPublicId: "legacy" });
    await tx((session) => createVideoModerationHolds({ caseType: "report", caseId, videoId, actor, session }));
    const holds = await mongoose.connection.db.collection("assetmoderationholds").find({ caseId }).toArray();
    assert.equal(holds.length, 2); assert.ok(holds.every((hold) => hold.status === "unresolved"));
    const barrier = await mongoose.connection.db.collection("mediacoveragebarriers").findOne({ _id: "global" });
    assert.equal(barrier.coverageStatus, "blocked");
});

dbtest("legacy moderation backfill is idempotent", async () => {
    const { backfillModerationHolds } = await import("../../src/services/backfillModerationHolds.service.js");
    const actor = await seedUser(); const videoId = id(); const caseId = id();
    await mongoose.connection.db.collection("reports").insertOne({ _id: caseId, reporter: actor, video: videoId, reason: "other", status: "pending", createdAt: new Date() });
    // Run at end of the collection to avoid processing fixtures from other cases.
    const cursor = (BigInt(`0x${caseId.toString()}`) - 1n).toString(16).padStart(24, "0");
    const first = await backfillModerationHolds({ caseType: "report", cursor, limit: 1, dryRun: false });
    const second = await backfillModerationHolds({ caseType: "report", cursor, limit: 1, dryRun: false });
    assert.equal(first.failed, 0); assert.equal(first.unresolved, 2); assert.equal(second.existing, 2);
});

dbtest("expired Moment creates a durable unresolved media record", async () => {
    const { expireMoment } = await import("../../src/services/expireMoment.service.js");
    const owner = await seedUser(); const momentId = id();
    await mongoose.connection.db.collection("moments").insertOne({ _id: momentId, owner, mediaUrl: "legacy", mediaPublicId: "legacy", mediaType: "image", expiresAt: new Date(Date.now() - 1000) });
    assert.equal(await tx((session) => expireMoment(momentId, { session })), true);
    const cleanup = await mongoose.connection.db.collection("mediacleanuprecords").findOne({ _id: `moment:${momentId}` });
    assert.equal(cleanup.status, "unresolved");
});

dbtest("worker leases quarantine expired claims", async () => {
    const { CloudinaryAsset } = await import("../../src/models/cloudinaryAsset.model.js");
    const { MediaCleanupRecord } = await import("../../src/models/mediaCleanupRecord.model.js");
    const { claimCleanupJob, quarantineExpiredCleanup } = await import("../../src/services/mediaCleanupWorker.service.js");
    const actor = await seedUser(); const asset = crypto.randomBytes(32).toString("hex"); const jobId = `test:${id()}`;
    await CloudinaryAsset.create({ _id: asset, cloudName: "test", publicId: asset, resourceType: "image", deliveryType: "upload" });
    await MediaCleanupRecord.create({ _id: jobId, user: actor, sourceType: "test", sourceId: id(), asset, status: "pending" });
    const past = new Date(Date.now() - 10000);
    await tx((session) => claimCleanupJob({ jobId, workerId: "test", session, leaseMs: 1000, now: past }));
    assert.equal(await tx((session) => quarantineExpiredCleanup({ jobId, session })), true);
    assert.equal((await MediaCleanupRecord.findById(jobId).lean()).status, "review_required");
});

dbtest("cleanup coordinator rolls back earlier work on a later failure", async () => {
    const { cleanupAccount } = await import("../../src/services/cleanupAccount.service.js");
    const { Video } = await import("../../src/models/video.model.js");
    const userId = await seedUser();
    const before = await mongoose.connection.db.collection("users").findOne({ _id: userId });
    const originalFind = Video.find;
    Video.find = () => { throw new Error("injected coordinator failure"); };
    try { await assert.rejects(cleanupAccount(userId), /injected coordinator failure/); }
    finally { Video.find = originalFind; }
    const after = await mongoose.connection.db.collection("users").findOne({ _id: userId });
    assert.equal(after.username, before.username);
    assert.equal(after.anonymizedAt, undefined);
    assert.notEqual(after.databaseCleanupStatus, "complete");
});

dbtest("concurrent asset registration remains fenced and reservation stays disabled", async () => {
    const { CloudinaryAsset } = await import("../../src/models/cloudinaryAsset.model.js");
    const { CloudinaryAssetReference } = await import("../../src/models/cloudinaryAssetReference.model.js");
    const { registerAssetReference, reserveAssetDeletion } = await import("../../src/services/cloudinaryAssetReference.service.js");
    const asset = crypto.randomBytes(32).toString("hex"); const actor = await seedUser(); const first = id(); const second = id();
    await CloudinaryAsset.create({ _id: asset, cloudName: "test", publicId: asset, resourceType: "image", deliveryType: "upload" });
    const results = await Promise.allSettled([
        tx((session) => registerAssetReference({ assetId: asset, sourceType: "attachment", sourceId: first, userId: actor, session })),
        tx((session) => registerAssetReference({ assetId: asset, sourceType: "attachment", sourceId: second, userId: actor, session })),
        tx((session) => reserveAssetDeletion({ assetId: asset, session }))
    ]);
    assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].status, "fulfilled");
    assert.equal(results[2].status, "rejected"); assert.match(results[2].reason.message, /disabled/);
    assert.equal(await CloudinaryAssetReference.countDocuments({ asset }), 2);
    assert.equal((await CloudinaryAsset.findById(asset).lean()).lifecycleStatus, "active");
});

dbtest("retention approval and release preserve another case's hold", async () => {
    const { CloudinaryAsset } = await import("../../src/models/cloudinaryAsset.model.js");
    const { CloudinaryAssetReference } = await import("../../src/models/cloudinaryAssetReference.model.js");
    const { AssetModerationHold } = await import("../../src/models/assetModerationHold.model.js");
    const { registerAssetReference } = await import("../../src/services/cloudinaryAssetReference.service.js");
    const { approveModerationRetention, releaseModerationHolds } = await import("../../src/services/assetModerationHold.service.js");
    const previous = process.env.MODERATION_MIN_RETENTION_DAYS; process.env.MODERATION_MIN_RETENTION_DAYS = "1";
    try {
        const admin = await seedUser({ role: "admin", isActive: true, deletionRequestedAt: null, anonymizedAt: null });
        const actor = await seedUser(); const caseId = id(); const otherCase = id(); const videoId = id();
        const reviewedAt = new Date(Date.now() - 3 * 86400000); const until = new Date(Date.now() - 86400000);
        await mongoose.connection.db.collection("reports").insertOne({ _id: caseId, reporter: actor, video: videoId, status: "resolved", reviewedAt });
        const asset = crypto.randomBytes(32).toString("hex");
        await CloudinaryAsset.create({ _id: asset, cloudName: "test", publicId: asset, resourceType: "image", deliveryType: "upload" });
        for (const [cid, slot] of [[caseId, "video"], [caseId, "thumbnail"], [otherCase, "video"]]) {
            await tx(async (session) => {
                await registerAssetReference({ assetId: asset, sourceType: `moderation_report_${slot}`, sourceId: cid, userId: actor, session });
                await AssetModerationHold.create([{ _id: `report:${cid}:${slot}`, caseType: "report", caseId: cid, video: videoId, actor, slot, asset, status: "active" }], { session });
            });
        }
        await tx((session) => approveModerationRetention({ caseType: "report", caseId, adminId: admin, retentionUntil: until, reason: "Test retention", session }));
        await tx((session) => releaseModerationHolds({ caseType: "report", caseId, adminId: admin, session }));
        await assert.rejects(tx((session) => releaseModerationHolds({ caseType: "report", caseId, adminId: admin, session })));
        assert.equal(await AssetModerationHold.countDocuments({ caseId, status: "released" }), 2);
        assert.equal(await AssetModerationHold.countDocuments({ caseId: otherCase, status: "active" }), 1);
        assert.equal(await CloudinaryAssetReference.countDocuments({ asset }), 1);
        assert.equal(await mongoose.connection.db.collection("auditlogs").countDocuments({ resourceId: caseId }), 2);
    } finally { if (previous === undefined) delete process.env.MODERATION_MIN_RETENTION_DAYS; else process.env.MODERATION_MIN_RETENTION_DAYS = previous; }
});

dbtest("unresolved hold creation conflicts with concurrent barrier writes", async () => {
    const { fenceMediaCoverage } = await import("../../src/services/mediaCoverageBarrier.service.js");
    const { createVideoModerationHolds } = await import("../../src/services/assetModerationHold.service.js");
    const owner = await seedUser(); const actor = await seedUser(); const videoId = id(); const caseId = id();
    await mongoose.connection.db.collection("videos").insertOne({ _id: videoId, owner, videoFile: "legacy", videoPublicId: "legacy", thumbnail: "legacy", thumbnailPublicId: "legacy" });
    const before = await mongoose.connection.db.collection("mediacoveragebarriers").findOne({ _id: "global" });
    await Promise.all([tx((session) => fenceMediaCoverage({ session })), tx((session) => createVideoModerationHolds({ caseType: "report", caseId, videoId, actor, session }))]);
    const after = await mongoose.connection.db.collection("mediacoveragebarriers").findOne({ _id: "global" });
    assert.ok(after.fenceVersion >= (before?.fenceVersion || 0) + 2);
    assert.equal(after.coverageStatus, "blocked"); assert.equal(after.verifiedVersion, null);
    assert.equal(await mongoose.connection.db.collection("assetmoderationholds").countDocuments({ caseId, status: "unresolved" }), 2);
});

dbtest("registry backfill reports conflicts, retries and is idempotent", async () => {
    const { backfillMediaReferences } = await import("../../src/services/backfillMediaReferences.service.js");
    const { CloudinaryAsset } = await import("../../src/models/cloudinaryAsset.model.js");
    const { CloudinaryAssetReference } = await import("../../src/models/cloudinaryAssetReference.model.js");
    const actor = await seedUser(); const messageId = id();
    const identity = { cloudName: "test", publicId: `test-${messageId}`, resourceType: "image", deliveryType: "upload" };
    const asset = crypto.createHash("sha256").update(JSON.stringify(Object.values(identity))).digest("hex");
    const url = `https://example.invalid/${messageId}`;
    await mongoose.connection.db.collection("messages").insertOne({ _id: messageId, conversation: id(), sender: actor, type: "image",
        attachment: { url, publicId: identity.publicId, resourceType: identity.resourceType, deliveryType: identity.deliveryType,
            mediaRegistry: { ...identity, asset, url, identityVerified: true } } });
    await CloudinaryAsset.create({ _id: asset, ...identity, publicId: "intentional-conflict" });
    const cursor = (BigInt(`0x${messageId}`) - 1n).toString(16).padStart(24, "0");
    const failed = await backfillMediaReferences({ source: "messages", cursor, limit: 1, dryRun: false });
    assert.equal(failed.failed, 1); assert.equal(failed.nextCursor, cursor);
    assert.equal(await CloudinaryAssetReference.countDocuments({ sourceId: messageId }), 0);
    await CloudinaryAsset.deleteOne({ _id: asset });
    const retried = await backfillMediaReferences({ source: "messages", cursor, limit: 1, dryRun: false });
    const again = await backfillMediaReferences({ source: "messages", cursor, limit: 1, dryRun: false });
    assert.equal(retried.linked, 1); assert.equal(again.existing, 1);
    assert.equal(await CloudinaryAssetReference.countDocuments({ sourceId: messageId }), 1);
});

dbtest("Moment expiration preserves another user's shared asset reference", async () => {
    const { CloudinaryAsset } = await import("../../src/models/cloudinaryAsset.model.js");
    const { CloudinaryAssetReference } = await import("../../src/models/cloudinaryAssetReference.model.js");
    const { registerAssetReference } = await import("../../src/services/cloudinaryAssetReference.service.js");
    const { expireMoment } = await import("../../src/services/expireMoment.service.js");
    const owner = await seedUser(); const other = await seedUser(); const momentId = id(); const otherSource = id();
    const identity = { cloudName: "test", publicId: `moment-${momentId}`, resourceType: "image", deliveryType: "upload" };
    const asset = crypto.createHash("sha256").update(JSON.stringify(Object.values(identity))).digest("hex");
    const url = `https://example.invalid/${momentId}`;
    await CloudinaryAsset.create({ _id: asset, ...identity });
    await mongoose.connection.db.collection("moments").insertOne({ _id: momentId, owner, mediaUrl: url, mediaPublicId: identity.publicId,
        mediaType: "image", mediaResourceType: "image", mediaDeliveryType: "upload", expiresAt: new Date(Date.now() - 1000),
        mediaRegistry: { moment: { ...identity, asset, url, identityVerified: true } } });
    await tx((session) => registerAssetReference({ assetId: asset, sourceType: "moment", sourceId: momentId, userId: owner, session }));
    await tx((session) => registerAssetReference({ assetId: asset, sourceType: "attachment", sourceId: otherSource, userId: other, session }));
    await tx((session) => expireMoment(momentId, { session }));
    assert.equal(await CloudinaryAssetReference.countDocuments({ asset, sourceId: momentId }), 0);
    assert.equal(await CloudinaryAssetReference.countDocuments({ asset, sourceId: otherSource }), 1);
    assert.equal((await mongoose.connection.db.collection("mediacleanuprecords").findOne({ _id: `moment:${momentId}` })).status, "review_required");
});

dbtest("TTL migration detects actual test indexes and preserves records", async () => {
    const { migrateExpirationIndexes } = await import("../../scripts/prepareExpirationIndexes.js");
    const uri = new URL(process.env.TEST_MONGODB_URI); uri.pathname = `/${owned.dbName}`;
    const db = mongoose.connection.db;
    await db.collection("_migration_safety").insertOne({ _id: "ttl_index_migration", environment: "local_test", database: owned.dbName });
    for (const name of ["moments", "notifications"]) {
        await db.collection(name).createIndex({ expiresAt: 1 }, { name: `test_${name}_ttl`, expireAfterSeconds: 315360000 });
    }
    await db.collection("pendingusers").createIndex({ verificationOtpExpiry: 1 }, { name: "legacy_custom_pending_ttl", expireAfterSeconds: 315360000 });
    const pendingFixture = id(); const pendingExpiry = new Date(Date.now() + 86400000);
    await db.collection("pendingusers").insertOne({ _id: pendingFixture, fullName: "Test User", username: `migration_${pendingFixture}`,
        email: `${pendingFixture}@invalid.invalid`, avatar: "https://legacy.invalid/migration", verificationOtpExpiry: pendingExpiry });
    const fixture = id();
    await db.collection("notifications").insertOne({ _id: fixture, recipient: await seedUser(), type: "system", title: "test", message: "test", expiresAt: new Date(Date.now() + 86400000) });
    const dryRun = await migrateExpirationIndexes({ uri: uri.toString(), dbName: owned.dbName });
    assert.ok(dryRun.collections.every((entry) => entry.ttlIndexes.length === 1));
    assert.equal(dryRun.collections.find((entry) => entry.collection === "pendingusers").ttlIndexes[0].name, "legacy_custom_pending_ttl");
    assert.ok((await db.collection("pendingusers").indexes()).some((index) => index.name === "legacy_custom_pending_ttl"));
    const approvalId = `migration-test-${pendingFixture}`;
    await db.collection("mediacoverageapprovals").insertOne({ _id: approvalId, status: "test_approved", scope: "global", verificationVersion: 0, approvedVersion: 1, approvedAt: new Date(), evidence: {} });
    const result = await migrateExpirationIndexes({ uri: uri.toString(), dbName: owned.dbName, execute: true,
        confirmedDb: owned.dbName, acknowledged: true });
    assert.equal(result.dryRun, false);
    for (const name of ["moments", "notifications"]) {
        const indexes = await db.collection(name).indexes();
        assert.equal(indexes.some((index) => index.expireAfterSeconds !== undefined && index.key?.expiresAt), false);
        assert.ok(indexes.some((index) => index.key?.expiresAt === 1 && index.key?._id === 1));
    }
    assert.ok(await db.collection("notifications").findOne({ _id: fixture }));
    const pendingIndexes = await db.collection("pendingusers").indexes();
    assert.equal(pendingIndexes.some((index) => index.key?.verificationOtpExpiry && index.expireAfterSeconds !== undefined), false);
    assert.ok(pendingIndexes.some((index) => index.name === "pending_user_expiration_scan" && index.key?.verificationOtpExpiry === 1 && index.key?._id === 1));
    assert.equal((await db.collection("pendingusers").findOne({ _id: pendingFixture })).avatar, "https://legacy.invalid/migration");
    const barrier = await db.collection("mediacoveragebarriers").findOne({ _id: "global" });
    assert.equal(barrier.coverageStatus, "blocked"); assert.equal(barrier.verifiedVersion, null); assert.equal(barrier.testRelease, false);
    assert.equal((await db.collection("mediacoverageapprovals").findOne({ _id: approvalId })).status, "invalidated");
    const again = await migrateExpirationIndexes({ uri: uri.toString(), dbName: owned.dbName, execute: true, confirmedDb: owned.dbName, acknowledged: true });
    assert.ok(again.collections.every((entry) => entry.ttlIndexes.length === 0 && entry.replacementExists));
    await db.collection("pendingusers").updateOne({ _id: pendingFixture }, { $set: { verificationOtpExpiry: new Date(Date.now() - 1000) } });
    const { expirePendingUser } = await import("../../src/services/expirePendingUser.service.js");
    assert.equal(await tx((session) => expirePendingUser(pendingFixture, { session })), true);
    const retained = await db.collection("pendingmediaretentions").findOne({ _id: `${pendingFixture}:avatar` });
    assert.equal(retained.url, "https://legacy.invalid/migration"); assert.equal(retained.status, "unresolved");
    assert.equal((await db.collection("mediacoveragebarriers").findOne({ _id: "global" })).testRelease, false);
});

dbtest("worker rejects stale claims and preserves quarantined lease", async () => {
    const { CloudinaryAsset } = await import("../../src/models/cloudinaryAsset.model.js");
    const { MediaCleanupRecord } = await import("../../src/models/mediaCleanupRecord.model.js");
    const { claimCleanupJob, recordCleanupFailure, quarantineExpiredCleanup } = await import("../../src/services/mediaCleanupWorker.service.js");
    const actor = await seedUser(); const asset = crypto.randomBytes(32).toString("hex"); const jobId = `test:${id()}`;
    await CloudinaryAsset.create({ _id: asset, cloudName: "test", publicId: asset, resourceType: "image", deliveryType: "upload" });
    await MediaCleanupRecord.create({ _id: jobId, user: actor, sourceType: "test", sourceId: id(), asset, status: "pending" });
    const past = new Date(Date.now() - 10000);
    const claim = await tx((session) => claimCleanupJob({ jobId, workerId: "test", session, leaseMs: 1000, now: past }));
    assert.ok(claim);
    await tx((session) => quarantineExpiredCleanup({ jobId, session }));
    await assert.rejects(tx((session) => recordCleanupFailure({ claim, session })), /Stale/);
    const job = await MediaCleanupRecord.findById(jobId).lean();
    const stored = await CloudinaryAsset.findById(asset).select("+cleanupLeaseToken").lean();
    assert.equal(job.status, "review_required"); assert.equal(job.operationState, "uncertain"); assert.equal(stored.cleanupLeaseToken, claim.token);
});

dbtest("expired and failed migration recovery is fenced, retryable and preserves records", async () => {
    const { migrateExpirationIndexes } = await import("../../scripts/prepareExpirationIndexes.js");
    const uri = new URL(process.env.TEST_MONGODB_URI); uri.pathname = `/${owned.dbName}`;
    const db = mongoose.connection.db;
    const opts = { uri: uri.toString(), dbName: owned.dbName, execute: true, confirmedDb: owned.dbName, acknowledged: true };
    const fixture = id();
    await db.collection("pendingusers").insertOne({ _id: fixture, fullName: "Recovery Test", username: `recovery_${fixture}`,
        email: `${fixture}@invalid.invalid`, avatar: "https://legacy.invalid/recovery", verificationOtpExpiry: new Date(Date.now() + 86400000) });
    await db.collection("pendingusers").createIndex({ verificationOtpExpiry: 1 }, { name: "interrupted_pending_ttl", expireAfterSeconds: 315360000 });
    const oldToken = crypto.randomUUID();
    await db.collection("_media_index_migration").updateOne({ _id: "expiration_indexes" }, { $set: { status: "active", token: oldToken, leaseUntil: new Date(Date.now() - 10000) } });
    await db.collection("_migration_locks").insertOne({ _id: "expiration_indexes", token: oldToken, database: owned.dbName });
    await assert.rejects(migrateExpirationIndexes({ ...opts, recover: true, expectedToken: oldToken }), /confirmed owner quiescence/);
    await assert.rejects(migrateExpirationIndexes({ ...opts, recover: true, expectedToken: "stale", quiescenceConfirmed: true }), /stale recovery token/);
    const recovery = { ...opts, recover: true, expectedToken: oldToken, quiescenceConfirmed: true };
    const attempts = await Promise.allSettled([migrateExpirationIndexes(recovery), migrateExpirationIndexes(recovery)]);
    assert.ok(attempts.some((result) => result.status === "fulfilled"));
    assert.equal((await db.collection("_media_index_migration").findOne({ _id: "expiration_indexes" })).status, "complete");
    assert.equal((await migrateExpirationIndexes(recovery)).alreadyRecovered, true);
    assert.equal((await db.collection("pendingusers").findOne({ _id: fixture })).avatar, "https://legacy.invalid/recovery");
    assert.equal((await db.collection("pendingusers").indexes()).some((index) => index.name === "interrupted_pending_ttl"), false);
    assert.equal((await db.collection("mediacoveragebarriers").findOne({ _id: "global" })).testRelease, false);
    await db.collection("pendingusers").createIndex({ verificationOtpExpiry: 1 }, { name: "stale_evidence_ttl", expireAfterSeconds: 315360000 });
    await assert.rejects(migrateExpirationIndexes(recovery), /evidence is stale/);
    await db.collection("pendingusers").dropIndex("stale_evidence_ttl");
    const failedToken = crypto.randomUUID();
    await db.collection("_media_index_migration").updateOne({ _id: "expiration_indexes" }, { $set: { status: "failed", token: failedToken } });
    const failed = await migrateExpirationIndexes({ ...opts, recover: true, expectedToken: failedToken, quiescenceConfirmed: true });
    assert.equal(failed.dryRun, false);
    assert.equal((await db.collection("mediacoveragebarriers").findOne({ _id: "global" })).coverageStatus, "blocked");
});
