import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { openTestDatabase, closeTestDatabase } from "./testDatabase.js";
import { ConversationMember } from "../../src/models/conversationMember.model.js";
import { mutateGroupMembership, inspectGroupMembership } from "../../src/services/groupMembership.service.js";
import { cleanupUserGroupMemberships } from "../../src/services/cleanupUserGroupMemberships.service.js";

test("group membership authorization, atomic changes and cleanup compatibility", { skip: !process.env.TEST_MONGODB_URI && "TEST_MONGODB_URI is not configured" }, async () => {
    const owned = await openTestDatabase();
    try {
        const db = mongoose.connection.db; const makeId = () => new mongoose.Types.ObjectId();
        const owner = makeId(), member = makeId(), newcomer = makeId(), outsider = makeId(), group = makeId();
        await db.collection("users").insertMany([owner, member, newcomer, outsider].map((_id) => ({ _id, username: `test_${_id}`, email: `${_id}@invalid.invalid`, fullName: "Test", isActive: true, isVerified: true, role: "user" })));
        await ConversationMember.createIndexes();
        await db.collection("conversations").insertOne({ _id: group, type: "group", createdBy: owner, participants: [owner, member], isActive: true, membershipVersion: 0 });
        await db.collection("conversationmembers").insertMany([{ conversation: group, user: owner, role: "admin", isActive: true }, { conversation: group, user: member, role: "member", isActive: true }]);
        await db.collection("conversations").updateOne({ _id: group }, { $set: { participants: [owner, outsider] } });
        const legacy = await inspectGroupMembership(group);
        assert.deepEqual(legacy.missingParticipants, [String(member)]); assert.deepEqual(legacy.staleParticipants, [String(outsider)]);
        await db.collection("conversations").updateOne({ _id: group }, { $set: { participants: [owner, member] } });
        const args = { conversationId: group, actorId: owner, targetId: newcomer, action: "add" };
        await assert.rejects(mutateGroupMembership({ ...args, actorId: member }), /Only admins/);
        await assert.rejects(mutateGroupMembership({ ...args, actorId: outsider }), /Active membership/);
        await assert.rejects(mutateGroupMembership({ ...args, targetId: owner, action: "remove" }), /leave/);
        const priorVersion = (await db.collection("conversations").findOne({ _id: group })).membershipVersion;
        const originalCreate = ConversationMember.create;
        try { ConversationMember.create = async () => { throw new Error("injected membership failure"); };
            await assert.rejects(mutateGroupMembership(args), /injected membership failure/);
        } finally { ConversationMember.create = originalCreate; }
        assert.equal((await db.collection("conversations").findOne({ _id: group })).membershipVersion, priorVersion);
        assert.equal(await db.collection("conversationmembers").countDocuments({ conversation: group, user: newcomer }), 0);
        const outcomes = await Promise.allSettled([mutateGroupMembership(args), mutateGroupMembership(args)]);
        assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
        assert.equal(await db.collection("conversationmembers").countDocuments({ conversation: group, user: newcomer }), 1);
        assert.deepEqual(await inspectGroupMembership(group), { duplicateUsers: [], duplicateParticipants: [], missingParticipants: [], staleParticipants: [], ownerMissingOrNotAdmin: false, noActiveAdmin: false });
        const messageId = makeId(); await db.collection("messages").insertOne({ _id: messageId, conversation: group, sender: newcomer, type: "text", content: "original", isDeleted: false });
        await mutateGroupMembership({ ...args, action: "remove" });
        assert.equal((await db.collection("conversationmembers").findOne({ conversation: group, user: newcomer })).isActive, false);
        assert.equal((await db.collection("conversations").findOne({ _id: group })).participants.some((id) => id.equals(newcomer)), false);
        process.env.ACCESS_TOKEN_SECRET = "isolated-integration-only-secret";
        const { default: jwt } = await import("jsonwebtoken"); const { default: app } = await import("../../src/app.js");
        const token = jwt.sign({ _id: String(newcomer) }, process.env.ACCESS_TOKEN_SECRET);
        const server = app.listen(0, "127.0.0.1"); await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
        try {
            const url = `http://127.0.0.1:${server.address().port}/api/v1/messages/${group}`;
            const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
            assert.equal((await fetch(url, { headers })).status, 403);
            assert.equal((await fetch(url, { method: "POST", headers, body: JSON.stringify({ type: "text", content: "not allowed" }) })).status, 403);
            const messageUrl = `http://127.0.0.1:${server.address().port}/api/v1/messages/${messageId}`;
            assert.equal((await fetch(messageUrl, { method: "PATCH", headers, body: JSON.stringify({ content: "changed" }) })).status, 403);
            assert.equal((await fetch(messageUrl, { method: "DELETE", headers })).status, 403);
            assert.equal((await db.collection("messages").findOne({ _id: messageId })).content, "original");
        } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
        await assert.rejects(mutateGroupMembership({ ...args, targetId: owner, action: "role", role: "member" }), /owner/);
        await mutateGroupMembership({ ...args, targetId: member, action: "role", role: "admin" });
        await mutateGroupMembership({ conversationId: group, actorId: owner, action: "leave" });
        const transferred = await db.collection("conversations").findOne({ _id: group }); assert.ok(transferred.createdBy.equals(member));
        assert.deepEqual(transferred.participants.map(String), [String(member)]);
        const second = makeId(); await db.collection("conversations").insertOne({ _id: second, type: "group", createdBy: member, participants: [member, outsider], isActive: true });
        await db.collection("conversationmembers").insertMany([{ conversation: second, user: member, role: "admin", isActive: true }, { conversation: second, user: outsider, role: "member", isActive: true }]);
        await db.collection("users").updateOne({ _id: member }, { $set: { isActive: false, deletionRequestedAt: new Date(), anonymizedAt: new Date() } });
        const session = await mongoose.startSession(); try { await session.withTransaction(() => cleanupUserGroupMemberships(member, { session })); } finally { await session.endSession(); }
        const after = await db.collection("conversations").findOne({ _id: second }); assert.ok(after.createdBy.equals(outsider));
        assert.deepEqual(after.participants.map(String), [String(outsider)]);
        assert.equal((await db.collection("conversationmembers").findOne({ conversation: second, user: member })).isActive, false);
        const parallelGroup = makeId(), adminA = makeId(), adminB = makeId();
        await db.collection("users").insertMany([adminA, adminB].map((_id) => ({ _id, username: `test_${_id}`, email: `${_id}@invalid.invalid`, fullName: "Test", isActive: true })));
        await db.collection("conversations").insertOne({ _id: parallelGroup, type: "group", createdBy: outsider, participants: [outsider, adminA, adminB], isActive: true });
        await db.collection("conversationmembers").insertMany([outsider, adminA, adminB].map((user) => ({ conversation: parallelGroup, user, role: "admin", isActive: true })));
        const roles = await Promise.allSettled([
            mutateGroupMembership({ conversationId: parallelGroup, actorId: adminA, targetId: adminB, action: "role", role: "member" }),
            mutateGroupMembership({ conversationId: parallelGroup, actorId: adminB, targetId: adminA, action: "role", role: "member" })
        ]);
        assert.equal(roles.filter((item) => item.status === "fulfilled").length, 1);
        assert.equal(await db.collection("conversationmembers").countDocuments({ conversation: parallelGroup, role: "admin", isActive: true }), 2);
    } finally { await closeTestDatabase(owned); }
});
