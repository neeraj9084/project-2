import mongoose from "mongoose";

import { UserReport } from "../models/userReport.model.js";
import { User } from "../models/user.model.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

//=============================== reportUser ===================================//

const reportUser = asyncHandler(async (req, res) => {
    const reporterId = req.user._id;
    const { userId } = req.params;
    const { reason, description = null } = req.body;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(400, "Invalid user ID");
    }

    // Validate reason
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

    if (!reason || !allowedReasons.includes(reason)) {
        throw new ApiError(400, "Invalid report reason");
    }

    // User cannot report himself
    if (reporterId.toString() === userId.toString()) {
        throw new ApiError(400, "You cannot report yourself");
    }

    // Check reported user exists
    const reportedUser = await User.exists({
        _id: userId,
    });

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
        report = await UserReport.create({
            reporter: reporterId,
            reportType: "user",
            reportedUser: userId,
            reason,
            description: cleanDescription,
        });
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

export {
    reportUser,
    getMyReports,
};