import mongoose from "mongoose";
import { Report } from "../models/report.model.js";
import { UserReport } from "../models/userReport.model.js";
import { CopyrightClaim } from "../models/CopyrightClaim.model.js";
import { AssetModerationHold } from "../models/assetModerationHold.model.js";
import { Notification } from "../models/notification.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";

const updateModerationStatus = async ({ kind, id, status, actor }) => {
    const model = { video: Report, user: UserReport, copyright: CopyrightClaim }[kind];
    if (!model) throw new Error("Invalid moderation case");
    const session = await mongoose.startSession();
    try { return await session.withTransaction(async () => {
        const filter = { _id: id, ...(kind === "user" ? { reportType: "user" } : {}) };
        const original = await model.findOne(filter).session(session).lean();
        if (!original) throw new ApiError(404, "Report not found");
        const changed = original.status !== status;
        if (changed && ((kind === "video" && ["pending", "reviewed"].includes(status)) || (kind === "copyright" && status === "pending")) &&
            await AssetModerationHold.exists({ caseType: kind === "video" ? "report" : "copyright", caseId: id, status: "released" }).session(session)) throw new ApiError(409, "Released moderation holds require a new investigation");
        if (changed) await model.updateOne(filter, { $set: { status, reviewedBy: actor, reviewedAt: new Date() } }, { session, runValidators: true });
        let query = model.findOne(filter).session(session);
        if (kind === "video") query = query.select("_id reporter video reason description status reviewedBy reviewedAt createdAt updatedAt");
        if (kind === "user") query = query.select("_id reporter reportType reportedUser reason description status reviewedBy reviewedAt createdAt updatedAt");
        if (kind === "video") query = query.populate({ path: "video", select: "_id title thumbnail owner", populate: { path: "owner", select: "_id username fullName avatar" } });
        if (kind === "user") query = query.populate({ path: "reporter", select: "_id username fullName avatar" }).populate({ path: "reportedUser", select: "_id username fullName avatar" }).populate({ path: "reviewedBy", select: "_id username fullName avatar" });
        if (kind === "copyright") query = query.populate({ path: "claimant", select: "_id username fullName avatar isActive" }).populate({ path: "video", select: "_id title thumbnail owner", populate: { path: "owner", select: "_id username fullName avatar" } }).populate({ path: "reviewedBy", select: "_id username fullName avatar" });
        const record = await query.lean();
        const recipient = kind === "copyright" ? original.claimant : original.reporter;
        if (changed && await User.exists({ _id: recipient, isActive: true, deletionRequestedAt: null, anonymizedAt: null }).session(session)) {
            const isCopyright = kind === "copyright";
            const data = isCopyright ? { claimId: record._id, claimType: "copyright", videoId: record.video?._id || null, videoTitle: record.video?.title || null }
                : { reportId: record._id, reportType: kind, ...(kind === "video" ? { videoId: record.video?._id || null, videoTitle: record.video?.title || null } : {}) };
            await Notification.create([{ recipient, actor, type: isCopyright ? "system" : kind === "video" ? "video_report_update" : "report_update",
                title: isCopyright ? "Copyright Claim Status Updated" : kind === "video" ? "Video Report Status Updated" : "Report Status Updated",
                message: isCopyright ? `Your copyright claim has been ${status}.` : `Your ${kind === "video" ? "video report" : "report"} has been ${status}.`,
                entityType: "report", entityId: record._id, data: { ...data, reason: record.reason, description: record.description, status: record.status, reviewedAt: record.reviewedAt } }], { session });
        }
        return record;
    }); } finally { await session.endSession(); }
};
export { updateModerationStatus };
