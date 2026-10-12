import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js";
import { Like } from "../models/like.model.js";
import { Comment } from "../models/comment.model.js";
import { Share } from "../models/share.model.js";
import { WatchHistory } from "../models/watchHistory.model.js";
import { Report } from "../models/report.model.js";
import { CopyrightClaim } from "../models/copyrightClaim.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { UserReport } from "../models/userReport.model.js";
import { Notification } from "../models/notification.model.js";
import { Subscribe } from "../models/subscribe.model.js";
import { AuditLog } from "../models/auditLog.model.js";


//====================== getAdminOverview ==========================//

const getAdminOverview = asyncHandler(async (req, res) => {
    const [
        totalUsers,
        activeUsers,
        inactiveUsers,
        adminUsers,

        totalVideos,
        publishedVideos,
        unpublishedVideos,

        totalReports,
        pendingReports,
        resolvedReports,

        totalCopyrightClaims,
        pendingCopyrightClaims,
    ] = await Promise.all([
        // Users
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        User.countDocuments({ isActive: false }),
        User.countDocuments({ role: "admin" }),

        // Videos
        Video.countDocuments(),
        Video.countDocuments({ isPublished: true }),
        Video.countDocuments({ isPublished: false }),

        // Reports
        Report.countDocuments(),
        Report.countDocuments({ status: "pending" }),
        Report.countDocuments({ status: "resolved" }),

        // Copyright Claims
        CopyrightClaim.countDocuments(),
        CopyrightClaim.countDocuments({ status: "pending" }),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    inactive: inactiveUsers,
                    admins: adminUsers,
                },

                videos: {
                    total: totalVideos,
                    published: publishedVideos,
                    unpublished: unpublishedVideos,
                },

                reports: {
                    total: totalReports,
                    pending: pendingReports,
                    resolved: resolvedReports,
                },

                copyrightClaims: {
                    total: totalCopyrightClaims,
                    pending: pendingCopyrightClaims,
                },
            },
            "Admin overview fetched successfully"
        )
    );
});

//======================= getAllUser ===============================//

const getAllUsers = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        search = "",
        role,
        isActive
    } = req.query;

    const pageNumber = Math.max(Number(page), 1);
    const limitNumber = Math.min(Math.max(Number(limit), 1), 100);
    const skip = (pageNumber - 1) * limitNumber;

    const filter = {};

    // Search by username, email or fullName
    if (search.trim()) {
        filter.$or = [
            {
                username: {
                    $regex: search.trim(),
                    $options: "i"
                }
            },
            {
                email: {
                    $regex: search.trim(),
                    $options: "i"
                }
            },
            {
                fullName: {
                    $regex: search.trim(),
                    $options: "i"
                }
            }
        ];
    }

    // Filter by role
    if (role) {
        if (!["user", "admin"].includes(role)) {
            throw new ApiError(
                400,
                "Role must be either user or admin"
            );
        }

        filter.role = role;
    }

    // Filter by active status
    if (isActive !== undefined) {
        if (!["true", "false"].includes(isActive)) {
            throw new ApiError(
                400,
                "isActive must be true or false"
            );
        }

        filter.isActive = isActive === "true";
    }

    const [users, totalUsers] = await Promise.all([
        User.find(filter)
            .select(
                "-password -refreshToken " +
                "-verificationOtp -verificationOtpExpiry " +
                "-verificationOtpAttempts " +
                "-emailChangeOtp -emailChangeOtpExpiry " +
                "-emailChangeOtpAttempts " +
                "-forgotPasswordOtp -forgotPasswordOtpExpiry " +
                "-forgotPasswordOtpAttempts " +
                "-accountRecoveryOtp -accountRecoveryOtpExpiry " +
                "-accountRecoveryOtpAttempts " +
                "-passwordResetToken"
            )
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNumber)
            .lean(),

        User.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalUsers / limitNumber);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                users,
                pagination: {
                    currentPage: pageNumber,
                    limit: limitNumber,
                    totalUsers,
                    totalPages,
                    hasNextPage: pageNumber < totalPages,
                    hasPreviousPage: pageNumber > 1
                }
            },
            "Users fetched successfully"
        )
    );
});

//====================== getUserById =============================//

const getUserById = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(400, "Invalid user ID");
    }

    const user = await User.findById(userId)
        .select(
            "-password -refreshToken " +
            "-verificationOtp -verificationOtpExpiry " +
            "-verificationOtpAttempts " +
            "-emailChangeOtp -emailChangeOtpExpiry " +
            "-emailChangeOtpAttempts " +
            "-forgotPasswordOtp -forgotPasswordOtpExpiry " +
            "-forgotPasswordOtpAttempts " +
            "-accountRecoveryOtp -accountRecoveryOtpExpiry " +
            "-accountRecoveryOtpAttempts " +
            "-passwordResetToken"
        )
        .lean();

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            user,
            "User fetched successfully"
        )
    );
});

//===================== updateUserStatus ============================//

const updateUserStatus = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(400, "Invalid user ID");
    }

    if (typeof isActive !== "boolean") {
        throw new ApiError(
            400,
            "isActive must be a boolean"
        );
    }

    const user = await User.findByIdAndUpdate(
        userId,
        {
            $set: {
                isActive
            }
        },
        {
            new: true,
            runValidators: true
        }
    ).select(
        "-password -refreshToken " +
        "-verificationOtp -verificationOtpExpiry " +
        "-verificationOtpAttempts " +
        "-emailChangeOtp -emailChangeOtpExpiry " +
        "-emailChangeOtpAttempts " +
        "-forgotPasswordOtp -forgotPasswordOtpExpiry " +
        "-forgotPasswordOtpAttempts " +
        "-accountRecoveryOtp -accountRecoveryOtpExpiry " +
        "-accountRecoveryOtpAttempts " +
        "-passwordResetToken"
    );

    // ================= User Not Found ================= //

    if (!user) {
        throw new ApiError(404, "User not found");
    }


    // ================= Notification ================= //

    try {
        await Notification.create({
            recipient: user._id,
            actor: req.user._id,
            type: "system",

            title: isActive
                ? "Account Activated"
                : "Account Deactivated",

            message: isActive
                ? "Your account has been activated by an administrator."
                : "Your account has been deactivated by an administrator.",

            entityType: "user",
            entityId: user._id,

            data: {
                userId: user._id,
                isActive,
                action: isActive
                    ? "account_activated"
                    : "account_deactivated"
            }
        });
    } catch (error) {
        console.error(
            "Failed to create user status notification:",
            error.message
        );
    }


    // ================= Response ================= //

    return res.status(200).json(
        new ApiResponse(
            200,
            user,
            `User ${isActive ? "activated" : "deactivated"} successfully`
        )
    );
});
//===================== getAllVideos ================================//

const getAllVideos = asyncHandler(async(req, res) => {
    const {
        page = 1,
        limit = 20,
        search = "",
        isPublished 
    } = req.query

    const pageNumber = Math.max(Number(page), 1);
    const limitNumber = Math.min(Math.max(Number(limit), 1), 100);
    const skip = (pageNumber - 1) * limitNumber;

    const filter = {};

     // Search by title or description
    if (search.trim()) {
        filter.$or = [
            {
                title: {
                    $regex: search.trim(),
                    $options: "i"
                }
            },
            {
                description: {
                    $regex: search.trim(),
                    $options: "i"
                }
            }
        ];
    }

    // Filter by published status
    if (isPublished !== undefined) {
        if (!["true", "false"].includes(isPublished)) {
            throw new ApiError(
                400,
                "isPublished must be true or false"
            );
        }

        filter.isPublished = isPublished === "true";
    }

    const [videos, totalVideos] = await Promise.all([
        Video.find(filter)
            .populate(
                "owner",
                "username fullName email avatar isActive"
            )
            .select(
                "-videoPublicId -thumbnailPublicId"
            )
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNumber)
            .lean(),

        Video.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(
        totalVideos / limitNumber
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                videos,
                pagination: {
                    currentPage: pageNumber,
                    limit: limitNumber,
                    totalVideos,
                    totalPages,
                    hasNextPage: pageNumber < totalPages,
                    hasPreviousPage: pageNumber > 1
                }
            },
            "Videos fetched successfully"
        )
    );
});

//====================== getVideoById ==========================//

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    // Validate video ID
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findById(videoId)
        .populate({
            path: "owner",
            select: "username fullName email avatar isActive role createdAt"
        })
        .select(
            "-videoPublicId " +
            "-thumbnailPublicId"
        )
        .lean();

    // Video not found
    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            video,
            "Video details fetched successfully"
        )
    );
});

//===================== getUserVideos ================================//

const getUserVideos = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const {
        page = 1,
        limit = 20,
        search = "",
        isPublished,
    } = req.query;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(400, "Invalid user ID");
    }

    // Check user exists
    const userExists = await User.exists({
        _id: userId,
    });

    if (!userExists) {
        throw new ApiError(404, "User not found");
    }

    // Validate pagination
    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
        throw new ApiError(
            400,
            "Page must be a positive integer"
        );
    }

    if (
        !Number.isInteger(limitNumber) ||
        limitNumber < 1 ||
        limitNumber > 100
    ) {
        throw new ApiError(
            400,
            "Limit must be between 1 and 100"
        );
    }

    const skip = (pageNumber - 1) * limitNumber;

    // Build filter
    const filter = {
        owner: userId,
    };

    // Search by title or description
    if (search.trim()) {
        filter.$or = [
            {
                title: {
                    $regex: search.trim(),
                    $options: "i",
                },
            },
            {
                description: {
                    $regex: search.trim(),
                    $options: "i",
                },
            },
        ];
    }

    // Published status filter
    if (isPublished !== undefined) {
        if (!["true", "false"].includes(isPublished)) {
            throw new ApiError(
                400,
                "isPublished must be true or false"
            );
        }

        filter.isPublished = isPublished === "true";
    }

    // Get videos + total count
    const [videos, totalVideos] = await Promise.all([
        Video.find(filter)
            .populate(
                "owner",
                "username fullName email avatar isActive"
            )
            .select(
                "-videoPublicId -thumbnailPublicId"
            )
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNumber)
            .lean(),

        Video.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(
        totalVideos / limitNumber
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                userId,
                videos,

                pagination: {
                    currentPage: pageNumber,
                    limit: limitNumber,
                    totalVideos,
                    totalPages,

                    hasNextPage:
                        pageNumber < totalPages,

                    hasPreviousPage:
                        pageNumber > 1,
                },
            },
            "User videos fetched successfully"
        )
    );
});

//====================== updateVideoStatus ==========================//

const updateVideoStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { isPublished } = req.body;

    // Validate videoId
    if (!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Valid video ID is required");
    }

    // Validate status
    if (typeof isPublished !== "boolean") {
        throw new ApiError(
            400,
            "isPublished must be a boolean value"
        );
    }

    // Update video status atomically
    const video = await Video.findOneAndUpdate(
        {
            _id: videoId,
        },
        {
            $set: {
                isPublished,
            },
        },
        {
            new: true,
            runValidators: true,
            projection: {
                _id: 1,
                title: 1,
                thumbnail: 1,
                owner: 1,
                isPublished: 1,
                updatedAt: 1,
            },
        }
    ).lean();

    // Video not found
    if (!video) {
        throw new ApiError(404, "Video not found");
    }
     
    try {
    await Notification.create({
        recipient: video.owner,
        actor: req.user._id,
        type: "system",

        title: isPublished
            ? "Video Published"
            : "Video Unpublished",

        message: isPublished
            ? `Your video "${video.title}" has been published by an administrator.`
            : `Your video "${video.title}" has been unpublished by an administrator.`,

        entityType: "video",
        entityId: video._id,

        data: {
            videoId: video._id,
            videoTitle: video.title,
            thumbnail: video.thumbnail,
            isPublished,
            action: isPublished
                ? "video_published"
                : "video_unpublished"
        }
    });
} catch (error) {
    console.error(
        "Failed to create video status notification:",
        error.message
    );
}

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                video,
                status: isPublished ? "published" : "unpublished",
            },
            `Video ${
                isPublished ? "published" : "unpublished"
            } successfully`
        )
    );
});

//====================== deleteVideo =====================================//

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!videoId || !mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Valid video ID is required");
    }

    const session = await mongoose.startSession();

    let video;

    try {
        session.startTransaction();

        video = await Video.findById(videoId)
            .select(
                "_id videoFile thumbnail videoPublicId thumbnailPublicId owner"
            )
            .session(session)
            .lean();

        if (!video) {
            throw new ApiError(404, "Video not found");
        }

        await Video.deleteOne(
            { _id: videoId },
            { session }
        );

        await Like.deleteMany(
            { video: videoId },
            { session }
        );

        await Comment.deleteMany(
            { video: videoId },
            { session }
        );

        await Share.deleteMany(
            { video: videoId },
            { session }
        );

        await WatchHistory.updateMany(
            {},
            {
                $pull: {
                    videos: videoId,
                },
            },
            { session }
        );

        await session.commitTransaction();

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        await session.endSession();
    }

    const cloudinaryErrors = [];

    if (video.videoPublicId) {
        try {
            await cloudinary.uploader.destroy(
                video.videoPublicId,
                {
                    resource_type: "video",
                }
            );
        } catch (error) {
            cloudinaryErrors.push({
                type: "video",
                message: error.message,
            });
        }
    }

    if (video.thumbnailPublicId) {
        try {
            await cloudinary.uploader.destroy(
                video.thumbnailPublicId,
                {
                    resource_type: "image",
                }
            );
        } catch (error) {
            cloudinaryErrors.push({
                type: "thumbnail",
                message: error.message,
            });
        }
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                videoId: video._id,
                deleted: true,
                cloudinaryCleanup:
                    cloudinaryErrors.length === 0
                        ? "completed"
                        : "partial",
            },
            "Video deleted successfully"
        )
    );
});

//====================== getVideoReports ==========================//

const getVideoReports = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        search = "",
        status,
        reason,
    } = req.query;

    // =========================
    // Pagination Validation
    // =========================

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
        throw new ApiError(
            400,
            "Page must be a positive integer"
        );
    }

    if (
        !Number.isInteger(limitNumber) ||
        limitNumber < 1 ||
        limitNumber > 100
    ) {
        throw new ApiError(
            400,
            "Limit must be between 1 and 100"
        );
    }

    const skip = (pageNumber - 1) * limitNumber;

    // =========================
    // Allowed Statuses
    // =========================

    const allowedStatuses = [
        "pending",
        "reviewed",
        "resolved",
        "rejected",
    ];

    // =========================
    // Allowed Reasons
    // =========================

    const allowedReasons = [
        "spam",
        "misleading",
        "violence",
        "hate",
        "sexual_content",
        "harassment",
        "copyright",
        "illegal_content",
        "other",
    ];

    // =========================
    // Filter
    // =========================

    const filter = {};

    // Status filter
    if (status !== undefined) {
        if (!allowedStatuses.includes(status)) {
            throw new ApiError(
                400,
                "Invalid report status"
            );
        }

        filter.status = status;
    }

    // Reason filter
    if (reason !== undefined) {
        if (!allowedReasons.includes(reason)) {
            throw new ApiError(
                400,
                "Invalid report reason"
            );
        }

        filter.reason = reason;
    }

    // =========================
    // Base Pipeline
    // =========================

    const basePipeline = [
        // Match reports
        {
            $match: filter,
        },

        // =========================
        // Reporter
        // =========================

        {
            $lookup: {
                from: "users",
                localField: "reporter",
                foreignField: "_id",
                as: "reporter",
            },
        },

        {
            $unwind: {
                path: "$reporter",
                preserveNullAndEmptyArrays: true,
            },
        },

        // =========================
        // Reported Video
        // =========================

        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "video",
            },
        },

        {
            $unwind: {
                path: "$video",
                preserveNullAndEmptyArrays: true,
            },
        },

        // =========================
        // Video Owner
        // =========================

        {
            $lookup: {
                from: "users",
                localField: "video.owner",
                foreignField: "_id",
                as: "videoOwner",
            },
        },

        {
            $unwind: {
                path: "$videoOwner",
                preserveNullAndEmptyArrays: true,
            },
        },

        // =========================
        // Reviewed By Admin
        // =========================

        {
            $lookup: {
                from: "users",
                localField: "reviewedBy",
                foreignField: "_id",
                as: "reviewedBy",
            },
        },

        {
            $unwind: {
                path: "$reviewedBy",
                preserveNullAndEmptyArrays: true,
            },
        },
    ];

    // =========================
    // Search
    // =========================

    if (search.trim()) {
        const searchRegex = {
            $regex: search.trim(),
            $options: "i",
        };

        basePipeline.push({
            $match: {
                $or: [
                    // Reporter
                    {
                        "reporter.username": searchRegex,
                    },
                    {
                        "reporter.fullName": searchRegex,
                    },
                    {
                        "reporter.email": searchRegex,
                    },

                    // Video
                    {
                        "video.title": searchRegex,
                    },

                    // Video Owner
                    {
                        "videoOwner.username": searchRegex,
                    },
                    {
                        "videoOwner.fullName": searchRegex,
                    },
                    {
                        "videoOwner.email": searchRegex,
                    },

                    // Report description
                    {
                        description: searchRegex,
                    },
                ],
            },
        });
    }

    // =========================
    // Count Pipeline
    // =========================

    const countPipeline = [
        ...basePipeline,

        {
            $count: "totalReports",
        },
    ];

    // =========================
    // Data Pipeline
    // =========================

    const dataPipeline = [
        ...basePipeline,

        // Latest reports first
        {
            $sort: {
                createdAt: -1,
            },
        },

        // Pagination
        {
            $skip: skip,
        },

        {
            $limit: limitNumber,
        },

        // =========================
        // Project Response
        // =========================

        {
            $project: {
                _id: 1,

                // =========================
                // Reporter
                // =========================

                reporter: {
                    _id: "$reporter._id",
                    username: "$reporter.username",
                    fullName: "$reporter.fullName",
                    email: "$reporter.email",
                    avatar: "$reporter.avatar",
                    isActive: "$reporter.isActive",
                },

                // =========================
                // Video
                // =========================

                video: {
                    _id: "$video._id",
                    title: "$video.title",
                    description: "$video.description",
                    thumbnail: "$video.thumbnail",
                    videoFile: "$video.videoFile",
                    duration: "$video.duration",
                    views: "$video.views",
                    isPublished: "$video.isPublished",
                    createdAt: "$video.createdAt",

                    // =========================
                    // Video Owner
                    // =========================

                    owner: {
                        _id: "$videoOwner._id",
                        username: "$videoOwner.username",
                        fullName: "$videoOwner.fullName",
                        email: "$videoOwner.email",
                        avatar: "$videoOwner.avatar",
                        isActive: "$videoOwner.isActive",
                    },
                },

                // =========================
                // Report Details
                // =========================

                reason: 1,
                description: 1,
                status: 1,

                // =========================
                // Reviewed By
                // =========================

                reviewedBy: {
                    _id: "$reviewedBy._id",
                    username: "$reviewedBy.username",
                    fullName: "$reviewedBy.fullName",
                },

                reviewedAt: 1,
                createdAt: 1,
                updatedAt: 1,
            },
        },
    ];

    // =========================
    // Execute Queries
    // =========================

    const [reports, countResult] = await Promise.all([
        Report.aggregate(dataPipeline),
        Report.aggregate(countPipeline),
    ]);

    // =========================
    // Pagination Result
    // =========================

    const totalReports =
        countResult[0]?.totalReports || 0;

    const totalPages =
        Math.ceil(totalReports / limitNumber);

    // =========================
    // Response
    // =========================

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                reports,

                pagination: {
                    currentPage: pageNumber,
                    limit: limitNumber,
                    totalReports,
                    totalPages,

                    hasNextPage:
                        pageNumber < totalPages,

                    hasPreviousPage:
                        pageNumber > 1,
                },
            },
            "Video reports fetched successfully"
        )
    );
});

//====================== getVideoReportById ==========================//

const getVideoReportById = asyncHandler(async (req, res) => {
    const { reportId } = req.params;

    if (!reportId || !mongoose.isValidObjectId(reportId)) {
        throw new ApiError(400, "Valid report ID is required");
    }

    const reports = await Report.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(reportId),
            },
        },

        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "video",
            },
        },

        {
            $unwind: {
                path: "$video",
                preserveNullAndEmptyArrays: true,
            },
        },

        {
            $lookup: {
                from: "users",
                localField: "video.owner",
                foreignField: "_id",
                as: "videoOwner",
            },
        },

        {
            $unwind: {
                path: "$videoOwner",
                preserveNullAndEmptyArrays: true,
            },
        },

        {
            $project: {
                _id: 1,
                reporter: 1,

                video: {
                    _id: "$video._id",
                    thumbnail: "$video.thumbnail",
                    title: "$video.title",

                    owner: {
                        _id: "$videoOwner._id",
                        username: "$videoOwner.username",
                        fullName: "$videoOwner.fullName",
                        avatar: "$videoOwner.avatar",
                    },
                },

                reason: 1,
                description: 1,
                status: 1,
                reviewedBy: 1,
                reviewedAt: 1,
                createdAt: 1,
                updatedAt: 1,
            },
        },
    ]);

    if (!reports.length) {
        throw new ApiError(404, "Video report not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            reports[0],
            "Video report fetched successfully"
        )
    );
});

//====================== updateVideoReportStatus ==========================//

const updateVideoReportStatus = asyncHandler(async (req, res) => {
    const { reportId } = req.params;
    const { status } = req.body;

    if (!reportId || !mongoose.isValidObjectId(reportId)) {
        throw new ApiError(400, "Valid report ID is required");
    }

    const allowedStatuses = [
        "pending",
        "reviewed",
        "resolved",
        "rejected",
    ];

    if (!status || !allowedStatuses.includes(status)) {
        throw new ApiError(
            400,
            `Status must be one of: ${allowedStatuses.join(", ")}`
        );
    }

    const report = await Report.findOneAndUpdate(
        {
            _id: reportId,
        },
        {
            $set: {
                status,
                reviewedBy: req.user._id,
                reviewedAt: new Date(),
            },
        },
        {
            new: true,
            runValidators: true,
        }
    )
        .select(
            "_id reporter video reason description status reviewedBy reviewedAt createdAt updatedAt"
        )
        .populate({
            path: "video",
            select: "_id title thumbnail owner",
            populate: {
                path: "owner",
                select: "_id username fullName avatar",
            },
        })
        .lean();

    if (!report) {
        throw new ApiError(404, "Video report not found");
    }

    try {
        await Notification.create({
            recipient: report.reporter,
            actor: req.user._id,

            type: "video_report_update",

            title: "Video Report Status Updated",

            message: `Your video report has been ${status}.`,

            entityType: "report",
            entityId: report._id,

            data: {
                reportId: report._id,
                reportType: "video",
                videoId: report.video?._id || null,
                videoTitle: report.video?.title || null,
                reason: report.reason,
                description: report.description,
                status: report.status,
                reviewedAt: report.reviewedAt,
            },
        });
    } catch (error) {
        console.error(
            "Failed to create video report notification:",
            error.message
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            report,
            "Video report status updated successfully"
        )
    );
});

//====================== getUserReports ==========================//

const getUserReports = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        search = "",
        status,
        reason,
    } = req.query;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
        throw new ApiError(
            400,
            "Page must be a positive integer"
        );
    }

    if (
        !Number.isInteger(limitNumber) ||
        limitNumber < 1 ||
        limitNumber > 100
    ) {
        throw new ApiError(
            400,
            "Limit must be between 1 and 100"
        );
    }

    const skip = (pageNumber - 1) * limitNumber;

    const allowedStatuses = [
        "pending",
        "reviewed",
        "resolved",
        "rejected",
    ];

    const allowedReasons = [
        "spam",
        "harassment",
        "hate",
        "impersonation",
        "fake_account",
        "scam_or_fraud",
        "inappropriate_profile",
        "sexual_content",
        "violence",
        "threats",
        "misleading",
        "copyright",
        "illegal_activity",
        "other",
    ];

    const filter = {
        reportType: "user",
    };

    if (status !== undefined) {
        if (!allowedStatuses.includes(status)) {
            throw new ApiError(
                400,
                "Invalid report status"
            );
        }

        filter.status = status;
    }

    if (reason !== undefined) {
        if (!allowedReasons.includes(reason)) {
            throw new ApiError(
                400,
                "Invalid user report reason"
            );
        }

        filter.reason = reason;
    }

    const basePipeline = [
        {
            $match: filter,
        },

        {
            $lookup: {
                from: "users",
                localField: "reporter",
                foreignField: "_id",
                as: "reporter",
            },
        },

        {
            $unwind: {
                path: "$reporter",
                preserveNullAndEmptyArrays: true,
            },
        },

        {
            $lookup: {
                from: "users",
                localField: "reportedUser",
                foreignField: "_id",
                as: "reportedUser",
            },
        },

        {
            $unwind: {
                path: "$reportedUser",
                preserveNullAndEmptyArrays: true,
            },
        },

        {
            $lookup: {
                from: "users",
                localField: "reviewedBy",
                foreignField: "_id",
                as: "reviewedBy",
            },
        },

        {
            $unwind: {
                path: "$reviewedBy",
                preserveNullAndEmptyArrays: true,
            },
        },
    ];

    if (search.trim()) {
        const searchRegex = {
            $regex: search.trim(),
            $options: "i",
        };

        basePipeline.push({
            $match: {
                $or: [
                    {
                        "reporter.username": searchRegex,
                    },
                    {
                        "reporter.fullName": searchRegex,
                    },
                    {
                        "reporter.email": searchRegex,
                    },
                    {
                        "reportedUser.username": searchRegex,
                    },
                    {
                        "reportedUser.fullName": searchRegex,
                    },
                    {
                        "reportedUser.email": searchRegex,
                    },
                    {
                        description: searchRegex,
                    },
                ],
            },
        });
    }

    const countPipeline = [
        ...basePipeline,
        {
            $count: "totalReports",
        },
    ];

    const dataPipeline = [
        ...basePipeline,

        {
            $sort: {
                createdAt: -1,
            },
        },

        {
            $skip: skip,
        },

        {
            $limit: limitNumber,
        },

        {
            $project: {
                _id: 1,
                reportType: 1,

                reporter: {
                    _id: "$reporter._id",
                    username: "$reporter.username",
                    fullName: "$reporter.fullName",
                    email: "$reporter.email",
                    avatar: "$reporter.avatar",
                    isActive: "$reporter.isActive",
                },

                reportedUser: {
                    _id: "$reportedUser._id",
                    username: "$reportedUser.username",
                    fullName: "$reportedUser.fullName",
                    email: "$reportedUser.email",
                    avatar: "$reportedUser.avatar",
                    isActive: "$reportedUser.isActive",
                },

                reason: 1,
                description: 1,
                status: 1,

                reviewedBy: {
                    _id: "$reviewedBy._id",
                    username: "$reviewedBy.username",
                    fullName: "$reviewedBy.fullName",
                },

                reviewedAt: 1,
                createdAt: 1,
                updatedAt: 1,
            },
        },
    ];

    const [reports, countResult] = await Promise.all([
        UserReport.aggregate(dataPipeline),
        UserReport.aggregate(countPipeline),
    ]);

    const totalReports =
        countResult[0]?.totalReports || 0;

    const totalPages =
        Math.ceil(totalReports / limitNumber);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                reports,

                pagination: {
                    currentPage: pageNumber,
                    limit: limitNumber,
                    totalReports,
                    totalPages,
                    hasNextPage:
                        pageNumber < totalPages,
                    hasPreviousPage:
                        pageNumber > 1,
                },
            },
            "User reports fetched successfully"
        )
    );
});

//====================== getUserReportById ==========================//

const getUserReportById = asyncHandler(async (req, res) => {
    const { reportId } = req.params;

    if (!reportId || !mongoose.isValidObjectId(reportId)) {
        throw new ApiError(400, "Valid report ID is required");
    }

    const report = await UserReport.findOne({
        _id: reportId,
        reportType: "user",
    })
        .select(
            "_id reporter reportType reportedUser reason description status reviewedBy reviewedAt createdAt updatedAt"
        )
        .populate({
            path: "reporter",
            select: "_id username fullName avatar",
        })
        .populate({
            path: "reportedUser",
            select: "_id username fullName avatar isActive",
        })
        .populate({
            path: "reviewedBy",
            select: "_id username fullName avatar",
        })
        .lean();

    if (!report) {
        throw new ApiError(404, "User report not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                reportId: report._id,
                reportType: report.reportType,
                reporter: report.reporter || null,
                reportedUser: report.reportedUser || null,
                reason: report.reason,
                description: report.description,
                status: report.status,
                reviewedBy: report.reviewedBy || null,
                reviewedAt: report.reviewedAt || null,
                createdAt: report.createdAt,
                updatedAt: report.updatedAt,
            },
            "User report fetched successfully"
        )
    );
});

//====================== updateUserReportStatus ==========================//

const updateUserReportStatus = asyncHandler(async (req, res) => {
    const { reportId } = req.params;
    const { status } = req.body;

    if (!reportId || !mongoose.isValidObjectId(reportId)) {
        throw new ApiError(400, "Valid report ID is required");
    }

    const allowedStatuses = [
        "pending",
        "reviewed",
        "resolved",
        "rejected",
    ];

    if (!status || !allowedStatuses.includes(status)) {
        throw new ApiError(
            400,
            `Status must be one of: ${allowedStatuses.join(", ")}`
        );
    }

    const report = await UserReport.findOneAndUpdate(
        {
            _id: reportId,
            reportType: "user",
        },
        {
            $set: {
                status,
                reviewedBy: req.user._id,
                reviewedAt: new Date(),
            },
        },
        {
            new: true,
            runValidators: true,
        }
    )
        .select(
            "_id reporter reportType reportedUser reason description status reviewedBy reviewedAt createdAt updatedAt"
        )
        .populate({
            path: "reporter",
            select: "_id username fullName avatar",
        })
        .populate({
            path: "reportedUser",
            select: "_id username fullName avatar",
        })
        .populate({
            path: "reviewedBy",
            select: "_id username fullName avatar",
        })
        .lean();

    if (!report) {
        throw new ApiError(404, "User report not found");
    }

    try {
        await Notification.create({
            recipient: report.reporter._id,
            actor: req.user._id,

            type: "report_update",

            title: "Report Status Updated",

            message: `Your report has been ${status}.`,

            entityType: "report",
            entityId: report._id,

            data: {
                reportId: report._id,
                reportType: report.reportType,
                reason: report.reason,
                description: report.description,
                status: report.status,
                reviewedAt: report.reviewedAt,
            },
        });
    } catch (error) {
        console.error(
            "Failed to create report notification:",
            error.message
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            report,
            "User report status updated successfully"
        )
    );
});


//====================== getCopyrightClaims ==========================//

const getCopyrightClaims = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        search = "",
        status,
    } = req.query;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
        throw new ApiError(
            400,
            "Page must be a positive integer"
        );
    }

    if (
        !Number.isInteger(limitNumber) ||
        limitNumber < 1 ||
        limitNumber > 100
    ) {
        throw new ApiError(
            400,
            "Limit must be between 1 and 100"
        );
    }

    const skip = (pageNumber - 1) * limitNumber;

    const allowedStatuses = [
        "pending",
        "approved",
        "rejected",
    ];

    const filter = {};

    if (status !== undefined) {
        if (!allowedStatuses.includes(status)) {
            throw new ApiError(
                400,
                "Invalid copyright claim status"
            );
        }

        filter.status = status;
    }

    const basePipeline = [
        {
            $match: filter,
        },

        {
            $lookup: {
                from: "users",
                localField: "claimant",
                foreignField: "_id",
                as: "claimant",
            },
        },

        {
            $unwind: {
                path: "$claimant",
                preserveNullAndEmptyArrays: true,
            },
        },

        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "video",
            },
        },

        {
            $unwind: {
                path: "$video",
                preserveNullAndEmptyArrays: true,
            },
        },

        {
            $lookup: {
                from: "users",
                localField: "video.owner",
                foreignField: "_id",
                as: "videoOwner",
            },
        },

        {
            $unwind: {
                path: "$videoOwner",
                preserveNullAndEmptyArrays: true,
            },
        },

        {
            $lookup: {
                from: "users",
                localField: "reviewedBy",
                foreignField: "_id",
                as: "reviewedBy",
            },
        },

        {
            $unwind: {
                path: "$reviewedBy",
                preserveNullAndEmptyArrays: true,
            },
        },
    ];

    if (search.trim()) {
        const searchRegex = {
            $regex: search.trim(),
            $options: "i",
        };

        basePipeline.push({
            $match: {
                $or: [
                    {
                        "claimant.username": searchRegex,
                    },
                    {
                        "claimant.fullName": searchRegex,
                    },
                    {
                        "claimant.email": searchRegex,
                    },
                    {
                        "video.title": searchRegex,
                    },
                    {
                        "videoOwner.username": searchRegex,
                    },
                    {
                        "videoOwner.fullName": searchRegex,
                    },
                    {
                        "videoOwner.email": searchRegex,
                    },
                    {
                        reason: searchRegex,
                    },
                    {
                        description: searchRegex,
                    },
                ],
            },
        });
    }

    const countPipeline = [
        ...basePipeline,

        {
            $count: "totalClaims",
        },
    ];

    const dataPipeline = [
        ...basePipeline,

        {
            $sort: {
                createdAt: -1,
            },
        },

        {
            $skip: skip,
        },

        {
            $limit: limitNumber,
        },

        {
            $project: {
                _id: 1,

                claimant: {
                    _id: "$claimant._id",
                    username: "$claimant.username",
                    fullName: "$claimant.fullName",
                    email: "$claimant.email",
                    avatar: "$claimant.avatar",
                    isActive: "$claimant.isActive",
                },

                video: {
                    _id: "$video._id",
                    title: "$video.title",
                    description: "$video.description",
                    thumbnail: "$video.thumbnail",
                    videoFile: "$video.videoFile",
                    duration: "$video.duration",
                    views: "$video.views",
                    isPublished: "$video.isPublished",
                    createdAt: "$video.createdAt",

                    owner: {
                        _id: "$videoOwner._id",
                        username: "$videoOwner.username",
                        fullName: "$videoOwner.fullName",
                        email: "$videoOwner.email",
                        avatar: "$videoOwner.avatar",
                        isActive: "$videoOwner.isActive",
                    },
                },

                reason: 1,
                description: 1,
                status: 1,

                reviewedBy: {
                    _id: "$reviewedBy._id",
                    username: "$reviewedBy.username",
                    fullName: "$reviewedBy.fullName",
                },

                reviewedAt: 1,
                createdAt: 1,
                updatedAt: 1,
            },
        },
    ];

    const [claims, countResult] = await Promise.all([
        CopyrightClaim.aggregate(dataPipeline),
        CopyrightClaim.aggregate(countPipeline),
    ]);

    const totalClaims =
        countResult[0]?.totalClaims || 0;

    const totalPages =
        Math.ceil(totalClaims / limitNumber);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                claims,

                pagination: {
                    currentPage: pageNumber,
                    limit: limitNumber,
                    totalClaims,
                    totalPages,
                    hasNextPage:
                        pageNumber < totalPages,
                    hasPreviousPage:
                        pageNumber > 1,
                },
            },
            "Copyright claims fetched successfully"
        )
    );
});

//====================== getCopyrightClaimById ==========================//

const getCopyrightClaimById = asyncHandler(async (req, res) => {
    const { claimId } = req.params;

    if (!claimId || !mongoose.isValidObjectId(claimId)) {
        throw new ApiError(400, "Valid copyright claim ID is required");
    }

    const claim = await CopyrightClaim.findById(claimId)
        .select(
            "_id claimant video reason description status reviewedBy reviewedAt createdAt updatedAt"
        )
        .populate({
            path: "claimant",
            select: "_id username fullName email avatar isActive",
        })
        .populate({
            path: "video",
            select:
                "_id title description thumbnail duration views isPublished owner createdAt",
            populate: {
                path: "owner",
                select: "_id username fullName email avatar isActive",
            },
        })
        .populate({
            path: "reviewedBy",
            select: "_id username fullName email avatar",
        })
        .lean();

    if (!claim) {
        throw new ApiError(404, "Copyright claim not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            claim,
            "Copyright claim fetched successfully"
        )
    );
});

//====================== updateCopyrightClaimStatus ==========================//

const updateCopyrightClaimStatus = asyncHandler(async (req, res) => {
    const { claimId } = req.params;
    const { status } = req.body || {};

    if (!claimId || !mongoose.isValidObjectId(claimId)) {
        throw new ApiError(
            400,
            "Valid copyright claim ID is required"
        );
    }

    const allowedStatuses = [
        "pending",
        "approved",
        "rejected",
    ];

    if (
        typeof status !== "string" ||
        !allowedStatuses.includes(status)
    ) {
        throw new ApiError(
            400,
            `Status must be one of: ${allowedStatuses.join(", ")}`
        );
    }

    const claim = await CopyrightClaim.findByIdAndUpdate(
        claimId,
        {
            $set: {
                status,
                reviewedBy: req.user._id,
                reviewedAt: new Date(),
            },
        },
        {
            new: true,
            runValidators: true,
        }
    )
        .select(
            "_id claimant video reason description status reviewedBy reviewedAt createdAt updatedAt"
        )
        .populate({
            path: "claimant",
            select: "_id username fullName avatar isActive",
        })
        .populate({
            path: "video",
            select: "_id title thumbnail owner",
            populate: {
                path: "owner",
                select: "_id username fullName avatar",
            },
        })
        .populate({
            path: "reviewedBy",
            select: "_id username fullName avatar",
        })
        .lean();

    if (!claim) {
        throw new ApiError(
            404,
            "Copyright claim not found"
        );
    }

    try {
        const notificationMessages = {
            pending:
                "Your copyright claim has been moved back to pending review.",
            approved:
                "Your copyright claim has been approved.",
            rejected:
                "Your copyright claim has been rejected.",
        };

        await Notification.create({
            recipient: claim.claimant._id,
            actor: req.user._id,

            type: "system",

            title: "Copyright Claim Status Updated",

            message: notificationMessages[status],

            entityType: "report",
            entityId: claim._id,

            data: {
                claimId: claim._id,
                claimType: "copyright",
                videoId: claim.video?._id || null,
                videoTitle: claim.video?.title || null,
                reason: claim.reason,
                description: claim.description,
                status: claim.status,
                reviewedAt: claim.reviewedAt,
            },
        });
    } catch (error) {
        console.error(
            "Failed to create copyright claim notification:",
            error.message
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            claim,
            "Copyright claim status updated successfully"
        )
    );
});

//====================== getUserAnalytics ==========================//

const getUserAnalytics = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(400, "Valid user ID is required");
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const user = await User.findById(userObjectId)
        .select("_id username fullName email avatar isActive role createdAt")
        .lean();

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const [analyticsResult, subscriberCount, subscriptionCount] =
        await Promise.all([
            Video.aggregate([
                {
                    $match: {
                        owner: userObjectId,
                    },
                },

                {
                    $facet: {
                        overview: [
                            {
                                $group: {
                                    _id: null,

                                    totalVideos: {
                                        $sum: 1,
                                    },

                                    publishedVideos: {
                                        $sum: {
                                            $cond: [
                                                "$isPublished",
                                                1,
                                                0,
                                            ],
                                        },
                                    },

                                    unpublishedVideos: {
                                        $sum: {
                                            $cond: [
                                                "$isPublished",
                                                0,
                                                1,
                                            ],
                                        },
                                    },

                                    totalViews: {
                                        $sum: {
                                            $ifNull: [
                                                "$views",
                                                0,
                                            ],
                                        },
                                    },
                                },
                            },
                        ],

                        engagement: [
                            {
                                $lookup: {
                                    from: "likes",
                                    let: {
                                        videoId: "$_id",
                                    },
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $eq: [
                                                        "$video",
                                                        "$$videoId",
                                                    ],
                                                },
                                            },
                                        },
                                        {
                                            $count: "count",
                                        },
                                    ],
                                    as: "likes",
                                },
                            },

                            {
                                $lookup: {
                                    from: "comments",
                                    let: {
                                        videoId: "$_id",
                                    },
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $eq: [
                                                        "$video",
                                                        "$$videoId",
                                                    ],
                                                },
                                            },
                                        },
                                        {
                                            $count: "count",
                                        },
                                    ],
                                    as: "comments",
                                },
                            },

                            {
                                $lookup: {
                                    from: "shares",
                                    let: {
                                        videoId: "$_id",
                                    },
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $eq: [
                                                        "$video",
                                                        "$$videoId",
                                                    ],
                                                },
                                            },
                                        },
                                        {
                                            $count: "count",
                                        },
                                    ],
                                    as: "shares",
                                },
                            },

                            {
                                $project: {
                                    likes: {
                                        $ifNull: [
                                            {
                                                $arrayElemAt: [
                                                    "$likes.count",
                                                    0,
                                                ],
                                            },
                                            0,
                                        ],
                                    },

                                    comments: {
                                        $ifNull: [
                                            {
                                                $arrayElemAt: [
                                                    "$comments.count",
                                                    0,
                                                ],
                                            },
                                            0,
                                        ],
                                    },

                                    shares: {
                                        $ifNull: [
                                            {
                                                $arrayElemAt: [
                                                    "$shares.count",
                                                    0,
                                                ],
                                            },
                                            0,
                                        ],
                                    },
                                },
                            },

                            {
                                $group: {
                                    _id: null,

                                    totalLikes: {
                                        $sum: "$likes",
                                    },

                                    totalComments: {
                                        $sum: "$comments",
                                    },

                                    totalShares: {
                                        $sum: "$shares",
                                    },
                                },
                            },
                        ],

                        topVideos: [
                            {
                                $sort: {
                                    views: -1,
                                    createdAt: -1,
                                    _id: -1,
                                },
                            },

                            {
                                $limit: 10,
                            },

                            {
                                $project: {
                                    _id: 1,
                                    title: 1,
                                    thumbnail: 1,
                                    views: 1,
                                    isPublished: 1,
                                    createdAt: 1,
                                },
                            },
                        ],
                    },
                },
            ]),

            Subscribe.countDocuments({
                channel: userObjectId,
            }),

            Subscribe.countDocuments({
                subscriber: userObjectId,
            }),
        ]);

    const analytics = analyticsResult[0] || {};

    const overview = analytics.overview?.[0] || {
        totalVideos: 0,
        publishedVideos: 0,
        unpublishedVideos: 0,
        totalViews: 0,
    };

    const engagement = analytics.engagement?.[0] || {
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
    };

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                user,

                overview: {
                    totalVideos: overview.totalVideos,
                    publishedVideos: overview.publishedVideos,
                    unpublishedVideos:
                        overview.unpublishedVideos,
                    totalViews: overview.totalViews,

                    totalLikes: engagement.totalLikes,
                    totalComments:
                        engagement.totalComments,
                    totalShares:
                        engagement.totalShares,

                    subscribers: subscriberCount,
                    subscriptions: subscriptionCount,
                },

                topVideos: analytics.topVideos || [],
            },
            "User analytics fetched successfully"
        )
    );
});

//====================== getVideoAnalytics ==========================//

const getVideoAnalytics = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (
        !videoId ||
        !mongoose.Types.ObjectId.isValid(videoId)
    ) {
        throw new ApiError(
            400,
            "Valid video ID is required"
        );
    }

    const video = await Video.findById(videoId)
        .select(
            "_id owner title description thumbnail duration views isPublished createdAt updatedAt"
        )
        .populate({
            path: "owner",
            select: "_id username fullName email avatar isActive",
        })
        .lean();

    if (!video) {
        throw new ApiError(
            404,
            "Video not found"
        );
    }

    const [
        totalLikes,
        totalComments,
        totalShares,
    ] = await Promise.all([
        Like.countDocuments({
            video: video._id,
        }),

        Comment.countDocuments({
            video: video._id,
        }),

        Share.countDocuments({
            video: video._id,
        }),
    ]);

    const totalEngagement =
        totalLikes +
        totalComments +
        totalShares;

    const engagementRate =
        video.views > 0
            ? Number(
                  (
                      (totalEngagement / video.views) *
                      100
                  ).toFixed(2)
              )
            : 0;

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                video: {
                    _id: video._id,
                    title: video.title,
                    description: video.description,
                    thumbnail: video.thumbnail,
                    duration: video.duration,
                    views: video.views,
                    isPublished: video.isPublished,
                    createdAt: video.createdAt,
                    updatedAt: video.updatedAt,
                },

                owner: video.owner || null,

                analytics: {
                    views: video.views,
                    likes: totalLikes,
                    comments: totalComments,
                    shares: totalShares,
                    totalEngagement,
                    engagementRate,
                },
            },
            "Video analytics fetched successfully"
        )
    );
});

//====================== getViewAnalytics ==========================//

const getViewAnalytics = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
    } = req.query;

    const pageNumber = Math.max(
        Number.parseInt(page, 10) || 1,
        1
    );

    const limitNumber = Math.min(
        Math.max(
            Number.parseInt(limit, 10) || 20,
            1
        ),
        100
    );

    const skip = (pageNumber - 1) * limitNumber;

    const [analytics, topVideos, countResult] =
        await Promise.all([
            Video.aggregate([
                {
                    $group: {
                        _id: null,

                        totalViews: {
                            $sum: {
                                $ifNull: ["$views", 0],
                            },
                        },

                        totalVideos: {
                            $sum: 1,
                        },

                        publishedVideos: {
                            $sum: {
                                $cond: [
                                    "$isPublished",
                                    1,
                                    0,
                                ],
                            },
                        },

                        unpublishedVideos: {
                            $sum: {
                                $cond: [
                                    "$isPublished",
                                    0,
                                    1,
                                ],
                            },
                        },

                        averageViewsPerVideo: {
                            $avg: {
                                $ifNull: ["$views", 0],
                            },
                        },

                        highestViews: {
                            $max: {
                                $ifNull: ["$views", 0],
                            },
                        },

                        lowestViews: {
                            $min: {
                                $ifNull: ["$views", 0],
                            },
                        },
                    },
                },

                {
                    $project: {
                        _id: 0,
                        totalViews: 1,
                        totalVideos: 1,
                        publishedVideos: 1,
                        unpublishedVideos: 1,

                        averageViewsPerVideo: {
                            $round: [
                                "$averageViewsPerVideo",
                                2,
                            ],
                        },

                        highestViews: 1,
                        lowestViews: 1,
                    },
                },
            ]),

            Video.aggregate([
                {
                    $sort: {
                        views: -1,
                        createdAt: -1,
                        _id: -1,
                    },
                },

                {
                    $skip: skip,
                },

                {
                    $limit: limitNumber,
                },

                {
                    $lookup: {
                        from: "users",
                        localField: "owner",
                        foreignField: "_id",
                        as: "owner",
                    },
                },

                {
                    $unwind: {
                        path: "$owner",
                        preserveNullAndEmptyArrays: true,
                    },
                },

                {
                    $project: {
                        _id: 1,
                        title: 1,
                        thumbnail: 1,
                        views: 1,
                        isPublished: 1,
                        createdAt: 1,

                        owner: {
                            _id: "$owner._id",
                            username: "$owner.username",
                            fullName: "$owner.fullName",
                            avatar: "$owner.avatar",
                        },
                    },
                },
            ]),

            Video.aggregate([
                {
                    $count: "totalVideos",
                },
            ]),
        ]);

    const overview = analytics[0] || {
        totalViews: 0,
        totalVideos: 0,
        publishedVideos: 0,
        unpublishedVideos: 0,
        averageViewsPerVideo: 0,
        highestViews: 0,
        lowestViews: 0,
    };

    const totalVideos =
        countResult[0]?.totalVideos || 0;

    const totalPages = Math.ceil(
        totalVideos / limitNumber
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                overview,

                videos: topVideos,

                pagination: {
                    currentPage: pageNumber,
                    limit: limitNumber,
                    totalVideos,
                    totalPages,

                    hasNextPage:
                        pageNumber < totalPages,

                    hasPreviousPage:
                        pageNumber > 1,
                },
            },
            "View analytics fetched successfully"
        )
    );
});

//====================== getReportAnalytics ==========================//

const getReportAnalytics = asyncHandler(async (req, res) => {
    const [
        videoReportStats,
        userReportStats,
        videoReportReasons,
        userReportReasons,
        videoReportTrend,
        userReportTrend,
    ] = await Promise.all([
        // =========================
        // Video report statistics
        // =========================
        Report.aggregate([
            {
                $facet: {
                    overview: [
                        {
                            $group: {
                                _id: null,

                                total: {
                                    $sum: 1,
                                },

                                pending: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $eq: [
                                                    "$status",
                                                    "pending",
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },

                                reviewed: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $eq: [
                                                    "$status",
                                                    "reviewed",
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },

                                resolved: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $eq: [
                                                    "$status",
                                                    "resolved",
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },

                                rejected: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $eq: [
                                                    "$status",
                                                    "rejected",
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },

                                averageResolutionTime: {
                                    $avg: {
                                        $cond: [
                                            {
                                                $and: [
                                                    {
                                                        $ne: [
                                                            "$reviewedAt",
                                                            null,
                                                        ],
                                                    },
                                                    {
                                                        $ne: [
                                                            "$createdAt",
                                                            null,
                                                        ],
                                                    },
                                                ],
                                            },
                                            {
                                                $divide: [
                                                    {
                                                        $subtract: [
                                                            "$reviewedAt",
                                                            "$createdAt",
                                                        ],
                                                    },
                                                    3600000,
                                                ],
                                            },
                                            null,
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                },
            },
        ]),

        // =========================
        // User + Comment reports
        // =========================
        UserReport.aggregate([
            {
                $facet: {
                    overview: [
                        {
                            $group: {
                                _id: null,

                                total: {
                                    $sum: 1,
                                },

                                userReports: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $eq: [
                                                    "$reportType",
                                                    "user",
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },

                                commentReports: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $eq: [
                                                    "$reportType",
                                                    "comment",
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },

                                pending: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $eq: [
                                                    "$status",
                                                    "pending",
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },

                                reviewed: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $eq: [
                                                    "$status",
                                                    "reviewed",
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },

                                resolved: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $eq: [
                                                    "$status",
                                                    "resolved",
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },

                                rejected: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $eq: [
                                                    "$status",
                                                    "rejected",
                                                ],
                                            },
                                            1,
                                            0,
                                        ],
                                    },
                                },

                                averageResolutionTime: {
                                    $avg: {
                                        $cond: [
                                            {
                                                $and: [
                                                    {
                                                        $ne: [
                                                            "$reviewedAt",
                                                            null,
                                                        ],
                                                    },
                                                    {
                                                        $ne: [
                                                            "$createdAt",
                                                            null,
                                                        ],
                                                    },
                                                ],
                                            },
                                            {
                                                $divide: [
                                                    {
                                                        $subtract: [
                                                            "$reviewedAt",
                                                            "$createdAt",
                                                        ],
                                                    },
                                                    3600000,
                                                ],
                                            },
                                            null,
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                },
            },
        ]),

        // =========================
        // Video report reasons
        // =========================
        Report.aggregate([
            {
                $group: {
                    _id: "$reason",
                    count: {
                        $sum: 1,
                    },
                },
            },
            {
                $sort: {
                    count: -1,
                    _id: 1,
                },
            },
        ]),

        // =========================
        // User/Comment reasons
        // =========================
        UserReport.aggregate([
            {
                $group: {
                    _id: "$reason",
                    count: {
                        $sum: 1,
                    },
                },
            },
            {
                $sort: {
                    count: -1,
                    _id: 1,
                },
            },
        ]),

        // =========================
        // Last 30 days - video reports
        // =========================
        Report.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(
                            Date.now() -
                                30 * 24 * 60 * 60 * 1000
                        ),
                    },
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$createdAt",
                        },
                    },
                    count: {
                        $sum: 1,
                    },
                },
            },
            {
                $sort: {
                    _id: 1,
                },
            },
        ]),

        // =========================
        // Last 30 days - user/comment
        // =========================
        UserReport.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(
                            Date.now() -
                                30 * 24 * 60 * 60 * 1000
                        ),
                    },
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$createdAt",
                        },
                    },
                    count: {
                        $sum: 1,
                    },
                },
            },
            {
                $sort: {
                    _id: 1,
                },
            },
        ]),
    ]);

    const videoOverview =
        videoReportStats[0]?.overview?.[0] || {
            total: 0,
            pending: 0,
            reviewed: 0,
            resolved: 0,
            rejected: 0,
            averageResolutionTime: 0,
        };

    const userOverview =
        userReportStats[0]?.overview?.[0] || {
            total: 0,
            userReports: 0,
            commentReports: 0,
            pending: 0,
            reviewed: 0,
            resolved: 0,
            rejected: 0,
            averageResolutionTime: 0,
        };

    // =========================
    // Combine daily trend
    // =========================

    const trendMap = new Map();

    for (const item of videoReportTrend) {
        trendMap.set(
            item._id,
            (trendMap.get(item._id) || 0) +
                item.count
        );
    }

    for (const item of userReportTrend) {
        trendMap.set(
            item._id,
            (trendMap.get(item._id) || 0) +
                item.count
        );
    }

    const dailyTrend = Array.from(
        trendMap.entries()
    )
        .sort(([dateA], [dateB]) =>
            dateA.localeCompare(dateB)
        )
        .map(([date, count]) => ({
            date,
            count,
        }));

    // =========================
    // Combine reasons
    // =========================

    const reasonMap = new Map();

    for (const item of videoReportReasons) {
        reasonMap.set(
            item._id,
            (reasonMap.get(item._id) || 0) +
                item.count
        );
    }

    for (const item of userReportReasons) {
        reasonMap.set(
            item._id,
            (reasonMap.get(item._id) || 0) +
                item.count
        );
    }

    const topReasons = Array.from(
        reasonMap.entries()
    )
        .sort(
            (a, b) =>
                b[1] - a[1] ||
                String(a[0]).localeCompare(
                    String(b[0])
                )
        )
        .map(([reason, count]) => ({
            reason,
            count,
        }));

    // =========================
    // Combined totals
    // =========================

    const totalReports =
        videoOverview.total +
        userOverview.total;

    const pendingReports =
        videoOverview.pending +
        userOverview.pending;

    const reviewedReports =
        videoOverview.reviewed +
        userOverview.reviewed;

    const resolvedReports =
        videoOverview.resolved +
        userOverview.resolved;

    const rejectedReports =
        videoOverview.rejected +
        userOverview.rejected;

    const resolvedRate =
        totalReports > 0
            ? Number(
                  (
                      (resolvedReports /
                          totalReports) *
                      100
                  ).toFixed(2)
              )
            : 0;

    const averageResolutionTime =
        videoOverview.averageResolutionTime ||
        userOverview.averageResolutionTime ||
        0;

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                overview: {
                    totalReports,
                    pendingReports,
                    reviewedReports,
                    resolvedReports,
                    rejectedReports,
                    resolvedRate,
                    averageResolutionTimeHours:
                        Number(
                            averageResolutionTime.toFixed(
                                2
                            )
                        ),
                },

                types: {
                    videoReports: videoOverview.total,
                    userReports:
                        userOverview.userReports,
                    commentReports:
                        userOverview.commentReports,
                },

                reasons: topReasons,

                dailyTrend,
            },
            "Report analytics fetched successfully"
        )
    );
});

//====================== getCopyrightAnalytics ==========================//

const getCopyrightAnalytics = asyncHandler(async (req, res) => {
    const [
        overviewResult,
        reasonResult,
        topVideosResult,
        topClaimantsResult,
        trendResult,
    ] = await Promise.all([
        // =========================
        // Overview
        // =========================
        CopyrightClaim.aggregate([
            {
                $group: {
                    _id: null,

                    totalClaims: {
                        $sum: 1,
                    },

                    pendingClaims: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$status",
                                        "pending",
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },

                    approvedClaims: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$status",
                                        "approved",
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },

                    rejectedClaims: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$status",
                                        "rejected",
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },

                    averageReviewTimeHours: {
                        $avg: {
                            $cond: [
                                {
                                    $and: [
                                        {
                                            $ne: [
                                                "$reviewedAt",
                                                null,
                                            ],
                                        },
                                        {
                                            $ne: [
                                                "$createdAt",
                                                null,
                                            ],
                                        },
                                    ],
                                },
                                {
                                    $divide: [
                                        {
                                            $subtract: [
                                                "$reviewedAt",
                                                "$createdAt",
                                            ],
                                        },
                                        3600000,
                                    ],
                                },
                                null,
                            ],
                        },
                    },
                },
            },

            {
                $project: {
                    _id: 0,
                    totalClaims: 1,
                    pendingClaims: 1,
                    approvedClaims: 1,
                    rejectedClaims: 1,

                    averageReviewTimeHours: {
                        $round: [
                            {
                                $ifNull: [
                                    "$averageReviewTimeHours",
                                    0,
                                ],
                            },
                            2,
                        ],
                    },
                },
            },
        ]),

        // =========================
        // Top reasons
        // =========================
        CopyrightClaim.aggregate([
            {
                $group: {
                    _id: "$reason",

                    count: {
                        $sum: 1,
                    },
                },
            },

            {
                $sort: {
                    count: -1,
                    _id: 1,
                },
            },

            {
                $limit: 10,
            },

            {
                $project: {
                    _id: 0,
                    reason: "$_id",
                    count: 1,
                },
            },
        ]),

        // =========================
        // Most claimed videos
        // =========================
        CopyrightClaim.aggregate([
            {
                $group: {
                    _id: "$video",

                    claimCount: {
                        $sum: 1,
                    },

                    pendingClaims: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$status",
                                        "pending",
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },

                    approvedClaims: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$status",
                                        "approved",
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },

                    rejectedClaims: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$status",
                                        "rejected",
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },

            {
                $sort: {
                    claimCount: -1,
                    _id: 1,
                },
            },

            {
                $limit: 10,
            },

            {
                $lookup: {
                    from: "videos",
                    localField: "_id",
                    foreignField: "_id",
                    as: "video",
                },
            },

            {
                $unwind: {
                    path: "$video",
                    preserveNullAndEmptyArrays: true,
                },
            },

            {
                $lookup: {
                    from: "users",
                    localField: "video.owner",
                    foreignField: "_id",
                    as: "owner",
                },
            },

            {
                $unwind: {
                    path: "$owner",
                    preserveNullAndEmptyArrays: true,
                },
            },

            {
                $project: {
                    _id: 0,

                    video: {
                        _id: "$video._id",
                        title: "$video.title",
                        thumbnail: "$video.thumbnail",
                    },

                    owner: {
                        _id: "$owner._id",
                        username: "$owner.username",
                        fullName: "$owner.fullName",
                        avatar: "$owner.avatar",
                    },

                    claimCount: 1,
                    pendingClaims: 1,
                    approvedClaims: 1,
                    rejectedClaims: 1,
                },
            },
        ]),

        // =========================
        // Top claimants
        // =========================
        CopyrightClaim.aggregate([
            {
                $group: {
                    _id: "$claimant",

                    claimCount: {
                        $sum: 1,
                    },
                },
            },

            {
                $sort: {
                    claimCount: -1,
                    _id: 1,
                },
            },

            {
                $limit: 10,
            },

            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "claimant",
                },
            },

            {
                $unwind: {
                    path: "$claimant",
                    preserveNullAndEmptyArrays: true,
                },
            },

            {
                $project: {
                    _id: 0,

                    claimant: {
                        _id: "$claimant._id",
                        username: "$claimant.username",
                        fullName: "$claimant.fullName",
                        avatar: "$claimant.avatar",
                    },

                    claimCount: 1,
                },
            },
        ]),

        // =========================
        // Last 30 days trend
        // =========================
        CopyrightClaim.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(
                            Date.now() -
                                30 *
                                    24 *
                                    60 *
                                    60 *
                                    1000
                        ),
                    },
                },
            },

            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$createdAt",
                        },
                    },

                    claims: {
                        $sum: 1,
                    },
                },
            },

            {
                $sort: {
                    _id: 1,
                },
            },

            {
                $project: {
                    _id: 0,
                    date: "$_id",
                    claims: 1,
                },
            },
        ]),
    ]);

    const overview = overviewResult[0] || {
        totalClaims: 0,
        pendingClaims: 0,
        approvedClaims: 0,
        rejectedClaims: 0,
        averageReviewTimeHours: 0,
    };

    const totalClaims = overview.totalClaims;

    const approvalRate =
        totalClaims > 0
            ? Number(
                  (
                      (overview.approvedClaims /
                          totalClaims) *
                      100
                  ).toFixed(2)
              )
            : 0;

    const rejectionRate =
        totalClaims > 0
            ? Number(
                  (
                      (overview.rejectedClaims /
                          totalClaims) *
                      100
                  ).toFixed(2)
              )
            : 0;

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                overview: {
                    ...overview,
                    approvalRate,
                    rejectionRate,
                },

                topReasons: reasonResult,

                topClaimedVideos: topVideosResult,

                topClaimants: topClaimantsResult,

                dailyTrend: trendResult,
            },
            "Copyright analytics fetched successfully"
        )
    );
});

//======================= getAuditLogs =================================//

const getAuditLogs = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        action,
        resourceType,
        actor,
        startDate,
        endDate,
    } = req.query;

    const currentPage = Math.max(parseInt(page, 10) || 1, 1);
    const perPage = Math.min(
        Math.max(parseInt(limit, 10) || 20, 1),
        100
    );

    const filter = {};

    if (action?.trim()) {
        filter.action = action.trim();
    }

    if (resourceType?.trim()) {
        filter.resourceType = resourceType.trim();
    }

    if (actor) {
        if (!mongoose.isValidObjectId(actor)) {
            throw new ApiError(400, "Invalid actor ID");
        }

        filter.actor = actor;
    }

    if (startDate || endDate) {
        filter.createdAt = {};

        if (startDate) {
            const start = new Date(startDate);

            if (Number.isNaN(start.getTime())) {
                throw new ApiError(400, "Invalid start date");
            }

            filter.createdAt.$gte = start;
        }

        if (endDate) {
            const end = new Date(endDate);

            if (Number.isNaN(end.getTime())) {
                throw new ApiError(400, "Invalid end date");
            }

            end.setHours(23, 59, 59, 999);
            filter.createdAt.$lte = end;
        }
    }

    const skip = (currentPage - 1) * perPage;

    const [logs, totalLogs] = await Promise.all([
        AuditLog.find(filter)
            .sort({
                createdAt: -1,
                _id: -1,
            })
            .skip(skip)
            .limit(perPage)
            .populate({
                path: "actor",
                select: "_id username fullName email avatar",
            })
            .populate({
                path: "resourceId",
                select: "_id",
            })
            .lean(),

        AuditLog.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalLogs / perPage);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                logs,
                pagination: {
                    currentPage,
                    perPage,
                    totalLogs,
                    totalPages,
                    hasNextPage: currentPage < totalPages,
                    hasPreviousPage: currentPage > 1,
                },
            },
            "Audit logs fetched successfully"
        )
    );
});

export {
    getAdminOverview,
    getAllUsers,
    getUserById,
    updateUserStatus,
    getAllVideos,
    getVideoById,
    getUserVideos,
    updateVideoStatus,
    deleteVideo,
    getVideoReports,
    getVideoReportById,
    updateVideoReportStatus,
    getUserReports,
    getUserReportById,
    updateUserReportStatus,
    getCopyrightClaims,
    getCopyrightClaimById,
    updateCopyrightClaimStatus,
    getUserAnalytics,
    getVideoAnalytics,
    getViewAnalytics,
    getReportAnalytics,
    getCopyrightAnalytics,
    getAuditLogs
};