import mongoose from "mongoose";

import { Subscribe } from "../models/subscribe.model.js";
import { User } from "../models/user.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { isBlockedBetweenUsers } from "../utils/isBlockedBetweenUsers.js";

//==================== subscribeToChannel ====================//!SECTION

const subscribeToChannel = asyncHandler(async (req, res) => {

    const { channelId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
        throw new ApiError(400, "Invalid channel ID");
    }

    if (req.user._id.toString() === channelId) {
        throw new ApiError(
            400,
            "You cannot subscribe to your own channel"
        );
    }

    const channel = await User.findById(channelId);

    if (!channel) {
        throw new ApiError(404, "Channel not found");
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        channelId
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot subscribe to this channel"
        );
    }

    const existingSubscription = await Subscribe.findOne({
        subscriber: req.user._id,
        channel: channelId
    });

    if (existingSubscription) {
        throw new ApiError(409, "Already subscribed to this channel");
    }

    const subscription = await Subscribe.create({
        subscriber: req.user._id,
        channel: channelId
    });

    if (!subscription) {
        throw new ApiError(500, "Failed to subscribe to channel");
    }

    return res
        .status(201)
        .json(
            new ApiResponse(
                201,
                subscription,
                "Channel subscribed successfully"
            )
        );
});

//===================== unsubscribeFromChannel ====================//
const unsubscribeFromChannel = asyncHandler(async (req, res) => {

    const { channelId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
        throw new ApiError(400, "Invalid channel ID");
    }

    const channel = await User.findById(channelId);

    if (!channel) {
        throw new ApiError(404, "Channel not found");
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        channelId
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot unsubscribe from this channel"
        );
    }

    const subscription = await Subscribe.findOneAndDelete({
        subscriber: req.user._id,
        channel: channelId
    });

    if (!subscription) {
        throw new ApiError(404, "You are not subscribed to this channel");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                null,
                "Channel unsubscribed successfully"
            )
        );
});

//=================== getChannelSubscribers =====================//

const getChannelSubscribers = asyncHandler(async (req, res) => {

    const { channelId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
        throw new ApiError(400, "Invalid channel ID");
    }

    const channel = await User.findById(channelId);

    if (!channel) {
        throw new ApiError(404, "Channel not found");
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        channelId
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot view subscribers of this channel"
        );
    }

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

    const skip = (page - 1) * limit;

    const [subscribers, totalSubscribers] = await Promise.all([
        Subscribe.find({
            channel: channelId
        })
            .populate("subscriber", "username fullName avatar")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),

        Subscribe.countDocuments({
            channel: channelId
        })
    ]);

    const totalPages = Math.ceil(totalSubscribers / limit);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    subscribers,
                    pagination: {
                        currentPage: page,
                        limit,
                        totalSubscribers,
                        totalPages,
                        hasNextPage: page < totalPages,
                        hasPreviousPage: page > 1
                    }
                },
                "Channel subscribers fetched successfully"
            )
        );
});

//=================== getUserSubscriptions =====================//

const getUserSubscriptions = asyncHandler(async (req, res) => {

    // 1. Pagination
    const page = Math.max(Number(req.query.page) || 1, 1);

    const limit = Math.min(
        Math.max(Number(req.query.limit) || 10, 1),
        100
    );

    const skip = (page - 1) * limit;

    // 2. Get user's subscriptions + total count
    const [subscriptions, totalSubscriptions] = await Promise.all([

        Subscribe.find({
            subscriber: req.user._id
        })
            .populate("channel", "username fullName avatar")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),

        Subscribe.countDocuments({
            subscriber: req.user._id
        })

    ]);

    // 3. Pagination information
    const totalPages = Math.ceil(totalSubscriptions / limit);

    // 4. Response
    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    subscriptions,
                    pagination: {
                        currentPage: page,
                        limit,
                        totalSubscriptions,
                        totalPages,
                        hasNextPage: page < totalPages,
                        hasPreviousPage: page > 1
                    }
                },
                "User subscriptions fetched successfully"
            )
        );
});

export {
    subscribeToChannel,
    unsubscribeFromChannel,
    getChannelSubscribers,
    getUserSubscriptions
}