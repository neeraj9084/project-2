import mongoose from "mongoose";

import { MessageReaction } from "../models/messageReaction.model.js";
import { Message } from "../models/message.model.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

//=============================== addReaction ===================================

const addReaction = asyncHandler(async (req, res) => {

    const userId = req.user._id;
    const { messageId } = req.params;
    const { reaction } = req.body;

   
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw new ApiError(400, "Invalid message ID");
    }


    if (!reaction || typeof reaction !== "string") {
        throw new ApiError(400, "Reaction is required");
    }

    const message = await Message.findById(messageId)
        .select("_id")
        .lean();

    if (!message) {
        throw new ApiError(404, "Message not found");
    }

   
    const messageReaction = await MessageReaction.findOneAndUpdate(
        {
            message: messageId,
            user: userId
        },
        {
            reaction: reaction.trim()
        },
        {
            new: true,
            upsert: true,
            runValidators: true
        }
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            messageReaction,
            "Reaction added successfully"
        )
    );
});

//=============================== removeReaction ===================================

const removeReaction = asyncHandler(async (req, res) => {

    const userId = req.user._id;
    const { messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw new ApiError(400, "Invalid message ID");
    }

    
    const message = await Message.findById(messageId)
        .select("_id")
        .lean();

    if (!message) {
        throw new ApiError(404, "Message not found");
    }

    
    const result = await MessageReaction.findOneAndDelete({
        message: messageId,
        user: userId
    });

    if (!result) {
        throw new ApiError(404, "Reaction not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                messageId,
                removedReaction: result.reaction
            },
            "Reaction removed successfully"
        )
    );
});

export {
    addReaction,
    removeReaction
};