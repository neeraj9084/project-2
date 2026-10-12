import mongoose from "mongoose";

import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js";
import { Like } from "../models/like.model.js";
import { Comment } from "../models/comment.model.js";
import { Subscribe } from "../models/subscribe.model.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

//===================== getUserOverview =======================//

const getUserOverview = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(400, "Invalid user ID");
    }

    // Check user
    const user = await User.findById(userId)
        .select("username email fullName avatar coverImage createdAt");

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // Total uploaded videos
    const totalVideos = await Video.countDocuments({
        owner: userId
    });

    // Published videos
    const publishedVideos = await Video.countDocuments({
        owner: userId,
        isPublished: true
    });

    // Unpublished videos
    const unpublishedVideos = await Video.countDocuments({
        owner: userId,
        isPublished: false
    });

    // Total views on user's videos
    const viewsResult = await Video.aggregate([
        {
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        },
        {
            $group: {
                _id: null,
                totalViews: {
                    $sum: "$views"
                }
            }
        }
    ]);

    const totalViews = viewsResult[0]?.totalViews || 0;

    // Total likes received on user's videos
    const likesResult = await Like.aggregate([
        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "video"
            }
        },
        {
            $unwind: "$video"
        },
        {
            $match: {
                "video.owner": new mongoose.Types.ObjectId(userId)
            }
        },
        {
            $count: "totalLikes"
        }
    ]);

    const totalLikes = likesResult[0]?.totalLikes || 0;

    // Total comments received on user's videos
    const commentsResult = await Comment.aggregate([
        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "video"
            }
        },
        {
            $unwind: "$video"
        },
        {
            $match: {
                "video.owner": new mongoose.Types.ObjectId(userId)
            }
        },
        {
            $count: "totalComments"
        }
    ]);

    const totalComments = commentsResult[0]?.totalComments || 0;

    // Total subscribers
    const totalSubscribers = await Subscribe.countDocuments({
        channel: userId
    });

    // Total subscriptions
    const totalSubscriptions = await Subscribe.countDocuments({
        subscriber: userId
    });

    // Recent videos
    const recentVideos = await Video.find({
        owner: userId
    })
        .select("title thumbnail views isPublished createdAt duration")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

    const overview = {
        user: {
            _id: user._id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            avatar: user.avatar,
            coverImage: user.coverImage,
            createdAt: user.createdAt
        },

        statistics: {
            totalVideos,
            publishedVideos,
            unpublishedVideos,
            totalViews,
            totalLikes,
            totalComments,
            totalSubscribers,
            totalSubscriptions
        },

        recentVideos
    };

    return res.status(200).json(
        new ApiResponse(
            200,
            overview,
            "User overview fetched successfully"
        )
    );
});

//===================== getMyVideos =======================//

const getMyVideos = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const {
        page = 1,
        limit = 12
    } = req.query;

    const pageNumber = Math.max(Number(page), 1);
    const limitNumber = Math.min(Math.max(Number(limit), 1), 50);

    const skip = (pageNumber - 1) * limitNumber;

    const filter = {
        owner: userId
    };

    const totalVideos = await Video.countDocuments(filter);

    const videos = await Video.find(filter)
        .select(
            "title thumbnail views duration isPublished createdAt"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean();

    const totalPages = Math.ceil(totalVideos / limitNumber);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                videos,
                pagination: {
                    currentPage: pageNumber,
                    totalPages,
                    totalVideos,
                    limit: limitNumber,
                    hasNextPage: pageNumber < totalPages,
                    hasPreviousPage: pageNumber > 1
                }
            },
            "My videos fetched successfully"
        )
    );
});

export {
    getUserOverview
};