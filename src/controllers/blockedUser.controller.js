import mongoose from "mongoose";

import { BlockedUser } from "../models/blockedUser.model.js";
import { User } from "../models/user.model.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

//=============================== blockUser ===================================

const blockUser = asyncHandler(async (req, res) => {

    const blockerId = req.user._id;
    const { userId: blockedUserId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(blockedUserId)) {
        throw new ApiError(400, "Invalid user ID");
    }

    if (blockerId.equals(blockedUserId)) {
        throw new ApiError(400, "You cannot block yourself");
    }

    const targetUser = await User.findById(blockedUserId)
        .select("_id isActive")
        .lean();

    if (!targetUser) {
        throw new ApiError(404, "User not found");
    }

    if (!targetUser.isActive) {
        throw new ApiError(400, "This user account is not active");
    }

    let block;

    try {
        block = await BlockedUser.create({
            blocker: blockerId,
            blockedUser: targetUser._id
        });
    } catch (error) {
        if (error?.code === 11000) {
            throw new ApiError(409, "User is already blocked");
        }

        throw error;
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                blockedUserId: block.blockedUser,
                blockedAt: block.createdAt
            },
            "User blocked successfully"
        )
    );
});

//=============================== unblockUser ===================================

const unblockUser = asyncHandler(async (req, res) => {

    const blockerId = req.user._id;
    const { userId: blockedUserId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(blockedUserId)) {
        throw new ApiError(400, "Invalid user ID");
    }

    if (blockerId.equals(blockedUserId)) {
        throw new ApiError(400, "Invalid unblock request");
    }

    const result = await BlockedUser.findOneAndDelete({
        blocker: blockerId,
        blockedUser: blockedUserId
    });

    if (!result) {
        throw new ApiError(404, "User is not blocked");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                unblockedUserId: blockedUserId
            },
            "User unblocked successfully"
        )
    );
});

//========================= getBlockedUser ====================================//

const getBlockedUsers = asyncHandler(async (req, res) => {

    const blockedUsers = await BlockedUser.find({
        blocker: req.user._id
    })
        .populate({
            path: "blockedUser",
            select: "_id username fullName avatar isActive"
        })
        .sort({ createdAt: -1 })
        .lean();

    return res.status(200).json(
        new ApiResponse(
            200,
            blockedUsers,
            "Blocked users fetched successfully"
        )
    );
});

//======================= isUserBlocked =======================================//

const isUserBlocked = asyncHandler(async (req, res) => {

    const blockerId = req.user._id;
    const { userId: blockedUserId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(blockedUserId)) {
        throw new ApiError(400, "Invalid user ID");
    }

    if (blockerId.equals(blockedUserId)) {
        throw new ApiError(400, "Invalid user ID");
    }

    const blocked = await BlockedUser.exists({
        blocker: blockerId,
        blockedUser: blockedUserId
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                userId: blockedUserId,
                isBlocked: Boolean(blocked)
            },
            "Block status fetched successfully"
        )
    );
});

export {
    blockUser,
    unblockUser,
    getBlockedUsers,
    isUserBlocked,
};