import mongoose from "mongoose";
import { Share } from "../models/share.model.js";
import { Video } from "../models/video.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isBlockedBetweenUsers } from "../utils/isBlockedBetweenUsers.js";

const shareVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    if (!req.user?._id) {
        throw new ApiError(401, "Unauthorized request");
    }

    const video = await Video.findById(videoId).select(
        "_id isPublished"
    );

    if (!video || !video.isPublished) {
        throw new ApiError(404, "Video not found");
    }

      const blocked = await isBlockedBetweenUsers(
        req.user._id,
        video.owner
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot view shares of this video"
        );
    }

    const share = await Share.create({
        owner: req.user._id,
        video: video._id
    });

    const shareCount = await Share.countDocuments({
        video: video._id
    });

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                share,
                shareCount
            },
            "Video shared successfully"
        )
    );
});


const getVideoShareCount = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findById(videoId).select(
        "_id isPublished"
    );

    if (!video || !video.isPublished) {
        throw new ApiError(404, "Video not found");
    }
    
     const blocked = await isBlockedBetweenUsers(
        req.user._id,
        video.owner
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot share this video"
        );
    }

    const shareCount = await Share.countDocuments({
        video: video._id
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            { shareCount },
            "Share count fetched successfully"
        )
    );
});

export {
    shareVideo,
    getVideoShareCount
};