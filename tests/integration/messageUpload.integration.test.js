import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Readable } from "node:stream";
import mongoose from "mongoose";
import { openTestDatabase, closeTestDatabase } from "./testDatabase.js";
import { Message } from "../../src/models/message.model.js";

test("message uploads validate access, content and cleanup while retaining failed intents", { skip: !process.env.TEST_MONGODB_URI && "TEST_MONGODB_URI is not configured" }, async () => {
    const owned = await openTestDatabase();
    try {
        process.env.ACCESS_TOKEN_SECRET = "isolated-integration-only-secret";
        const { default: jwt } = await import("jsonwebtoken"); const { default: app } = await import("../../src/app.js");
        const { v2: cloudinary } = await import("cloudinary"); const oldUpload = cloudinary.uploader.upload, oldName = cloudinary.config().cloud_name;
        cloudinary.config({ cloud_name: "isolated-test.invalid" }); let calls = 0, failUpload = false, failAt = null, resourceType = "image";
        cloudinary.uploader.upload = async (_file, opts) => { calls++; if (failUpload || calls === failAt) throw new Error("synthetic upload failure"); return { public_id: opts.public_id, resource_type: resourceType, type: "upload", secure_url: `https://synthetic.invalid/${opts.public_id}` }; };
        const db = mongoose.connection.db; const actor = new mongoose.Types.ObjectId(), peer = new mongoose.Types.ObjectId(), outsider = new mongoose.Types.ObjectId();
        const group = new mongoose.Types.ObjectId(), direct = new mongoose.Types.ObjectId();
        await db.collection("users").insertMany([actor, peer, outsider].map((_id) => ({ _id, username: `test_${_id}`, email: `${_id}@invalid.invalid`, fullName: "Test", isActive: true })));
        await db.collection("conversations").insertMany([{ _id: group, type: "group", participants: [actor, peer], createdBy: actor, isActive: true }, { _id: direct, type: "direct", participants: [actor, peer], createdBy: actor, isActive: true }]);
        await db.collection("conversationmembers").insertMany([{ conversation: group, user: actor, role: "admin", isActive: true }, { conversation: group, user: peer, role: "member", isActive: false }]);
        const server = app.listen(0, "127.0.0.1"); await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
        const initialFiles = new Set(fs.readdirSync("public/temp"));
        try {
            const base = `http://127.0.0.1:${server.address().port}/api/v1/messages`; const token = (id) => jwt.sign({ _id: String(id) }, process.env.ACCESS_TOKEN_SECRET);
            const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO7sAAAAASUVORK5CYII=", "base64");
            const form = (items) => { const value = new FormData(); value.set("type", "image"); for (const [bytes, mime, name] of items) value.append("media", new Blob([bytes], { type: mime }), name); return value; };
            const request = (user, chat, items) => fetch(`${base}/${chat}`, { method: "POST", headers: { authorization: `Bearer ${token(user)}` }, body: form(items) });
            const image = [png, "image/png", "image.png"];
            assert.equal((await request(outsider, group, [image])).status, 403);
            assert.equal((await request(peer, group, [image])).status, 403);
            const block = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/users/block/${actor}`, { method: "POST", headers: { authorization: `Bearer ${token(peer)}` } });
            assert.equal(block.status, 201);
            assert.equal((await db.collection("conversations").findOne({ _id: direct })).membershipVersion, 1);
            assert.equal((await request(actor, direct, [image])).status, 403);
            assert.equal(calls, 0);
            assert.equal((await request(actor, group, [[Buffer.from("not png"), "image/png", "image.png"]])).status, 400);
            assert.equal((await request(actor, group, [[png.subarray(0, 24), "image/png", "image.png"]])).status, 400);
            assert.equal((await request(actor, group, [[png, "image/jpeg", "image.png"]])).status, 400);
            assert.equal((await request(actor, group, [image, image, image])).status, 400);
            assert.equal((await request(actor, group, [[Buffer.alloc(20 * 1024 * 1024 + 1), "image/png", "big.png"]])).status, 413);
            const stream = Readable.from((async function* () { yield Buffer.from("--testboundary\r\nContent-Disposition: form-data; name=\"media\"; filename=\"large.png\"\r\nContent-Type: image/png\r\n\r\n");
                for (let i = 0; i < 41; i++) yield Buffer.alloc(1024 * 1024); yield Buffer.from("\r\n--testboundary--\r\n"); })());
            const chunked = await fetch(`${base}/${group}`, { method: "POST", headers: { authorization: `Bearer ${token(actor)}`, "content-type": "multipart/form-data; boundary=testboundary" }, body: stream, duplex: "half" });
            assert.equal(chunked.status, 411);
            assert.equal(calls, 0);
            const ok = await request(actor, group, [image]); assert.equal(ok.status, 201);
            const messageId = new mongoose.Types.ObjectId((await ok.json()).data._id);
            assert.equal(await db.collection("mediauploadintents").countDocuments({ sourceId: messageId, status: "referenced" }), 1);
            assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ sourceId: messageId, sourceType: "attachment" }), 1);
            const pair = await request(actor, group, [image, image]); assert.equal(pair.status, 201);
            const pairData = (await pair.json()).data; const pairId = new mongoose.Types.ObjectId(pairData._id);
            assert.equal(pairData.attachments.length, 2); assert.equal(pairData.attachment.url, pairData.attachments[0].url);
            assert.equal(await db.collection("mediauploadintents").countDocuments({ sourceId: pairId, status: "referenced" }), 2);
            assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ sourceId: pairId, sourceType: "attachment" }), 2);
            const forward = await fetch(`${base}/${pairId}/forward`, { method: "POST", headers: { authorization: `Bearer ${token(actor)}`, "content-type": "application/json" }, body: JSON.stringify({ conversationId: String(group) }) });
            assert.equal(forward.status, 201); const forwarded = new mongoose.Types.ObjectId((await forward.json()).data._id);
            assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ sourceId: forwarded, sourceType: "attachment" }), 2);
            assert.equal((await fetch(`${base}/${forwarded}`, { method: "DELETE", headers: { authorization: `Bearer ${token(actor)}` } })).status, 200);
            assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ sourceId: pairId, sourceType: "attachment" }), 2);
            assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ sourceId: forwarded, sourceType: "attachment" }), 0);
            const pairStored = await db.collection("messages").findOne({ _id: pairId }); const legacyId = new mongoose.Types.ObjectId();
            await db.collection("messages").insertOne({ _id: legacyId, conversation: group, sender: actor, type: "image", attachment: pairStored.attachment, isDeleted: false, createdAt: new Date() });
            const { registerAssetReference } = await import("../../src/services/cloudinaryAssetReference.service.js");
            const legacySession = await mongoose.startSession();
            try { await legacySession.withTransaction(() => registerAssetReference({ assetId: pairStored.attachment.mediaRegistry.asset, sourceType: "attachment", sourceId: legacyId, userId: actor, session: legacySession })); }
            finally { await legacySession.endSession(); }
            const legacyForward = await fetch(`${base}/${legacyId}/forward`, { method: "POST", headers: { authorization: `Bearer ${token(actor)}`, "content-type": "application/json" }, body: JSON.stringify({ conversationId: String(group) }) });
            assert.equal(legacyForward.status, 201);
            const legacyForwardId = new mongoose.Types.ObjectId((await legacyForward.json()).data._id);
            assert.equal((await fetch(`${base}/${legacyForwardId}`, { method: "DELETE", headers: { authorization: `Bearer ${token(actor)}` } })).status, 200);
            assert.equal((await fetch(`${base}/${legacyId}`, { method: "DELETE", headers: { authorization: `Bearer ${token(actor)}` } })).status, 200);
            assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ sourceId: pairId, sourceType: "attachment" }), 2);
            const text = new FormData(); text.set("type", "file"); text.set("media", new Blob(["safe text"], { type: "text/plain" }), "note.txt");
            resourceType = "raw";
            assert.equal((await fetch(`${base}/${group}`, { method: "POST", headers: { authorization: `Bearer ${token(actor)}` }, body: text })).status, 201);
            resourceType = "image";
            failUpload = true; assert.equal((await request(actor, group, [image])).status, 500); failUpload = false;
            assert.equal(await db.collection("mediauploadintents").countDocuments({ user: actor, status: "uncertain" }), 1);
            failAt = calls + 2; assert.equal((await request(actor, group, [image, image])).status, 500); failAt = null;
            assert.equal(await db.collection("mediauploadintents").countDocuments({ user: actor, status: "uncertain" }), 2);
            const originalCreate = Message.create;
            try { Message.create = async () => { throw new Error("synthetic transaction failure"); }; assert.equal((await request(actor, group, [image, image])).status, 500); }
            finally { Message.create = originalCreate; }
            assert.equal(await db.collection("mediauploadintents").countDocuments({ user: actor, status: "uploaded" }), 3);
            assert.equal(await db.collection("messages").countDocuments({ conversation: group }), 3);
            const { backfillMediaReferences } = await import("../../src/services/backfillMediaReferences.service.js");
            const audit = await backfillMediaReferences({ source: "messages", limit: 100, dryRun: true });
            assert.equal(audit.failed, 0); assert.equal(audit.staleReferences, 0);
            await db.collection("cloudinaryassetreferences").deleteMany({ sourceId: pairId });
            const backfilled = await backfillMediaReferences({ source: "messages", limit: 100, dryRun: false });
            assert.equal(backfilled.failed, 0); assert.ok(backfilled.linked >= 2);
            assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ sourceId: pairId, sourceType: "attachment" }), 2);
            const replay = await backfillMediaReferences({ source: "messages", limit: 100, dryRun: false });
            assert.equal(replay.failed, 0); assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ sourceId: pairId, sourceType: "attachment" }), 2);
            await db.collection("users").updateOne({ _id: actor }, { $set: { isActive: false, deletionRequestedAt: new Date(), anonymizedAt: new Date() } });
            const { cleanupUserGroupMemberships } = await import("../../src/services/cleanupUserGroupMemberships.service.js");
            const { cleanupUserPersonalRecords } = await import("../../src/services/cleanupUserPersonalRecords.service.js");
            const session = await mongoose.startSession();
            try { await session.withTransaction(async () => { await cleanupUserGroupMemberships(actor, { session }); await cleanupUserPersonalRecords(actor, { session }); }); }
            finally { await session.endSession(); }
            assert.ok(await db.collection("mediacleanuprecords").findOne({ _id: `attachment:${pairId}:1`, status: "review_required" }));
            assert.equal(await db.collection("cloudinaryassetreferences").countDocuments({ sourceId: pairId, sourceType: "attachment" }), 2);
            assert.ok(await db.collection("messages").findOne({ _id: pairId }));
            const leftover = fs.readdirSync("public/temp").filter((name) => name.startsWith("message-") && !initialFiles.has(name));
            assert.deepEqual(leftover, []);
        } finally { cloudinary.uploader.upload = oldUpload; cloudinary.config({ cloud_name: oldName }); await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
    } finally { await closeTestDatabase(owned); }
});

test("block and membership removal serialize with in-flight message sends", { skip: !process.env.TEST_MONGODB_URI && "TEST_MONGODB_URI is not configured" }, async () => {
    const owned = await openTestDatabase();
    try {
        process.env.ACCESS_TOKEN_SECRET = "isolated-integration-only-secret";
        const { default: jwt } = await import("jsonwebtoken"); const { default: app } = await import("../../src/app.js");
        const { mutateGroupMembership } = await import("../../src/services/groupMembership.service.js");
        const db = mongoose.connection.db, sender = new mongoose.Types.ObjectId(), owner = new mongoose.Types.ObjectId();
        const direct = new mongoose.Types.ObjectId(), group = new mongoose.Types.ObjectId();
        await db.collection("users").insertMany([sender, owner].map((_id) => ({ _id, username: `test_${_id}`, email: `${_id}@invalid.invalid`, fullName: "Test", isActive: true })));
        await db.collection("conversations").insertMany([{ _id: direct, type: "direct", participants: [sender, owner], createdBy: sender, isActive: true },
            { _id: group, type: "group", participants: [sender, owner], createdBy: owner, isActive: true }]);
        await db.collection("conversationmembers").insertMany([{ conversation: group, user: owner, role: "admin", isActive: true }, { conversation: group, user: sender, role: "member", isActive: true }]);
        const server = app.listen(0, "127.0.0.1"); await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
        const originalCreate = Message.create;
        try {
            const base = `http://127.0.0.1:${server.address().port}/api/v1`; const token = (id) => jwt.sign({ _id: String(id) }, process.env.ACCESS_TOKEN_SECRET);
            const headers = (id) => ({ authorization: `Bearer ${token(id)}`, "content-type": "application/json" });
            const race = async (conversationId, change) => {
                let enteredResolve, releaseResolve; const entered = new Promise((resolve) => { enteredResolve = resolve; });
                const released = new Promise((resolve) => { releaseResolve = resolve; }); let first = true;
                Message.create = async function (...args) { if (first) { first = false; enteredResolve(); await released; } return originalCreate.apply(this, args); };
                try {
                    const sending = fetch(`${base}/messages/${conversationId}`, { method: "POST", headers: headers(sender), body: JSON.stringify({ type: "text", content: "race" }) });
                    await entered;
                    try { await change(); } finally { releaseResolve(); }
                    assert.equal((await sending).status, 403);
                } finally { Message.create = originalCreate; }
                assert.equal(await db.collection("messages").countDocuments({ conversation: conversationId }), 0);
            };
            await race(direct, async () => { const response = await fetch(`${base}/users/block/${sender}`, { method: "POST", headers: headers(owner) }); assert.equal(response.status, 201); });
            await race(group, () => mutateGroupMembership({ conversationId: group, actorId: owner, targetId: sender, action: "remove" }));
        } finally { Message.create = originalCreate; await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
    } finally { await closeTestDatabase(owned); }
});
