import mongoose from "mongoose";

import { Report } from "../models/report.model.js";
import { Video } from "../models/video.model.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

//=============================== reportVideo ===================================

const reportVideo = asyncHandler(async (req, res) => {

    const reporterId = req.user._id;
    const { videoId } = req.params;
    const { reason, description = null } = req.body;

    // Validate videoId
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    // Validate reason
    if (!reason) {
        throw new ApiError(400, "Report reason is required");
    }

    // Check video exists
    const video = await Video.findById(videoId)
        .select("_id owner")
        .lean();

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // User cannot report own video
    if (video.owner.equals(reporterId)) {
        throw new ApiError(400, "You cannot report your own video");
    }

    let report;

    try {
        report = await Report.create({
            reporter: reporterId,
            video: videoId,
            reason,
            description,
        });
    } catch (error) {

        // Duplicate report
        if (error?.code === 11000) {
            throw new ApiError(
                409,
                "You have already reported this video"
            );
        }

        throw error;
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                reportId: report._id,
                videoId: report.video,
                reason: report.reason,
                description: report.description,
                status: report.status,
                reportedAt: report.createdAt,
            },
            "Video reported successfully"
        )
    );
});

//=============================== getMyReports ===================================

const getMyReports = asyncHandler(async (req, res) => {

    const reports = await Report.find({
        reporter: req.user._id,
    })
        .populate({
            path: "video",
            select: "_id title thumbnail owner",
            populate: {
                path: "owner",
                select: "_id username fullName avatar",
            },
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
    reportVideo,
    getMyReports,
};