import mongoose from "mongoose";

import { Like } from "../models/like.model.js";
import { Video } from "../models/video.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { isBlockedBetweenUsers } from "../utils/isBlockedBetweenUsers.js";


// ================== likeVideo ======================== //

const likeVideo = asyncHandler(async (req, res) => {

    const { videoId } = req.params;

    
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    
    const video = await Video.findOne({
        _id: videoId,
        isPublished: true
    });

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        video.owner
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot like this video"
        );
    }
    
    const existingLike = await Like.findOne({
        video: videoId,
        likedBy: req.user._id
    });

    if (existingLike) {
        throw new ApiError(409, "Video already liked");
    }
    
    const like = await Like.create({
        video: videoId,
        likedBy: req.user._id
    });

    if (!like) {
        throw new ApiError(500, "Failed to like video");
    }

    return res
        .status(201)
        .json(
            new ApiResponse(
                201,
                like,
                "Video liked successfully"
            )
        );
});


// ================== unlikeVideo ====================== //

const unlikeVideo = asyncHandler(async (req, res) => {

    const { videoId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findOne({
        _id: videoId,
        isPublished: true
    });

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        video.owner
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot unlike this video"
        );
    }

    const deletedLike = await Like.findOneAndDelete({
        video: videoId,
        likedBy: req.user._id
    });

    if (!deletedLike) {
        throw new ApiError(
            404,
            "You have not liked this video"
        );
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                null,
                "Video unliked successfully"
            )
        );
});


// ================= getVideoLikeCount ================= //

const getVideoLikeCount = asyncHandler(async (req, res) => {

    const { videoId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findOne({
        _id: videoId,
        isPublished: true
    }).select("owner");

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        video.owner
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot view likes of this video"
        );
    }

    const likeCount = await Like.countDocuments({
        video: videoId
    });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { likeCount },
                "Video like count fetched successfully"
            )
        );
});


// ================= getMyLikedVideos ================== //

const getMyLikedVideos = asyncHandler(async (req, res) => {

    const likes = await Like.find({
        likedBy: req.user._id
    })
        .populate({
            path: "video",
            match: { isPublished: true },
            select: "title description thumbnail owner views isPublished createdAt",
            populate: {
                path: "owner",
                select: "username fullName avatar"
            }
        })
        .sort({
            createdAt: -1
        });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                likes,
                "Liked videos fetched successfully"
            )
        );
});


export {
    likeVideo,
    unlikeVideo,
    getVideoLikeCount,
    getMyLikedVideos
};
