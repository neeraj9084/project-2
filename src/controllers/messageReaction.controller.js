import mongoose from "mongoose";

import { MessageReaction } from "../models/messageReaction.model.js";
import { Message } from "../models/message.model.js";
import { Conversation } from "../models/conversation.model.js";
import { ConversationMember } from "../models/conversationMember.model.js";
import { Notification } from "../models/notification.model.js";
import { isBlockedBetweenUsers } from "../utils/isBlockedBetweenUsers.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getVisibleMessage = async (messageId, userId) => {
    const message = await Message.findOne({
        _id: messageId,
        isDeleted: false
    }).select("_id sender conversation createdAt").lean();

    if (!message) {
        throw new ApiError(404, "Message not found");
    }

    const conversation = await Conversation.findOne({
        _id: message.conversation,
        isActive: true
    }).select("type participants directReadStatus").lean();

    if (!conversation) {
        throw new ApiError(404, "Message not found");
    }

    let clearedAt;

    if (conversation.type === "direct") {
        if (!conversation.participants.some((participant) => participant.equals(userId))) {
            throw new ApiError(403, "You are not a participant of this conversation");
        }

        const otherParticipant = conversation.participants.find(
            (participant) => !participant.equals(userId)
        );
        if (otherParticipant && await isBlockedBetweenUsers(userId, otherParticipant)) {
            throw new ApiError(403, "Conversation is not available");
        }

        clearedAt = conversation.directReadStatus.find(
            (status) => status.user.equals(userId)
        )?.clearedAt;
    } else if (conversation.type === "group") {
        const member = await ConversationMember.findOne({
            conversation: conversation._id,
            user: userId,
            isActive: true
        }).select("clearedAt").lean();

        if (!member) {
            throw new ApiError(403, "You are not a member of this conversation");
        }
        clearedAt = member.clearedAt;
    } else {
        throw new ApiError(403, "Conversation is not available");
    }

    if (clearedAt && message.createdAt <= clearedAt) {
        throw new ApiError(404, "Message not found");
    }

    return message;
};

//=============================== addReaction ===================================

const addReaction = asyncHandler(async (req, res) => {

    const userId = req.user._id;
    const { messageId } = req.params;
    const { reaction } = req.body;

    // Validate message ID
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw new ApiError(400, "Invalid message ID");
    }

    // Validate reaction
    if (!reaction || typeof reaction !== "string") {
        throw new ApiError(400, "Reaction is required");
    }

    const cleanReaction = reaction.trim();

    if (!cleanReaction) {
        throw new ApiError(400, "Reaction cannot be empty");
    }

    // Find message
    const message = await getVisibleMessage(messageId, userId);

    // Add / Update reaction
    const messageReaction = await MessageReaction.findOneAndUpdate(
        {
            message: messageId,
            user: userId
        },
        {
            reaction: cleanReaction
        },
        {
            new: true,
            upsert: true,
            runValidators: true
        }
    );

    // ====================== REACTION NOTIFICATION ======================

    // Don't notify when user reacts to their own message
    if (
        message.sender &&
        message.sender.toString() !== userId.toString()
    ) {
        try {
            await Notification.create({
                recipient: message.sender,
                actor: userId,
                type: "system",
                title: "Message Reaction",
                message: `${req.user.username} reacted ${cleanReaction} to your message`,
                entityType: "user",
                entityId: userId,
                data: {
                    messageId: message._id,
                    reactorId: userId,
                    reaction: cleanReaction,
                    action: "message_reaction"
                }
            });
        } catch (error) {
            console.error(
                "Failed to create message reaction notification:",
                error.message
            );
        }
    }

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

    // Validate message ID
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw new ApiError(400, "Invalid message ID");
    }

    // Check message exists
    await getVisibleMessage(messageId, userId);

    // Remove reaction
    const result = await MessageReaction.findOneAndDelete({
        message: messageId,
        user: userId
    });

    if (!result) {
        throw new ApiError(404, "Reaction not found");
    }

    // No notification when reaction is removed

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
