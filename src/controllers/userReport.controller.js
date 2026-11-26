import mongoose from "mongoose";

import { UserReport } from "../models/userReport.model.js";
import { User } from "../models/user.model.js";
import { Notification } from "../models/notification.model.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { activeModerationAdmins } from "../services/moderationNotification.service.js";

//=============================== reportUser ===================================//

const reportUser = asyncHandler(async (req, res) => {
    const reporterId = req.user._id;
    const { userId } = req.params;
    const { reason, description = null } = req.body;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(400, "Invalid user ID");
    }

    // Allowed report reasons
    const allowedReasons = [
        "spam",
        "harassment",
        "hate",
        "impersonation",
        "fake_account",
        "scam_or_fraud",
        "inappropriate_profile",
        "threats",
        "illegal_activity",
        "other",
    ];

    // Validate reason
    if (!reason || !allowedReasons.includes(reason)) {
        throw new ApiError(400, "Invalid report reason");
    }

    // User cannot report himself
    if (reporterId.toString() === userId.toString()) {
        throw new ApiError(400, "You cannot report yourself");
    }

    // Check reported user exists
    const reportedUser = await User.findById(userId)
        .select("_id username fullName avatar isActive")
        .lean();

    if (!reportedUser) {
        throw new ApiError(404, "User not found");
    }

    // Normalize empty description
    const cleanDescription =
        typeof description === "string" && description.trim()
            ? description.trim()
            : null;

    let report;

    try {
        const session = await mongoose.startSession();
        try { await session.withTransaction(async () => {
        [report] = await UserReport.create([{
            reporter: reporterId,
            reportType: "user",
            reportedUser: userId,
            reason,
            description: cleanDescription,
        }], { session });
        const admins = await activeModerationAdmins({ session });
        if (admins.length) await Notification.insertMany(admins.map((admin) => ({
            recipient: admin._id, adminOnly: true, actor: reporterId, type: "report_update", title: "New User Report",
            message: `${req.user.username} reported the user "${reportedUser.username}".`, entityType: "report", entityId: report._id,
            data: { reportId: report._id, reporterId, reportedUserId: reportedUser._id, reportedUsername: reportedUser.username,
                reportedUserName: reportedUser.fullName, reason: report.reason, description: report.description,
                status: report.status, action: "user_report_created" }
        })), { session });
        }); } finally { await session.endSession(); }
    } catch (error) {
        // Duplicate report
        if (error?.code === 11000) {
            throw new ApiError(
                409,
                "You have already reported this user"
            );
        }

        throw error;
    }

    //=============================== Response ===================================//

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                reportId: report._id,
                reportType: report.reportType,
                reportedUserId: report.reportedUser,
                reason: report.reason,
                description: report.description,
                status: report.status,
                reportedAt: report.createdAt,
            },
            "User reported successfully"
        )
    );
});

//=============================== getMyReports ===================================//

const getMyReports = asyncHandler(async (req, res) => {
    const reports = await UserReport.find({
        reporter: req.user._id,
    })
        .populate({
            path: "reportedUser",
            select: "_id username fullName avatar isActive",
        })
        .sort({ createdAt: -1 })
        .lean();

    return res.status(200).json(
        new ApiResponse(
            200,
            reports,
            "Your reports fetched successfully"
        )
    );
});

//=============================== Export ===================================//

export {
    reportUser,
    getMyReports,
};
