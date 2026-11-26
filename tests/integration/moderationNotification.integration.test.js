import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { openTestDatabase, closeTestDatabase } from "./testDatabase.js";
import { Notification } from "../../src/models/notification.model.js";
import { UserReport } from "../../src/models/userReport.model.js";
import { Report } from "../../src/models/report.model.js";

test("moderation notifications target active administrators and commit with case state", { skip: !process.env.TEST_MONGODB_URI && "TEST_MONGODB_URI is not configured" }, async () => {
    const owned = await openTestDatabase();
    try {
        process.env.ACCESS_TOKEN_SECRET = "isolated-integration-only-secret";
        const { default: jwt } = await import("jsonwebtoken"); const { default: app } = await import("../../src/app.js");
        const db = mongoose.connection.db; const id = () => new mongoose.Types.ObjectId();
        const reporter = id(), target = id(), target2 = id(), owner = id(), admin = id(), fake = id(), inactive = id(), pending = id(), video = id();
        const users = [reporter, target, target2, owner, admin, fake, inactive, pending].map((_id) => ({ _id, username: `user_${_id}`, email: `${_id}@invalid.invalid`, fullName: "Test", role: "user", isActive: true, isVerified: true }));
        users.find((u) => u._id.equals(admin)).role = "admin";
        Object.assign(users.find((u) => u._id.equals(fake)), { isAdmin: true });
        Object.assign(users.find((u) => u._id.equals(inactive)), { role: "admin", isActive: false });
        Object.assign(users.find((u) => u._id.equals(pending)), { role: "admin", deletionRequestedAt: new Date() });
        await db.collection("users").insertMany(users); await UserReport.createIndexes(); await Report.createIndexes();
        await db.collection("videos").insertOne({ _id: video, owner, title: "Test video", description: "Test", duration: 1, videoFile: "legacy", videoPublicId: "legacy", thumbnail: "legacy", thumbnailPublicId: "legacy", isDeleted: false });
        const server = app.listen(0, "127.0.0.1"); await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
        try {
            const base = `http://127.0.0.1:${server.address().port}/api/v1`; const token = (user) => jwt.sign({ _id: String(user) }, process.env.ACCESS_TOKEN_SECRET);
            const req = (user, route, method, body) => fetch(`${base}${route}`, { method, headers: { authorization: `Bearer ${token(user)}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
            const userReport = await req(reporter, `/user-reports/user/${target}`, "POST", { reason: "other" }); assert.equal(userReport.status, 201);
            const userReportId = new mongoose.Types.ObjectId((await userReport.json()).data.reportId);
            assert.equal((await req(reporter, `/user-reports/user/${target}`, "POST", { reason: "other" })).status, 409);
            const videoReport = await req(reporter, `/reports/video/${video}`, "POST", { reason: "other" }); assert.equal(videoReport.status, 201);
            const videoReportId = new mongoose.Types.ObjectId((await videoReport.json()).data.reportId);
            for (const caseId of [userReportId, videoReportId]) {
                const notifications = await db.collection("notifications").find({ entityId: caseId }).toArray();
                assert.deepEqual(notifications.map((n) => String(n.recipient)), [String(admin)]);
            }
            assert.equal(await db.collection("notifications").countDocuments({ recipient: { $in: [fake, inactive, pending] } }), 0);
            await db.collection("users").updateOne({ _id: admin }, { $set: { role: "user" } });
            const demoted = await req(admin, "/notifications", "GET");
            assert.equal(demoted.status, 200);
            assert.equal((await demoted.json()).data.notifications.length, 0);
            await db.collection("users").updateOne({ _id: admin }, { $set: { role: "admin" } });
            assert.equal((await req(fake, `/admin/video-reports/${videoReportId}/status`, "PATCH", { status: "reviewed" })).status, 403);
            assert.equal((await req(fake, "/admin/reports/users", "GET")).status, 403);
            for (const [route, caseId] of [[`/admin/video-reports/${videoReportId}/status`, videoReportId], [`/admin/user-reports/${userReportId}/status`, userReportId]]) {
                assert.equal((await req(admin, route, "PATCH", { status: "reviewed" })).status, 200);
                assert.equal((await req(admin, route, "PATCH", { status: "reviewed" })).status, 200);
                assert.equal(await db.collection("notifications").countDocuments({ recipient: reporter, entityId: caseId }), 1);
                assert.equal(await db.collection("notifications").countDocuments({ recipient: target, entityId: caseId }), 0);
            }
            const claims = await Promise.all([req(reporter, `/copyright-claims/${video}`, "POST", { reason: "test", description: "test" }), req(reporter, `/copyright-claims/${video}`, "POST", { reason: "test", description: "test" })]);
            assert.deepEqual(claims.map((response) => response.status).sort(), [201, 409]);
            const claim = await db.collection("copyrightclaims").findOne({ claimant: reporter, video });
            assert.equal(await db.collection("notifications").countDocuments({ recipient: admin, entityId: claim._id }), 1);
            assert.equal(await db.collection("notifications").countDocuments({ recipient: owner, "data.claimId": claim._id }), 1);
            assert.equal(await db.collection("assetmoderationholds").countDocuments({ caseId: claim._id }), 2);
            assert.equal((await req(admin, `/admin/copyright-claims/${claim._id}/status`, "PATCH", { status: "approved" })).status, 200);
            assert.equal((await req(admin, `/admin/copyright-claims/${claim._id}/status`, "PATCH", { status: "approved" })).status, 200);
            assert.equal(await db.collection("notifications").countDocuments({ recipient: reporter, entityId: claim._id }), 1);
            const originalInsert = Notification.insertMany;
            try { Notification.insertMany = async () => { throw new Error("injected notification failure"); };
                assert.equal((await req(reporter, `/user-reports/user/${target2}`, "POST", { reason: "other" })).status, 500);
            } finally { Notification.insertMany = originalInsert; }
            assert.equal(await db.collection("userreports").countDocuments({ reporter, reportedUser: target2 }), 0);
            const originalCreate = Notification.create;
            try { Notification.create = async () => { throw new Error("injected status notification failure"); };
                assert.equal((await req(admin, `/admin/video-reports/${videoReportId}/status`, "PATCH", { status: "resolved" })).status, 500);
            } finally { Notification.create = originalCreate; }
            assert.equal((await db.collection("reports").findOne({ _id: videoReportId })).status, "reviewed");
        } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
    } finally { await closeTestDatabase(owned); }
});
