import fs from "fs";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Video } from "../models/video.model.js";
import { deleteFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js";
import { compressVideo } from "../utils/ffmpeg.js";
import path from "path";

//================= publishAVideo ============================//

const publishAVideo = asyncHandler(async (req, res) => {

    let videoFilePath = null;
    let compressedVideoPath = null;

    try {

        const { title, description } = req.body;

        const videoFile = req.files?.videoFile?.[0];
        const thumbnail = req.files?.thumbnail?.[0];

        if (!title || !description) {
            throw new ApiError(
                400,
                "Title and description are required"
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

        // Compression
        compressedVideoPath = path.join(
            "public/temp",
            `compressed-${Date.now()}.mp4`
        );

        await compressVideo(
            videoFilePath,
            compressedVideoPath
        );

        // Upload video
        const videoUpload =
            await uploadOnCloudinary(
                compressedVideoPath
            );

        if (!videoUpload) {
            throw new ApiError(
                500,
                "Video upload failed"
            );
        }

        // Upload thumbnail
        const thumbnailUpload =
            await uploadOnCloudinary(
                thumbnail.path
            );

        if (!thumbnailUpload) {
            throw new ApiError(
                500,
                "Thumbnail upload failed"
            );
        }

        // Duration
        const duration = videoUpload.duration;

        // Save in MongoDB
        const createdVideo = await Video.create({
            videoFile: videoUpload.secure_url,
            thumbnail: thumbnailUpload.secure_url,

            videoPublicId: videoUpload.public_id,
            thumbnailPublicId: thumbnailUpload.public_id,

            title: title.trim(),
            description: description.trim(),
            duration,
            owner: req.user._id
        });

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

        // Temporary original video
        if (
            videoFilePath &&
            fs.existsSync(videoFilePath)
        ) {
            fs.unlinkSync(videoFilePath);
        }

        // Temporary compressed video
        if (
            compressedVideoPath &&
            fs.existsSync(compressedVideoPath)
        ) {
            fs.unlinkSync(compressedVideoPath);
        }

    }
});

//================== getAllVideos =============================//

const getAllVideos = asyncHandler(async (req, res) => {

    const {
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortType = "desc",
        search
    } = req.query;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    const matchStage = {
        isPublished: true
    };

    // Search by title / description
    if (search?.trim()) {
        matchStage.$or = [
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

    const sortOrder = sortType === "asc" ? 1 : -1;

    const aggregate = Video.aggregate([
        {
            $match: matchStage
        },

        {
            $sort: {
                [sortBy]: sortOrder
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

    const options = {
        page: pageNumber,
        limit: limitNumber
    };

    const videos = await Video.aggregatePaginate(
        aggregate,
        options
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

const getVideoById = asyncHandler(async(req, res) => {

    const { videoId } = req.params;

    if(!videoId) {
        throw new ApiError(400, "Video ID is required")
    }

    const video = await Video.findById(videoId)
    .populate(
      "owner",
      "username fullName avatar"
    )

    if(!video) {
        throw new ApiError(404, "Video not found");
    }

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            video,
            "video fetched successfully"
        )
    )
})

//==================== updateVideo ==============================//

const updateVideo = asyncHandler(async (req, res) => {

    const { videoId } = req.params;
    const { title, description } = req.body;

    if (!videoId) {
        throw new ApiError(
            400,
            "Video ID is required"
        );
    }

    const thumbnail = req.files?.thumbnail?.[0];

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

    // Only owner can update
    if (
        video.owner.toString() !==
        req.user._id.toString()
    ) {
        throw new ApiError(
            403,
            "You are not authorized to update this video"
        );
    }

    // Update title
    if (title !== undefined) {

        const trimmedTitle = title.trim();

        if (!trimmedTitle) {
            throw new ApiError(
                400,
                "Title cannot be empty"
            );
        }

        video.title = trimmedTitle;
    }

    // Update description
    if (description !== undefined) {

        const trimmedDescription =
            description.trim();

        if (!trimmedDescription) {
            throw new ApiError(
                400,
                "Description cannot be empty"
            );
        }

        video.description =
            trimmedDescription;
    }

    // Update thumbnail
    if (thumbnail) {

        const thumbnailUpload =
            await uploadOnCloudinary(
                thumbnail.path
            );

        if (!thumbnailUpload) {
            throw new ApiError(
                500,
                "Thumbnail upload failed"
            );
        }

        // Delete old thumbnail from Cloudinary
        const oldThumbnailDelete =
            await deleteFromCloudinary(
                video.thumbnailPublicId,
                "image"
            );

        if (
            oldThumbnailDelete &&
            oldThumbnailDelete.result !== "ok" &&
            oldThumbnailDelete.result !== "not found"
        ) {
            throw new ApiError(
                500,
                "Failed to delete old thumbnail"
            );
        }

        video.thumbnail =
            thumbnailUpload.secure_url;

        video.thumbnailPublicId =
            thumbnailUpload.public_id;
    }

    await video.save();

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                video,
                "Video updated successfully"
            )
        );
});

//==================== deleteVideo ==============================//

const deleteVideo = asyncHandler(async (req, res) => {

    const { videoId } = req.params;

    if (!videoId) {
        throw new ApiError(
            400,
            "Video ID is required"
        );
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(
            404,
            "Video not found"
        );
    }

    // Only owner can delete
    if (
        video.owner.toString() !==
        req.user._id.toString()
    ) {
        throw new ApiError(
            403,
            "You are not authorized to delete this video"
        );
    }

    // Delete video from Cloudinary
    const videoDelete =
        await deleteFromCloudinary(
            video.videoPublicId,
            "video"
        );

    if (
        videoDelete &&
        videoDelete.result !== "ok" &&
        videoDelete.result !== "not found"
    ) {
        throw new ApiError(
            500,
            "Failed to delete video from Cloudinary"
        );
    }

    // Delete thumbnail from Cloudinary
    const thumbnailDelete =
        await deleteFromCloudinary(
            video.thumbnailPublicId,
            "image"
        );

    if (
        thumbnailDelete &&
        thumbnailDelete.result !== "ok" &&
        thumbnailDelete.result !== "not found"
    ) {
        throw new ApiError(
            500,
            "Failed to delete thumbnail from Cloudinary"
        );
    }

    // Delete video document from MongoDB
    await Video.findByIdAndDelete(videoId);

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

    const video = await Video.findOneAndUpdate(
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
            returnDocument: "after"
        }
    );

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    views: video.views
                },
                "Video views incremented successfully"
            )
        );
});

//======================= togglePublishStatus ===========================//

const togglePublishStatus = asyncHandler(async (req, res) => {

    const { videoId } = req.params;

    if (!videoId) {
        throw new ApiError(
            400,
            "Video ID is required"
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
        req.user._id.toString()
    ) {
        throw new ApiError(
            403,
            "You are not authorized to change publish status"
        );
    }

    video.isPublished = !video.isPublished;

    await video.save();

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    _id: video._id,
                    title: video.title,
                    isPublished: video.isPublished
                },
                video.isPublished
                    ? "Video published successfully"
                    : "Video unpublished successfully"
            )
        );
});

//====================== getMyVideos ============================//

const getMyVideos = asyncHandler(async (req, res) => {

    const videos = await Video.find({
        owner: req.user._id
    })
    .sort({ createdAt: -1 });

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