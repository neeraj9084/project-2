import mongoose from "mongoose";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

import { Message } from "../models/message.model.js";
import { Conversation } from "../models/conversation.model.js";
import { ConversationMember } from "../models/conversationMember.model.js";

// ====================== sendMessage ====================== //

const sendMessage = asyncHandler(async (req, res) => {

    const { conversationId } = req.params;

    const {
        type = "text",
        content = null,
        clientMessageId = null
    } = req.body;

    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new ApiError(
            400,
            "Invalid conversation ID"
        );
    }

    const allowedTypes = [
        "text",
        "image",
        "video",
        "audio",
        "file"
    ];

    if (!allowedTypes.includes(type)) {
        throw new ApiError(
            400,
            "Invalid message type"
        );
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    });

    if (!conversation) {
        throw new ApiError(
            404,
            "Conversation not found"
        );
    }

    if (conversation.type === "direct") {

        const isParticipant =
            conversation.participants.some(
                (participant) =>
                    participant.toString() ===
                    currentUserId.toString()
            );

        if (!isParticipant) {
            throw new ApiError(
                403,
                "You are not a participant of this conversation"
            );
        }

    } else if (conversation.type === "group") {

        const member =
            await ConversationMember.findOne({
                conversation: conversationId,
                user: currentUserId,
                isActive: true
            });

        if (!member) {
            throw new ApiError(
                403,
                "You are not a member of this conversation"
            );
        }

    } else {
        throw new ApiError(
            400,
            "Invalid conversation type"
        );
    }

    const trimmedContent =
        typeof content === "string"
            ? content.trim()
            : null;

   const file = req.files?.[0] || null;

    if (type === "text" && !trimmedContent) {
        throw new ApiError(
            400,
            "Message content is required for text message"
        );
    }

    const mediaTypes = [
        "image",
        "video",
        "audio",
        "file"
    ];

    if (mediaTypes.includes(type) && !file) {
        throw new ApiError(
            400,
            "File is required for this message type"
        );
    }

    let attachment = null;

    if (file) {

        const uploadedFile =
            await uploadOnCloudinary(file.path);

        if (!uploadedFile) {
            throw new ApiError(
                500,
                "File upload failed"
            );
        }

        attachment = {
            url: uploadedFile.secure_url,
            publicId: uploadedFile.public_id,
            fileName: file.originalname,
            mimeType: file.mimetype,
            size: file.size
        };
    }

    const cleanClientMessageId =
        typeof clientMessageId === "string"
            ? clientMessageId.trim()
            : null;

    const messageData = {
        conversation: conversationId,
        sender: currentUserId,
        type,
        content: trimmedContent,
        attachment
    };

    if (cleanClientMessageId) {
        messageData.clientMessageId =
            cleanClientMessageId;
    }

    const message = await Message.create(
        messageData
    );

    conversation.lastMessage =
        message._id;

    conversation.lastMessageAt =
        message.createdAt;

    await conversation.save();

    await message.populate(
        "sender",
        "username fullName avatar"
    );

    return res.status(201).json(
        new ApiResponse(
            201,
            message,
            "Message sent successfully"
        )
    );
});

//======================= get_messages =======================//

const getMessages = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;

    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new ApiError(
            400,
            "Invalid conversation ID"
        );
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    });

    if (!conversation) {
        throw new ApiError(
            404,
            "Conversation not found"
        );
    }

    if (conversation.type === "direct") {

        const isParticipant =
            conversation.participants.some(
                (participant) =>
                    participant.toString() ===
                    currentUserId.toString()
            );

        if (!isParticipant) {
            throw new ApiError(
                403,
                "You are not a participant of this conversation"
            );
        }

    } else if (conversation.type === "group") {

        const member =
            await ConversationMember.findOne({
                conversation: conversationId,
                user: currentUserId,
                isActive: true
            });

        if (!member) {
            throw new ApiError(
                403,
                "You are not a member of this conversation"
            );
        }

    } else {
        throw new ApiError(
            400,
            "Invalid conversation type"
        );
    }

    const page = Math.max(
        parseInt(req.query.page) || 1,
        1
    );

    const limit = Math.min(
        parseInt(req.query.limit) || 30,
        50
    );

    const skip = (page - 1) * limit;

    const [messages, totalMessages] =
        await Promise.all([
            Message.find({
                conversation: conversationId
            })
                .populate(
                    "sender",
                    "username fullName avatar"
                )
                .sort({
                    createdAt: -1
                })
                .skip(skip)
                .limit(limit)
                .lean(),

            Message.countDocuments({
                conversation: conversationId
            })
        ]);

    const totalPages = Math.ceil(
        totalMessages / limit
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                messages: messages.reverse(),

                pagination: {
                    currentPage: page,
                    limit,
                    totalMessages,
                    totalPages,
                    hasNextPage:
                        page < totalPages,
                    hasPreviousPage:
                        page > 1
                }
            },
            "Messages fetched successfully"
        )
    );
});

//======================= editMessage ========================//

const editMessage = asyncHandler(async (req, res) => {

    const { messageId } = req.params;

    const { content } = req.body;

    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw new ApiError(
            400,
            "Invalid message ID"
        );
    }

    const message = await Message.findOne({
        _id: messageId,
        sender: currentUserId,
        isDeleted: false
    });

    if (!message) {
        throw new ApiError(
            404,
            "Message not found or you are not the sender"
        );
    }

    if (message.type !== "text") {
        throw new ApiError(
            400,
            "Only text messages can be edited"
        );
    }

    if (
        typeof content !== "string" ||
        !content.trim()
    ) {
        throw new ApiError(
            400,
            "Message content cannot be empty"
        );
    }

    const trimmedContent = content.trim();

    message.content = trimmedContent;
    message.isEdited = true;
    message.editedAt = new Date();

    await message.save();

    await message.populate(
        "sender",
        "username fullName avatar"
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            message,
            "Message updated successfully"
        )
    );
});

//======================= deleteMessage ========================//

const deleteMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw new ApiError(
            400,
            "Invalid message ID"
        );
    }

    const message = await Message.findOne({
        _id: messageId,
        sender: currentUserId
    });

    if (!message) {
        throw new ApiError(
            404,
            "Message not found or you are not the sender"
        );
    }

    await Message.findByIdAndDelete(messageId);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                messageId
            },
            "Message deleted successfully"
        )
    );
});

//==================== markMessageAsRead ==========================//

const markMessageAsRead = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;

    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new ApiError(400, "Invalid conversation ID");
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    });

    if (!conversation) {
        throw new ApiError(404, "Conversation not found");
    }

    const now = new Date();

    if (conversation.type === "direct") {
        const isParticipant = conversation.participants.some(
            (participant) =>
                participant.toString() === currentUserId.toString()
        );

        if (!isParticipant) {
            throw new ApiError(
                403,
                "You are not a participant of this conversation"
            );
        }

        const readStatus = conversation.directReadStatus.find(
            (item) =>
                item.user.toString() === currentUserId.toString()
        );

        if (readStatus) {
            readStatus.lastReadAt = now;
        } else {
            conversation.directReadStatus.push({
                user: currentUserId,
                lastReadAt: now
            });
        }

        await conversation.save();

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    conversationId,
                    lastReadAt: now
                },
                "Messages marked as read"
            )
        );
    }

    if (conversation.type === "group") {
        const member = await ConversationMember.findOne({
            conversation: conversationId,
            user: currentUserId,
            isActive: true
        });

        if (!member) {
            throw new ApiError(
                403,
                "You are not a member of this conversation"
            );
        }

        member.lastReadAt = now;

        await member.save();

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    conversationId,
                    lastReadAt: member.lastReadAt
                },
                "Messages marked as read"
            )
        );
    }

    throw new ApiError(
        400,
        "Invalid conversation type"
    );
});

//==================== getUnreadMessageCount ==========================//

const getUnreadMessageCount = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;

    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new ApiError(
            400,
            "Invalid conversation ID"
        );
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    });

    if (!conversation) {
        throw new ApiError(
            404,
            "Conversation not found"
        );
    }

    let lastReadAt = null;

    if (conversation.type === "direct") {
        const isParticipant =
            conversation.participants.some(
                (participant) =>
                    participant.toString() ===
                    currentUserId.toString()
            );

        if (!isParticipant) {
            throw new ApiError(
                403,
                "You are not a participant of this conversation"
            );
        }

        const readStatus =
            conversation.directReadStatus.find(
                (item) =>
                    item.user.toString() ===
                    currentUserId.toString()
            );

        if (readStatus) {
            lastReadAt = readStatus.lastReadAt;
        }
    }

    else if (conversation.type === "group") {
        const member =
            await ConversationMember.findOne({
                conversation: conversationId,
                user: currentUserId,
                isActive: true
            }).select("lastReadAt");

        if (!member) {
            throw new ApiError(
                403,
                "You are not a member of this conversation"
            );
        }

        lastReadAt = member.lastReadAt;
    }

    else {
        throw new ApiError(
            400,
            "Invalid conversation type"
        );
    }

    const messageFilter = {
        conversation: conversationId,
        sender: {
            $ne: currentUserId
        },
        isDeleted: false
    };

    if (lastReadAt) {
        messageFilter.createdAt = {
            $gt: lastReadAt
        };
    }

    const unreadCount =
        await Message.countDocuments(messageFilter);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                conversationId,
                unreadCount,
                lastReadAt
            },
            "Unread message count fetched successfully"
        )
    );
});

//===================== searchMessages ==========================//

const searchMessages = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;

    const {
        query,
        page = 1,
        limit = 20
    } = req.query;

    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new ApiError(
            400,
            "Invalid conversation ID"
        );
    }

    if (
        typeof query !== "string" ||
        !query.trim()
    ) {
        throw new ApiError(
            400,
            "Search query is required"
        );
    }

    const searchQuery = query.trim();

    if (searchQuery.length < 2) {
        throw new ApiError(
            400,
            "Search query must be at least 2 characters"
        );
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    });

    if (!conversation) {
        throw new ApiError(
            404,
            "Conversation not found"
        );
    }

    if (conversation.type === "direct") {
        const isParticipant =
            conversation.participants.some(
                (participant) =>
                    participant.toString() ===
                    currentUserId.toString()
            );

        if (!isParticipant) {
            throw new ApiError(
                403,
                "You are not a participant of this conversation"
            );
        }
    } else if (conversation.type === "group") {
        const member =
            await ConversationMember.findOne({
                conversation: conversationId,
                user: currentUserId,
                isActive: true
            });

        if (!member) {
            throw new ApiError(
                403,
                "You are not a member of this conversation"
            );
        }
    } else {
        throw new ApiError(
            400,
            "Invalid conversation type"
        );
    }

    const currentPage = Math.max(
        parseInt(page) || 1,
        1
    );

    const currentLimit = Math.min(
        Math.max(parseInt(limit) || 20, 1),
        50
    );

    const skip =
        (currentPage - 1) * currentLimit;

    const searchFilter = {
        conversation: conversationId,
        isDeleted: false,
        content: {
            $regex: searchQuery,
            $options: "i"
        }
    };

    const [
        messages,
        totalMessages
    ] = await Promise.all([
        Message.find(searchFilter)
            .populate(
                "sender",
                "username fullName avatar"
            )
            .sort({
                createdAt: -1
            })
            .skip(skip)
            .limit(currentLimit)
            .lean(),

        Message.countDocuments(searchFilter)
    ]);

    const totalPages = Math.ceil(
        totalMessages / currentLimit
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                query: searchQuery,
                messages,
                pagination: {
                    currentPage,
                    limit: currentLimit,
                    totalMessages,
                    totalPages,
                    hasNextPage:
                        currentPage < totalPages,
                    hasPreviousPage:
                        currentPage > 1
                }
            },
            "Messages searched successfully"
        )
    );
});

//===================== replyToMessage ==========================//

const replyToMessage = asyncHandler(async (req, res) => {

    const { conversationId } = req.params;

    const {
        type = "text",
        content = null,
        clientMessageId = null,
        replyTo
    } = req.body;

    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new ApiError(
            400,
            "Invalid conversation ID"
        );
    }

    if (
        !replyTo ||
        !mongoose.Types.ObjectId.isValid(replyTo)
    ) {
        throw new ApiError(
            400,
            "Valid reply message ID is required"
        );
    }

    const allowedTypes = [
        "text",
        "image",
        "video",
        "audio",
        "file"
    ];

    if (!allowedTypes.includes(type)) {
        throw new ApiError(
            400,
            "Invalid message type"
        );
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    });

    if (!conversation) {
        throw new ApiError(
            404,
            "Conversation not found"
        );
    }

    if (conversation.type === "direct") {

        const isParticipant =
            conversation.participants.some(
                (participant) =>
                    participant.toString() ===
                    currentUserId.toString()
            );

        if (!isParticipant) {
            throw new ApiError(
                403,
                "You are not a participant of this conversation"
            );
        }

    } else if (conversation.type === "group") {

        const member =
            await ConversationMember.findOne({
                conversation: conversationId,
                user: currentUserId,
                isActive: true
            });

        if (!member) {
            throw new ApiError(
                403,
                "You are not a member of this conversation"
            );
        }

    } else {
        throw new ApiError(
            400,
            "Invalid conversation type"
        );
    }

    const repliedMessage = await Message.findOne({
        _id: replyTo,
        conversation: conversationId,
        isDeleted: false
    });

    if (!repliedMessage) {
        throw new ApiError(
            404,
            "Reply message not found"
        );
    }

    const trimmedContent =
        typeof content === "string"
            ? content.trim()
            : null;

    if (type === "text" && !trimmedContent) {
        throw new ApiError(
            400,
            "Message content is required for text message"
        );
    }

    const messageData = {
        conversation: conversationId,
        sender: currentUserId,
        type,
        content: trimmedContent,
        replyTo
    };

    const cleanClientMessageId =
        typeof clientMessageId === "string"
            ? clientMessageId.trim()
            : null;

    if (cleanClientMessageId) {
        messageData.clientMessageId =
            cleanClientMessageId;
    }

    const message = await Message.create(
        messageData
    );

    conversation.lastMessage =
        message._id;

    conversation.lastMessageAt =
        message.createdAt;

    await conversation.save();

    await message.populate([
        {
            path: "sender",
            select: "username fullName avatar"
        },
        {
            path: "replyTo",
            populate: {
                path: "sender",
                select: "username fullName avatar"
            }
        }
    ]);

    return res.status(201).json(
        new ApiResponse(
            201,
            message,
            "Reply message sent successfully"
        )
    );
});

//===================== forwardMessage ==========================//

const forwardMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;

    const {
        conversationId,
        clientMessageId = null
    } = req.body;

    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw new ApiError(
            400,
            "Invalid message ID"
        );
    }

    if (
        !conversationId ||
        !mongoose.Types.ObjectId.isValid(conversationId)
    ) {
        throw new ApiError(
            400,
            "Invalid conversation ID"
        );
    }

    const sourceMessage = await Message.findOne({
        _id: messageId,
        isDeleted: false
    });

    if (!sourceMessage) {
        throw new ApiError(
            404,
            "Message not found"
        );
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    });

    if (!conversation) {
        throw new ApiError(
            404,
            "Conversation not found"
        );
    }

    if (conversation.type === "direct") {
        const isParticipant =
            conversation.participants.some(
                (participant) =>
                    participant.toString() ===
                    currentUserId.toString()
            );

        if (!isParticipant) {
            throw new ApiError(
                403,
                "You are not a participant of this conversation"
            );
        }
    } else if (conversation.type === "group") {
        const member =
            await ConversationMember.findOne({
                conversation: conversationId,
                user: currentUserId,
                isActive: true
            });

        if (!member) {
            throw new ApiError(
                403,
                "You are not a member of this conversation"
            );
        }
    } else {
        throw new ApiError(
            400,
            "Invalid conversation type"
        );
    }

    const messageData = {
        conversation: conversationId,
        sender: currentUserId,
        type: sourceMessage.type,
        content: sourceMessage.content,
        forwardedFrom: sourceMessage._id
    };

    if (sourceMessage.attachment) {
        messageData.attachment = {
            url: sourceMessage.attachment.url,
            publicId: sourceMessage.attachment.publicId,
            fileName: sourceMessage.attachment.fileName,
            mimeType: sourceMessage.attachment.mimeType,
            size: sourceMessage.attachment.size
        };
    }

    const cleanClientMessageId =
        typeof clientMessageId === "string"
            ? clientMessageId.trim()
            : null;

    if (cleanClientMessageId) {
        messageData.clientMessageId =
            cleanClientMessageId;
    }

    const forwardedMessage =
        await Message.create(messageData);

    conversation.lastMessage =
        forwardedMessage._id;

    conversation.lastMessageAt =
        forwardedMessage.createdAt;

    await conversation.save();

    await forwardedMessage.populate([
        {
            path: "sender",
            select: "username fullName avatar"
        },
        {
            path: "forwardedFrom",
            populate: {
                path: "sender",
                select: "username fullName avatar"
            }
        }
    ]);

    return res.status(201).json(
        new ApiResponse(
            201,
            forwardedMessage,
            "Message forwarded successfully"
        )
    );
});

//===================== clearChat ==========================//

const clearChat = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;

    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new ApiError(
            400,
            "Invalid conversation ID"
        );
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    });

    if (!conversation) {
        throw new ApiError(
            404,
            "Conversation not found"
        );
    }

    if (conversation.type === "direct") {
        const isParticipant =
            conversation.participants.some(
                (participant) =>
                    participant.toString() ===
                    currentUserId.toString()
            );

        if (!isParticipant) {
            throw new ApiError(
                403,
                "You are not a participant of this conversation"
            );
        }
    } else if (conversation.type === "group") {
        const member =
            await ConversationMember.findOne({
                conversation: conversationId,
                user: currentUserId,
                isActive: true
            });

        if (!member) {
            throw new ApiError(
                403,
                "You are not a member of this conversation"
            );
        }
    } else {
        throw new ApiError(
            400,
            "Invalid conversation type"
        );
    }

    const result = await Message.deleteMany({
        conversation: conversationId
    });

    conversation.lastMessage = null;
    conversation.lastMessageAt = null;

    await conversation.save();

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                conversationId,
                deletedMessages: result.deletedCount
            },
            "Chat cleared successfully"
        )
    );
});

export {
    sendMessage,
    getMessages,
    editMessage,
    deleteMessage,
    markMessageAsRead,
    getUnreadMessageCount,
    searchMessages,
    replyToMessage,
    forwardMessage,
    clearChat

};