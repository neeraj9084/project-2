import fs from "fs";
import path from "path";
import mongoose from "mongoose";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Video } from "../models/video.model.js";
import { deleteFromCloudinary,uploadOnCloudinary } from "../utils/cloudinary.js";
import { compressVideo } from "../utils/ffmpeg.js";
import { BlockedUser } from "../models/blockedUser.model.js";
import { Subscribe } from "../models/subscribe.model.js";
import { Notification } from "../models/notification.model.js";

const escapeRegex = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isValidObjectId = (id) =>
    mongoose.Types.ObjectId.isValid(id);



//================= publishAVideo ============================//

const publishAVideo = asyncHandler(async (req, res) => {

    let videoFilePath = null;
    let compressedVideoPath = null;
    let thumbnailPath = null;

    let uploadedVideoPublicId = null;
    let uploadedThumbnailPublicId = null;

    try {

        const { title, description } = req.body || {};

        const videoFile = req.files?.videoFile?.[0];
        const thumbnail = req.files?.thumbnail?.[0];

        const userId = req.user?._id;

        if (!userId) {
            throw new ApiError(
                401,
                "Unauthorized request"
            );
        }

        if (typeof title !== "string") {
            throw new ApiError(
                400,
                "Title is required and must be a string"
            );
        }

        const trimmedTitle = title.trim();

        if (!trimmedTitle) {
            throw new ApiError(
                400,
                "Title cannot be empty"
            );
        }

        if (trimmedTitle.length > 200) {
            throw new ApiError(
                400,
                "Title cannot exceed 200 characters"
            );
        }

        if (typeof description !== "string") {
            throw new ApiError(
                400,
                "Description is required and must be a string"
            );
        }

        const trimmedDescription = description.trim();

        if (!trimmedDescription) {
            throw new ApiError(
                400,
                "Description cannot be empty"
            );
        }

        if (trimmedDescription.length > 5000) {
            throw new ApiError(
                400,
                "Description cannot exceed 5000 characters"
            );
        }

        if (!videoFile) {
            throw new ApiError(
                400,
                "Video file is required"
            );
        }

        if (!thumbnail) {
            throw new ApiError(
                400,
                "Thumbnail is required"
            );
        }

        videoFilePath = videoFile.path;
        thumbnailPath = thumbnail.path;

        compressedVideoPath = path.join(
            "public/temp",
            `compressed-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2)}.mp4`
        );

        //================ COMPRESS VIDEO =================//

        await compressVideo(
            videoFilePath,
            compressedVideoPath
        );

        //================ UPLOAD VIDEO =================//

        const videoUpload =
            await uploadOnCloudinary(
                compressedVideoPath
            );

        if (
            !videoUpload?.secure_url ||
            !videoUpload?.public_id
        ) {
            throw new ApiError(
                500,
                "Video upload failed"
            );
        }

        uploadedVideoPublicId =
            videoUpload.public_id;

        //================ UPLOAD THUMBNAIL =================//

        const thumbnailUpload =
            await uploadOnCloudinary(
                thumbnailPath
            );

        if (
            !thumbnailUpload?.secure_url ||
            !thumbnailUpload?.public_id
        ) {
            throw new ApiError(
                500,
                "Thumbnail upload failed"
            );
        }

        uploadedThumbnailPublicId =
            thumbnailUpload.public_id;

        //================ VIDEO DURATION =================//

        const duration = Number(
            videoUpload.duration
        );

        if (
            !Number.isFinite(duration) ||
            duration <= 0
        ) {
            throw new ApiError(
                500,
                "Invalid video duration"
            );
        }

        //================ CREATE VIDEO =================//

        const createdVideo = await Video.create({

            videoFile:
                videoUpload.secure_url,

            thumbnail:
                thumbnailUpload.secure_url,

            videoPublicId:
                videoUpload.public_id,

            thumbnailPublicId:
                thumbnailUpload.public_id,

            title:
                trimmedTitle,

            description:
                trimmedDescription,

            duration,

            owner:
                userId
        });

        //==================================================//
        // 🔔 NOTIFICATION HOOK
        // Notify all subscribers about new video
        //==================================================//

        const subscribers = await Subscribe.find({
            channel: userId
        }).select("subscriber");

        if (subscribers.length > 0) {

            const notifications =
                subscribers.map((subscription) => ({

                    recipient:
                        subscription.subscriber,

                    actor:
                        userId,

                    type:
                        "system",

                    title:
                        "New Video Published",

                    message:
                        `${req.user.username} published a new video: ${createdVideo.title}`,

                    entityType:
                        "video",

                    entityId:
                        createdVideo._id,

                    data: {
                        videoId:
                            createdVideo._id,

                        videoTitle:
                            createdVideo.title,

                        videoThumbnail:
                            createdVideo.thumbnail
                    }
                }));

            await Notification.insertMany(
                notifications
            );
        }

        //==================================================//

        // Database me video successfully save ho gaya
        uploadedVideoPublicId = null;
        uploadedThumbnailPublicId = null;

        //================ SUCCESS RESPONSE =================//

        return res
            .status(201)
            .json(
                new ApiResponse(
                    201,
                    createdVideo,
                    "Video published successfully"
                )
            );

    } finally {

        //================ CLEANUP VIDEO =================//

        if (uploadedVideoPublicId) {

            try {

                await deleteFromCloudinary(
                    uploadedVideoPublicId,
                    "video"
                );

            } catch (error) {

                console.error(
                    "Failed to cleanup uploaded video:",
                    error
                );
            }
        }

        //================ CLEANUP THUMBNAIL =================//

        if (uploadedThumbnailPublicId) {

            try {

                await deleteFromCloudinary(
                    uploadedThumbnailPublicId,
                    "image"
                );

            } catch (error) {

                console.error(
                    "Failed to cleanup uploaded thumbnail:",
                    error
                );
            }
        }

        //================ REMOVE ORIGINAL VIDEO =================//

        if (videoFilePath) {

            try {

                await fs.promises.rm(
                    videoFilePath,
                    {
                        force: true
                    }
                );

            } catch (error) {

                console.error(
                    "Failed to remove video temp file:",
                    error
                );
            }
        }

        //================ REMOVE COMPRESSED VIDEO =================//

        if (compressedVideoPath) {

            try {

                await fs.promises.rm(
                    compressedVideoPath,
                    {
                        force: true
                    }
                );

            } catch (error) {

                console.error(
                    "Failed to remove compressed video temp file:",
                    error
                );
            }
        }

        //================ REMOVE THUMBNAIL =================//

        if (thumbnailPath) {

            try {

                await fs.promises.rm(
                    thumbnailPath,
                    {
                        force: true
                    }
                );

            } catch (error) {

                console.error(
                    "Failed to remove thumbnail temp file:",
                    error
                );
            }
        }
    }
});


//================== getAllVideos =============================//

const getAllVideos = asyncHandler(async (req, res) => {

    const rawPage = Array.isArray(req.query.page)
        ? req.query.page[0]
        : req.query.page;

    const rawLimit = Array.isArray(req.query.limit)
        ? req.query.limit[0]
        : req.query.limit;

    const rawSearch = Array.isArray(req.query.search)
        ? req.query.search[0]
        : req.query.search;

    const rawSortBy = Array.isArray(req.query.sortBy)
        ? req.query.sortBy[0]
        : req.query.sortBy;

    const rawSortType = Array.isArray(req.query.sortType)
        ? req.query.sortType[0]
        : req.query.sortType;

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    let pageNumber = 1;
    let limitNumber = 10;

    if (rawPage !== undefined) {

        if (
            typeof rawPage !== "string" ||
            !/^[1-9]\d*$/.test(rawPage)
        ) {
            throw new ApiError(
                400,
                "Page must be a positive integer"
            );
        }

        pageNumber = Number(rawPage);

        if (!Number.isSafeInteger(pageNumber)) {
            throw new ApiError(
                400,
                "Page value is too large"
            );
        }
    }

    if (rawLimit !== undefined) {

        if (
            typeof rawLimit !== "string" ||
            !/^[1-9]\d*$/.test(rawLimit)
        ) {
            throw new ApiError(
                400,
                "Limit must be a positive integer"
            );
        }

        limitNumber = Number(rawLimit);

        if (!Number.isSafeInteger(limitNumber)) {
            throw new ApiError(
                400,
                "Limit value is too large"
            );
        }

        if (limitNumber > 50) {
            limitNumber = 50;
        }
    }

    const allowedSortFields = [
        "createdAt",
        "views",
        "title",
        "duration"
    ];

    const sortBy = allowedSortFields.includes(rawSortBy)
        ? rawSortBy
        : "createdAt";

    if (
        rawSortType !== undefined &&
        rawSortType !== "asc" &&
        rawSortType !== "desc"
    ) {
        throw new ApiError(
            400,
            "sortType must be either asc or desc"
        );
    }

    const sortOrder =
        rawSortType === "asc"
            ? 1
            : -1;

    const blockedUsers = await BlockedUser.find({
        $or: [
            {
                blocker: userId
            },
            {
                blockedUser: userId
            }
        ]
    })
        .select("blocker blockedUser")
        .lean();

    const blockedUserIds = blockedUsers.map((block) =>
        block.blocker.toString() === userId.toString()
            ? block.blockedUser
            : block.blocker
    );

    const matchStage = {
        isPublished: true
    };

    if (blockedUserIds.length > 0) {
        matchStage.owner = {
            $nin: blockedUserIds
        };
    }

    if (
        typeof rawSearch === "string" &&
        rawSearch.trim()
    ) {

        const search = escapeRegex(
            rawSearch.trim().slice(0, 100)
        );

        matchStage.$or = [
            {
                title: {
                    $regex: search,
                    $options: "i"
                }
            },
            {
                description: {
                    $regex: search,
                    $options: "i"
                }
            }
        ];
    }

    const aggregate = Video.aggregate([
        {
            $match: matchStage
        },
        {
            $sort: {
                [sortBy]: sortOrder,
                _id: -1
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner"
            }
        },
        {
            $unwind: "$owner"
        },
        {
            $project: {
                videoFile: 1,
                thumbnail: 1,
                title: 1,
                description: 1,
                duration: 1,
                views: 1,
                isPublished: 1,
                createdAt: 1,
                owner: {
                    _id: "$owner._id",
                    username: "$owner.username",
                    fullName: "$owner.fullName",
                    avatar: "$owner.avatar"
                }
            }
        }
    ]);

    const videos =
        await Video.aggregatePaginate(
            aggregate,
            {
                page: pageNumber,
                limit: limitNumber
            }
        );

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                videos,
                "Videos fetched successfully"
            )
        );
});


//=================== getVideoById =============================//

const getVideoById = asyncHandler(async (req, res) => {

    const { videoId } = req.params;

    if (!videoId) {
        throw new ApiError(
            400,
            "Video ID is required"
        );
    }

    if (!isValidObjectId(videoId)) {
        throw new ApiError(
            400,
            "Invalid video ID"
        );
    }

    const video = await Video.findOne({
        _id: videoId,
        isPublished: true
    })
        .populate(
            "owner",
            "username fullName avatar"
        )
        .lean()
        .exec();

    if (!video) {
        throw new ApiError(
            404,
            "Video not found"
        );
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        video.owner._id
    );

    if (blocked) {
        throw new ApiError(
            403,
            "Video is not available"
        );
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                video,
                "Video fetched successfully"
            )
        );
});


//==================== updateVideo ==============================//

const updateVideo = asyncHandler(async (req, res) => {

    const { videoId } = req.params;
    const {
        title,
        description
    } = req.body || {};

    const thumbnail =
        req.files?.thumbnail?.[0];

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!videoId) {
        throw new ApiError(
            400,
            "Video ID is required"
        );
    }

    if (!isValidObjectId(videoId)) {
        throw new ApiError(
            400,
            "Invalid video ID"
        );
    }

    if (
        title === undefined &&
        description === undefined &&
        !thumbnail
    ) {
        throw new ApiError(
            400,
            "At least one field is required"
        );
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(
            404,
            "Video not found"
        );
    }

    if (
        video.owner.toString() !==
        userId.toString()
    ) {
        throw new ApiError(
            403,
            "You are not authorized to update this video"
        );
    }

    if (title !== undefined) {

        if (typeof title !== "string") {
            throw new ApiError(
                400,
                "Title must be a string"
            );
        }

        const trimmedTitle = title.trim();

        if (!trimmedTitle) {
            throw new ApiError(
                400,
                "Title cannot be empty"
            );
        }

        if (trimmedTitle.length > 200) {
            throw new ApiError(
                400,
                "Title cannot exceed 200 characters"
            );
        }

        video.title = trimmedTitle;
    }

    if (description !== undefined) {

        if (typeof description !== "string") {
            throw new ApiError(
                400,
                "Description must be a string"
            );
        }

        const trimmedDescription =
            description.trim();

        if (!trimmedDescription) {
            throw new ApiError(
                400,
                "Description cannot be empty"
            );
        }

        if (trimmedDescription.length > 5000) {
            throw new ApiError(
                400,
                "Description cannot exceed 5000 characters"
            );
        }

        video.description =
            trimmedDescription;
    }

    let newThumbnailUpload = null;

    const oldThumbnailPublicId =
        video.thumbnailPublicId;

    try {

        if (thumbnail) {

            newThumbnailUpload =
                await uploadOnCloudinary(
                    thumbnail.path
                );

            if (
                !newThumbnailUpload?.secure_url ||
                !newThumbnailUpload?.public_id
            ) {
                throw new ApiError(
                    500,
                    "Thumbnail upload failed"
                );
            }

            video.thumbnail =
                newThumbnailUpload.secure_url;

            video.thumbnailPublicId =
                newThumbnailUpload.public_id;
        }

        await video.save();

        if (
            thumbnail &&
            oldThumbnailPublicId &&
            oldThumbnailPublicId !==
                newThumbnailUpload.public_id
        ) {
            try {
                await deleteFromCloudinary(
                    oldThumbnailPublicId,
                    "image"
                );
            } catch (error) {
                console.error(
                    "Failed to delete old thumbnail:",
                    error
                );
            }
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    video,
                    "Video updated successfully"
                )
            );

    } catch (error) {

        if (newThumbnailUpload?.public_id) {
            try {
                await deleteFromCloudinary(
                    newThumbnailUpload.public_id,
                    "image"
                );
            } catch (cleanupError) {
                console.error(
                    "Failed to cleanup new thumbnail:",
                    cleanupError
                );
            }
        }

        throw error;

    } finally {

        if (thumbnail?.path) {
            try {
                await fs.promises.rm(
                    thumbnail.path,
                    { force: true }
                );
            } catch (error) {
                console.error(
                    "Failed to remove thumbnail temp file:",
                    error
                );
            }
        }
    }
});


//==================== deleteVideo ==============================//

const deleteVideo = asyncHandler(async (req, res) => {

    const { videoId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!videoId) {
        throw new ApiError(
            400,
            "Video ID is required"
        );
    }

    if (!isValidObjectId(videoId)) {
        throw new ApiError(
            400,
            "Invalid video ID"
        );
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(
            404,
            "Video not found"
        );
    }

    if (
        video.owner.toString() !==
        userId.toString()
    ) {
        throw new ApiError(
            403,
            "You are not authorized to delete this video"
        );
    }

    const deletedVideo =
        await Video.findOneAndDelete({
            _id: videoId,
            owner: userId
        });

    if (!deletedVideo) {
        throw new ApiError(
            404,
            "Video not found or already deleted"
        );
    }

    if (deletedVideo.videoPublicId) {
        try {
            await deleteFromCloudinary(
                deletedVideo.videoPublicId,
                "video"
            );
        } catch (error) {
            console.error(
                "Failed to delete video from Cloudinary:",
                error
            );
        }
    }

    if (deletedVideo.thumbnailPublicId) {
        try {
            await deleteFromCloudinary(
                deletedVideo.thumbnailPublicId,
                "image"
            );
        } catch (error) {
            console.error(
                "Failed to delete thumbnail from Cloudinary:",
                error
            );
        }
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {},
                "Video deleted successfully"
            )
        );
});


//======================= incrementVideoViews =========================//

const incrementVideoViews = asyncHandler(async (req, res) => {

    const { videoId } = req.params;

    if (!videoId) {
        throw new ApiError(
            400,
            "Video ID is required"
        );
    }

    if (!isValidObjectId(videoId)) {
        throw new ApiError(
            400,
            "Invalid video ID"
        );
    }

    const video = await Video.findOne({
        _id: videoId,
        isPublished: true
    }).select("_id owner views");

    if (!video) {
        throw new ApiError(
            404,
            "Video not found"
        );
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        video.owner
    );

    if (blocked) {
        throw new ApiError(
            403,
            "Video is not available"
        );
    }

    const updatedVideo = await Video.findOneAndUpdate(
        {
            _id: videoId,
            isPublished: true
        },
        {
            $inc: {
                views: 1
            }
        },
        {
            new: true
        }
    );

    if (!updatedVideo) {
        throw new ApiError(
            404,
            "Video not found"
        );
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    views: updatedVideo.views
                },
                "Video views incremented successfully"
            )
        );
});



//======================= togglePublishStatus ===========================//

const togglePublishStatus = asyncHandler(async (req, res) => {

    const { videoId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!videoId) {
        throw new ApiError(
            400,
            "Video ID is required"
        );
    }

    if (!isValidObjectId(videoId)) {
        throw new ApiError(
            400,
            "Invalid video ID"
        );
    }

    const video = await Video.findOne({
        _id: videoId,
        owner: userId
    });

    if (!video) {
        throw new ApiError(
            404,
            "Video not found or you are not the owner"
        );
    }

    const oldStatus = video.isPublished;
    const newStatus = !oldStatus;

    const result = await Video.updateOne(
        {
            _id: videoId,
            owner: userId,
            isPublished: oldStatus
        },
        {
            $set: {
                isPublished: newStatus
            }
        }
    );

    if (result.modifiedCount !== 1) {
        throw new ApiError(
            409,
            "Video publish status changed, please try again"
        );
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    _id: video._id,
                    title: video.title,
                    isPublished: newStatus
                },
                newStatus
                    ? "Video published successfully"
                    : "Video unpublished successfully"
            )
        );
});


//====================== getMyVideos ============================//

const getMyVideos = asyncHandler(async (req, res) => {

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    const videos = await Video.find({
        owner: userId
    })
        .sort({
            createdAt: -1,
            _id: -1
        })
        .lean()
        .exec();

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                videos,
                "Your videos fetched successfully"
            )
        );
});


//======================= exports =======================//

export {
    publishAVideo,
    getAllVideos,
    getVideoById,
    updateVideo,
    deleteVideo,
    incrementVideoViews,
    togglePublishStatus,
    getMyVideos
};