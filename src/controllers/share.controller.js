import mongoose from "mongoose";

import { Share } from "../models/share.model.js";
import { Video } from "../models/video.model.js";
import { Notification } from "../models/notification.model.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isBlockedBetweenUsers } from "../utils/isBlockedBetweenUsers.js";
import { Message } from "../models/message.model.js";
import { Conversation } from "../models/conversation.model.js";
import { ConversationMember } from "../models/conversationMember.model.js";

//====================== shareVideo ========================//

const shareVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { shareType = "copy_link" } = req.body;

    if (!req.user?._id) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(
            400,
            "Invalid video ID"
        );
    }

    const allowedShareTypes = [
        "copy_link",
        "chat",
        "whatsapp",
        "facebook",
        "instagram",
        "telegram",
        "twitter",
        "other"
    ];

    if (!allowedShareTypes.includes(shareType)) {
        throw new ApiError(
            400,
            "Invalid share type"
        );
    }

    if (shareType === "chat") {
        throw new ApiError(
            400,
            "Use shareVideoToChat API for chat sharing"
        );
    }

    const video = await Video.findOne({
        _id: videoId,
        isPublished: true
    })
        .select(
            "_id owner title thumbnail isPublished"
        )
        .lean();

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
            "You cannot share this video"
        );
    }

    const share = await Share.create({
        owner: req.user._id,
        video: video._id,
        shareType,
        conversation: null
    });

    const shareCount = await Share.countDocuments({
        video: video._id
    });

    await share.populate([
        {
            path: "owner",
            select: "_id username fullName avatar"
        },
        {
            path: "video",
            select: "_id owner title thumbnail isPublished"
        }
    ]);

    if (
        video.owner &&
        video.owner.toString() !==
            req.user._id.toString()
    ) {
        try {
            await Notification.create({
                recipient: video.owner,
                actor: req.user._id,
                type: "system",
                title: "Video Shared",
                message: `${req.user.username} shared your video "${video.title}".`,
                entityType: "video",
                entityId: video._id,
                data: {
                    shareId: share._id,
                    videoId: video._id,
                    videoTitle: video.title,
                    videoThumbnail: video.thumbnail,
                    sharerId: req.user._id,
                    shareType,
                    shareCount,
                    action: "video_shared"
                }
            });
        } catch (error) {
            console.error(
                "Failed to create video share notification:",
                error.message
            );
        }
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                share: {
                    _id: share._id,
                    owner: share.owner,
                    video: share.video,
                    shareType: share.shareType,
                    conversation: share.conversation,
                    createdAt: share.createdAt,
                    updatedAt: share.updatedAt
                },
                shareCount
            },
            "Video shared successfully"
        )
    );
});

//======================  getVideoShareCount ========================//

const getVideoShareCount = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!req.user?._id) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(
            400,
            "Invalid video ID"
        );
    }

    const video = await Video.findOne({
        _id: videoId,
        isPublished: true
    })
        .select("_id owner isPublished")
        .lean();

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
            "You cannot view share count for this video"
        );
    }

    const shareCount = await Share.countDocuments({
        video: video._id
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                videoId: video._id,
                shareCount
            },
            "Share count fetched successfully"
        )
    );
});

//===================== shareVideoToChat =============================//

const shareVideoToChat = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { conversationId, content = "" } = req.body;

    if (!req.user?._id) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(
            400,
            "Invalid video ID"
        );
    }

    if (!mongoose.isValidObjectId(conversationId)) {
        throw new ApiError(
            400,
            "Invalid conversation ID"
        );
    }

    const video = await Video.findOne({
        _id: videoId,
        isPublished: true
    })
        .select(
            "_id owner title thumbnail videoFile videoPublicId isPublished"
        )
        .lean();

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
            "You cannot share this video"
        );
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    }).select(
        "_id participants type"
    );

    if (!conversation) {
        throw new ApiError(
            404,
            "Conversation not found"
        );
    }

    let isMember = false;

    if (conversation.type === "direct") {
        isMember = conversation.participants.some(
            (participant) =>
                participant.toString() ===
                req.user._id.toString()
        );
    } else {
        const member = await ConversationMember.findOne({
            conversation: conversationId,
            user: req.user._id,
            isActive: true
        }).select("_id");

        isMember = !!member;
    }

    if (!isMember) {
        throw new ApiError(
            403,
            "You are not a member of this conversation"
        );
    }

    const message = await Message.create({
        conversation: conversation._id,
        sender: req.user._id,
        type: "video",
        content: content.trim(),
        attachment: {
            url: video.videoFile,
            publicId: video.videoPublicId,
            fileName: video.title,
            mimeType: "video/mp4",
            size: null
        }
    });

    const share = await Share.create({
        owner: req.user._id,
        video: video._id,
        shareType: "chat",
        conversation: conversation._id
    });

    await Conversation.findByIdAndUpdate(
        conversation._id,
        {
            $set: {
                lastMessage: message._id,
                lastMessageAt: new Date()
            }
        }
    );

    await message.populate([
        {
            path: "sender",
            select: "_id username fullName avatar"
        },
        {
            path: "conversation",
            select: "_id type participants"
        }
    ]);

    const shareCount = await Share.countDocuments({
        video: video._id
    });

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                message,
                share,
                shareCount
            },
            "Video shared in chat successfully"
        )
    );
});

export {
    shareVideo,
       getVideoShareCount,
       shareVideoToChat
};