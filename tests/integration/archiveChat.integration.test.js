import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { openTestDatabase, closeTestDatabase } from "./testDatabase.js";
import { fenceGroupParticipants } from "../../src/services/groupMembership.service.js";

test("group creation fences account activity against deactivation", { skip: !process.env.TEST_MONGODB_URI && "TEST_MONGODB_URI is not configured" }, async () => {
    const owned = await openTestDatabase();
    try {
        const db = mongoose.connection.db; const actor = new mongoose.Types.ObjectId(), peer = new mongoose.Types.ObjectId();
        await db.collection("users").insertMany([actor, peer].map((_id) => ({ _id, username: `test_${_id}`, email: `${_id}@invalid.invalid`, fullName: "Test", isActive: true })));
        const session = await mongoose.startSession();
        try {
            session.startTransaction();
            await db.collection("users").findOne({ _id: peer }, { session });
            await db.collection("users").updateOne({ _id: peer }, { $set: { isActive: false } });
            await assert.rejects(fenceGroupParticipants([actor, peer], { session }), /conflict|inactive/i);
            await session.abortTransaction();
            await assert.rejects(session.withTransaction(() => fenceGroupParticipants([actor, peer], { session })), /inactive/);
            assert.equal((await db.collection("users").findOne({ _id: actor })).groupMembershipFence, undefined);
        } finally { await session.endSession(); }
        process.env.ACCESS_TOKEN_SECRET = "isolated-integration-only-secret";
        const { default: jwt } = await import("jsonwebtoken"); const { default: app } = await import("../../src/app.js");
        let server = app.listen(0, "127.0.0.1"); await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
        try {
            const token = jwt.sign({ _id: String(actor) }, process.env.ACCESS_TOKEN_SECRET);
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/conversation-members/group`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ name: "Test", participantIds: [String(peer)] }) });
            assert.equal(response.status, 400); assert.equal(await db.collection("conversations").countDocuments({ createdBy: actor }), 0);
        } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
    } finally { await closeTestDatabase(owned); }
});

test("archive persists per user for direct and group conversations", { skip: !process.env.TEST_MONGODB_URI && "TEST_MONGODB_URI is not configured" }, async () => {
    const owned = await openTestDatabase();
    try {
        process.env.ACCESS_TOKEN_SECRET = "isolated-integration-only-secret";
        const { default: jwt } = await import("jsonwebtoken"); const { default: app } = await import("../../src/app.js");
        const db = mongoose.connection.db; const actor = new mongoose.Types.ObjectId(), peer = new mongoose.Types.ObjectId(), stranger = new mongoose.Types.ObjectId();
        const group = new mongoose.Types.ObjectId(), direct = new mongoose.Types.ObjectId();
        await db.collection("users").insertMany([actor, peer, stranger].map((_id) => ({ _id, username: `test_${_id}`, email: `${_id}@invalid.invalid`, fullName: "Test", isActive: true })));
        await db.collection("conversations").insertMany([{ _id: group, type: "group", createdBy: actor, participants: [actor, peer], isActive: true, directReadStatus: [] }, { _id: direct, type: "direct", createdBy: actor, participants: [actor, peer], isActive: true, directReadStatus: [] }]);
        await db.collection("conversationmembers").insertMany([{ conversation: group, user: actor, role: "admin", isActive: true }, { conversation: group, user: peer, role: "member", isActive: true }]);
        const messageId = new mongoose.Types.ObjectId(); await db.collection("messages").insertOne({ _id: messageId, conversation: group, sender: peer, type: "text", content: "kept" });
        let server = app.listen(0, "127.0.0.1"); await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
        try {
            let base = `http://127.0.0.1:${server.address().port}/api/v1`; const token = (id) => jwt.sign({ _id: String(id) }, process.env.ACCESS_TOKEN_SECRET);
            const request = (id, url, method = "GET") => fetch(`${base}${url}`, { method, headers: { authorization: `Bearer ${token(id)}` } });
            const list = async (id, archived = false) => (await (await request(id, `/conversations${archived ? "?archived=true" : ""}`)).json()).data.conversation.map((item) => item._id).sort();
            assert.equal((await fetch(`${base}/conversation-members/${group}/archive`, { method: "PATCH" })).status, 401);
            assert.equal((await request(stranger, `/conversation-members/${group}/archive`, "PATCH")).status, 403);
            assert.equal((await request(stranger, `/conversation-members/${direct}/archive`, "PATCH")).status, 403);
            for (const chat of [group, direct]) { assert.equal((await request(actor, `/conversation-members/${chat}/archive`, "PATCH")).status, 200); assert.equal((await request(actor, `/conversation-members/${chat}/archive`, "PATCH")).status, 200); }
            assert.deepEqual(await list(actor), []); assert.deepEqual(await list(actor, true), [String(group), String(direct)].sort());
            assert.deepEqual(await list(peer), [String(group), String(direct)].sort()); assert.deepEqual(await list(peer, true), []);
            assert.equal((await db.collection("conversationmembers").findOne({ conversation: group, user: actor })).isArchived, true);
            assert.equal((await db.collection("conversations").findOne({ _id: direct })).directReadStatus.find((item) => item.user.equals(actor)).isArchived, true);
            assert.equal((await db.collection("messages").findOne({ _id: messageId })).content, "kept");
            await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
            server = app.listen(0, "127.0.0.1"); await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
            base = `http://127.0.0.1:${server.address().port}/api/v1`;
            assert.deepEqual(await list(actor, true), [String(group), String(direct)].sort());
            for (const chat of [group, direct]) { assert.equal((await request(actor, `/conversation-members/${chat}/unarchive`, "PATCH")).status, 200); assert.equal((await request(actor, `/conversation-members/${chat}/unarchive`, "PATCH")).status, 200); }
            assert.deepEqual(await list(actor), [String(group), String(direct)].sort()); assert.deepEqual(await list(actor, true), []);
            await db.collection("conversationmembers").updateOne({ conversation: group, user: actor }, { $set: { isActive: false } });
            assert.equal((await request(actor, `/conversation-members/${group}/archive`, "PATCH")).status, 403);
        } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
    } finally { await closeTestDatabase(owned); }
});
