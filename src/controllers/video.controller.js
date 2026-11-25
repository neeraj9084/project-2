import fs from "fs";
import path from "path";
import mongoose from "mongoose";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Video } from "../models/video.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { videoUploadIdentity, registerVideoMedia, queueVideoMedia, unregisterVideoMedia } from "../services/videoAssetRegistry.service.js";
import { tombstoneVideo } from "../services/tombstoneVideo.service.js";
import { createThumbnailNotifications } from "../services/notificationThumbnailRegistry.service.js";
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

    let uploadedVideo = null;
    let uploadedThumbnail = null;
    let committed = false;
    const newVideoId = new mongoose.Types.ObjectId();
    const uploadOwner = req.user?._id;

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

        uploadedVideo = videoUpload;

        if (
            !videoUpload?.secure_url ||
            !videoUpload?.public_id
        ) {
            throw new ApiError(
                500,
                "Video upload failed"
            );
        }

        const videoMetadata = videoUploadIdentity(videoUpload, "video");

        //================ UPLOAD THUMBNAIL =================//

        const thumbnailUpload =
            await uploadOnCloudinary(
                thumbnailPath
            );

        uploadedThumbnail = thumbnailUpload;

        if (
            !thumbnailUpload?.secure_url ||
            !thumbnailUpload?.public_id
        ) {
            throw new ApiError(
                500,
                "Thumbnail upload failed"
            );
        }

        const thumbnailMetadata = videoUploadIdentity(thumbnailUpload, "image");

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

        let createdVideo;
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await registerVideoMedia({ metadata: videoMetadata, kind: "video", videoId: newVideoId, owner: userId, session });
                await registerVideoMedia({ metadata: thumbnailMetadata, kind: "thumbnail", videoId: newVideoId, owner: userId, session });
                [createdVideo] = await Video.create([{
            _id: newVideoId,
            mediaRegistry: { video: videoMetadata, thumbnail: thumbnailMetadata },

            videoFile:
                videoUpload.secure_url,

            thumbnail:
                thumbnailUpload.secure_url,

            videoPublicId:
                videoUpload.public_id,

            thumbnailPublicId:
                thumbnailUpload.public_id,

            videoDeliveryType: videoUpload.type || null,
            thumbnailDeliveryType: thumbnailUpload.type || null,

            title:
                trimmedTitle,

            description:
                trimmedDescription,

            duration,

            owner:
                userId
                }], { session });
            });
            committed = true;
        } finally { await session.endSession(); }

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

            await createThumbnailNotifications(
                notifications
            );
        }

        //==================================================//

        // Database me video successfully save ho gaya
        createdVideo = await Video.findById(newVideoId);

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

        if (!committed && uploadOwner) {
            for (const [kind, upload] of [["video", uploadedVideo], ["thumbnail", uploadedThumbnail]]) {
                if (!upload) continue;
                let metadata;
                try { metadata = videoUploadIdentity(upload, kind === "video" ? "video" : "image"); }
                catch { metadata = { publicId: upload.public_id, url: upload.secure_url, resourceType: upload.resource_type, deliveryType: upload.type }; }
                try { await queueVideoMedia({ metadata, kind, videoId: newVideoId, owner: uploadOwner, suffix: "failed-upload" }); }
                catch (error) { console.error("Failed to queue uploaded media for review:", error); }
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
    // 1. Get query parameters
    const getQueryValue = (value) =>
        Array.isArray(value) ? value[0] : value;

    const rawPage = getQueryValue(req.query.page);
    const rawLimit = getQueryValue(req.query.limit);
    const rawSearch = getQueryValue(req.query.search);
    const rawSortBy = getQueryValue(req.query.sortBy);
    const rawSortType = getQueryValue(req.query.sortType);

    // 2. Login required
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized request");
    }

    // 3. Validate pagination
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
            throw new ApiError(400, "Page value is too large");
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
            throw new ApiError(400, "Limit value is too large");
        }

        // Maximum 50 videos per request
        limitNumber = Math.min(limitNumber, 50);
    }

    const skip = (pageNumber - 1) * limitNumber;

    if (!Number.isSafeInteger(skip)) {
        throw new ApiError(400, "Page value is too large");
    }

    // 4. Validate sorting
    const allowedSortFields = [
        "createdAt",
        "views",
        "title",
        "duration"
    ];

    const sortBy =
        typeof rawSortBy === "string" &&
        allowedSortFields.includes(rawSortBy)
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

    const sortOrder = rawSortType === "asc" ? 1 : -1;

    // 5. Find users blocked by this user or blocking this user
    const blockedUsers = await BlockedUser.find({
        $or: [
            { blocker: userId },
            { blockedUser: userId }
        ]
    })
        .select("blocker blockedUser")
        .lean();

    const blockedUserIds = blockedUsers.map((block) =>
        block.blocker.toString() === userId.toString()
            ? block.blockedUser
            : block.blocker
    );

    // 6. Match all published videos
    const matchStage = {
        isPublished: true
    };

    // Exclude videos belonging to blocked users
    if (blockedUserIds.length > 0) {
        matchStage.owner = {
            $nin: blockedUserIds
        };
    }

    // 7. Search by title or description
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

    // 8. Common aggregation pipeline
    // Videos from every account are included if published.
    // Videos without an existing owner document are excluded.
    const buildBasePipeline = () => [
        {
            $match: matchStage
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails"
            }
        },
        {
            $unwind: "$ownerDetails"
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
                    _id: "$ownerDetails._id",
                    username: "$ownerDetails.username",
                    fullName: "$ownerDetails.fullName",
                    avatar: "$ownerDetails.avatar"
                }
            }
        }
    ];

    // 9. Fetch videos and count using the same base pipeline
    const [docs, countResult] = await Promise.all([
        Video.aggregate([
            ...buildBasePipeline(),
            {
                $sort: {
                    [sortBy]: sortOrder,
                    _id: -1
                }
            },
            {
                $skip: skip
            },
            {
                $limit: limitNumber
            }
        ]),

        Video.aggregate([
            ...buildBasePipeline(),
            {
                $count: "totalDocs"
            }
        ])
    ]);

    const totalDocs = countResult[0]?.totalDocs ?? 0;
    const totalPages = Math.ceil(totalDocs / limitNumber);

    // 10. Build consistent pagination response
    const videos = {
        docs,
        totalDocs,
        limit: limitNumber,
        page: pageNumber,
        totalPages,
        pagingCounter: totalDocs === 0 ? 0 : skip + 1,
        hasPrevPage: pageNumber > 1 && totalPages > 0,
        hasNextPage: pageNumber < totalPages,
        prevPage:
            pageNumber > 1 && totalPages > 0
                ? pageNumber - 1
                : null,
        nextPage:
            pageNumber < totalPages
                ? pageNumber + 1
                : null
    };

    return res.status(200).json(
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
    const userId = req.user?._id;

    // Login required
    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    // Validate video ID
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

    // Fetch any published video, regardless of its owner
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
            "Published video not found"
        );
    }

    if (!video.owner?._id) {
        throw new ApiError(
            404,
            "Video owner not found"
        );
    }

    // Check whether either user has blocked the other
    const blocked = await BlockedUser.exists({
        $or: [
            {
                blocker: userId,
                blockedUser: video.owner._id
            },
            {
                blocker: video.owner._id,
                blockedUser: userId
            }
        ]
    });

    if (blocked) {
        throw new ApiError(
            403,
            "Video is not available"
        );
    }

    return res.status(200).json(
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

    const video = await Video.findOne({ _id: videoId, isDeleted: { $ne: true } });

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

    let updatedVideo;
    let thumbnailCommitted = false;

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

        }
        const metadata = thumbnail ? videoUploadIdentity(newThumbnailUpload, "image") : null;
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const current = await Video.findOne({ _id: videoId, owner: userId, isDeleted: { $ne: true } })
                    .select("+mediaRegistry +thumbnailDeliveryType").session(session);
                if (!current) throw new ApiError(404, "Video not found or no longer accessible");
                if (title !== undefined) current.title = video.title;
                if (description !== undefined) current.description = video.description;
                if (metadata) {
                    const old = current.mediaRegistry?.thumbnail;
                    await registerVideoMedia({ metadata, kind: "thumbnail", videoId: current._id, owner: userId, session });
                    if (old?.asset !== metadata.asset) {
                        await queueVideoMedia({ metadata: old || { url: current.thumbnail, publicId: current.thumbnailPublicId,
                            resourceType: "image", deliveryType: current.thumbnailDeliveryType }, kind: "thumbnail", videoId: current._id, owner: userId, session });
                        await unregisterVideoMedia({ metadata: old, kind: "thumbnail", videoId: current._id, owner: userId, session });
                    }
                    current.thumbnail = metadata.url;
                    current.thumbnailPublicId = metadata.publicId;
                    current.thumbnailDeliveryType = metadata.deliveryType;
                    if (!current.mediaRegistry) current.mediaRegistry = {};
                    current.mediaRegistry.thumbnail = metadata;
                }
                await current.save({ session });
            });
            thumbnailCommitted = true;
        } finally { await session.endSession(); }
        updatedVideo = await Video.findById(videoId);

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    updatedVideo,
                    "Video updated successfully"
                )
            );

    } catch (error) {

        if (newThumbnailUpload && !thumbnailCommitted) {
            try {
                let metadata;
                try { metadata = videoUploadIdentity(newThumbnailUpload, "image"); }
                catch { metadata = { publicId: newThumbnailUpload.public_id, url: newThumbnailUpload.secure_url,
                    resourceType: newThumbnailUpload.resource_type, deliveryType: newThumbnailUpload.type }; }
                await queueVideoMedia({ metadata, kind: "thumbnail", videoId, owner: userId, suffix: "failed-upload" });
            } catch (cleanupError) {
                console.error(
                    "Failed to queue new thumbnail for review:",
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

    const video = await Video.findOne({ _id: videoId, isDeleted: { $ne: true } });

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

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const current = await Video.findOne({ _id: videoId, owner: userId, isDeleted: { $ne: true } }).session(session);
            if (!current) throw new ApiError(404, "Video not found or already deleted");
            await tombstoneVideo(videoId, { session });
        });
    } finally { await session.endSession(); }

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
        throw new ApiError(400, "Video ID is required");
    }

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    // Atomically increment views for a published video.
    const updatedVideo = await Video.findOneAndUpdate(
        {
            _id: videoId,
            isPublished: true,
        },
        {
            $inc: { views: 1 },
        },
        {
            new: true,
        }
    ).select("_id views");

    if (!updatedVideo) {
        throw new ApiError(404, "Video not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                videoId: updatedVideo._id,
                views: updatedVideo.views,
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
        owner: userId,
        isDeleted: { $ne: true }
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
            isPublished: oldStatus,
            isDeleted: { $ne: true }
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
        owner: userId,
        isDeleted: { $ne: true }
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
