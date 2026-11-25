import mongoose from "mongoose";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

import { Message } from "../models/message.model.js";
import { Conversation } from "../models/conversation.model.js";
import { ConversationMember } from "../models/conversationMember.model.js";
import { isBlockedBetweenUsers } from "../utils/isBlockedBetweenUsers.js";
import { Notification } from "../models/notification.model.js";
import { videoUploadIdentity, registerVideoMedia, queueVideoMedia } from "../services/videoAssetRegistry.service.js";
import { verifiedAttachment, retireMessageAttachment } from "../services/messageAttachmentRegistry.service.js";
import { registerAssetReference } from "../services/cloudinaryAssetReference.service.js";

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

const otherParticipant = conversation.participants.find(
    (participant) =>
        participant.toString() !== currentUserId.toString()
);

if (otherParticipant) {
    const blocked = await isBlockedBetweenUsers(
        currentUserId,
        otherParticipant
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot send messages to this user"
        );
    }
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
    let uploadedFile = null;
    let metadata = null;
    const newMessageId = new mongoose.Types.ObjectId();

    if (file) {

        uploadedFile =
            await uploadOnCloudinary(file.path);

        if (!uploadedFile) {
            throw new ApiError(
                500,
                "File upload failed"
            );
        }

        try {
            if (!["image", "video", "raw"].includes(uploadedFile.resource_type)) throw new Error("Invalid resource type");
            metadata = videoUploadIdentity(uploadedFile, uploadedFile.resource_type);
        } catch (error) {
            try { await queueVideoMedia({ metadata: { url: uploadedFile.secure_url, publicId: uploadedFile.public_id,
                resourceType: uploadedFile.resource_type, deliveryType: uploadedFile.type }, kind: "attachment",
                videoId: newMessageId, owner: currentUserId, suffix: "failed-upload" }); }
            catch (queueError) { console.error("Failed to queue attachment:", queueError); }
            throw error;
        }
        attachment = {
            url: uploadedFile.secure_url,
            publicId: uploadedFile.public_id,
            resourceType: uploadedFile.resource_type || null,
            deliveryType: uploadedFile.type || null,
            fileName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            mediaRegistry: metadata
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

    let message;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            if (metadata) await registerVideoMedia({ metadata, kind: "attachment", videoId: newMessageId, owner: currentUserId, session });
            [message] = await Message.create([{ ...messageData, _id: newMessageId }], { session });
            const updated = await Conversation.updateOne({ _id: conversationId, isActive: true },
                { $set: { lastMessage: message._id, lastMessageAt: message.createdAt } }, { session });
            if (!updated.matchedCount) throw new ApiError(404, "Conversation not found");
        });
    } catch (error) {
        if (metadata) try { await queueVideoMedia({ metadata, kind: "attachment", videoId: newMessageId,
            owner: currentUserId, suffix: "failed-upload" }); }
        catch (queueError) { console.error("Failed to queue attachment:", queueError); }
        throw error;
    } finally { await session.endSession(); }
    message = await Message.findById(newMessageId);
  

try {

    if (conversation.type === "direct") {
        const recipientId = conversation.participants.find(
            (participant) =>
                participant.toString() !== currentUserId.toString()
        );

        if (recipientId) {
            await Notification.create({
                recipient: recipientId,
                actor: currentUserId,
                type: "system",
                title: "New Message",
                message:
                    type === "text"
                        ? `${req.user.username} sent you a message`
                        : `${req.user.username} sent you a ${type}`,
                entityType: "user",
                entityId: currentUserId,
                data: {
                    conversationId: conversation._id,
                    messageId: message._id,
                    senderId: currentUserId,
                    messageType: type,
                    action: "new_message"
                }
            });
        }
    }

    if (conversation.type === "group") {
        const members = await ConversationMember.find({
            conversation: conversation._id,
            isActive: true,
            user: { $ne: currentUserId }
        }).select("user");

        if (members.length > 0) {
            const notifications = members.map((member) => ({
                recipient: member.user,
                actor: currentUserId,
                type: "system",
                title: "New Group Message",
                message:
                    type === "text"
                        ? `${req.user.username} sent a message in the group`
                        : `${req.user.username} sent a ${type} in the group`,
                entityType: "user",
                entityId: currentUserId,
                data: {
                    conversationId: conversation._id,
                    messageId: message._id,
                    senderId: currentUserId,
                    messageType: type,
                    action: "new_group_message"
                }
            }));

            await Notification.insertMany(notifications);
        }
    }
} catch (error) {
    console.error(
        "Failed to create message notification:",
        error.message
    );
}

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

    let clearedAt = null;

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

        const otherParticipant =
            conversation.participants.find(
                (participant) =>
                    participant.toString() !==
                    currentUserId.toString()
            );

        if (otherParticipant) {
            const blocked = await isBlockedBetweenUsers(
                currentUserId,
                otherParticipant
            );

            if (blocked) {
                throw new ApiError(
                    403,
                    "Conversation is not available"
                );
            }
        }

        const readStatus = conversation.directReadStatus.find(
            (item) =>
                item.user.toString() === currentUserId.toString()
        );

        clearedAt = readStatus?.clearedAt || null;

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

        clearedAt = member.clearedAt || null;

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
                conversation: conversationId,
                ...(clearedAt && {
                    createdAt: { $gt: clearedAt }
                })
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
                conversation: conversationId,
                ...(clearedAt && {
                    createdAt: { $gt: clearedAt }
                })
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

    const conversation = await Conversation.findOne({
        _id: message.conversation,
        isActive: true
    });

    if (!conversation) {
        throw new ApiError(
            404,
            "Conversation not found"
        );
    }

    if (conversation.type === "direct") {

        const otherParticipant =
            conversation.participants.find(
                (participant) =>
                    participant.toString() !==
                    currentUserId.toString()
            );

        if (otherParticipant) {
            const blocked = await isBlockedBetweenUsers(
                currentUserId,
                otherParticipant
            );

            if (blocked) {
                throw new ApiError(
                    403,
                    "Conversation is not available"
                );
            }
        }
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

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const message = await Message.findOne({ _id: messageId, sender: currentUserId })
                .select("+attachment.mediaRegistry").session(session).lean();
            if (!message) throw new ApiError(404, "Message not found or you are not the sender");
            await retireMessageAttachment(message, { session });
            await Message.deleteOne({ _id: messageId, sender: currentUserId }, { session });
        });
    } finally { await session.endSession(); }

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
            lastReadAt = [readStatus.lastReadAt, readStatus.clearedAt]
                .filter(Boolean).sort((a, b) => b - a)[0] || null;
        }

        const otherParticipant =
    conversation.participants.find(
        (participant) =>
            participant.toString() !==
            currentUserId.toString()
    );

if (otherParticipant) {
    const blocked = await isBlockedBetweenUsers(
        currentUserId,
        otherParticipant
    );

    if (blocked) {
        throw new ApiError(
            403,
            "Conversation is not available"
        );
    }
        }
    } else if (conversation.type === "group") {
        const member =
            await ConversationMember.findOne({
                conversation: conversationId,
                user: currentUserId,
                isActive: true
            }).select("lastReadAt clearedAt");

        if (!member) {
            throw new ApiError(
                403,
                "You are not a member of this conversation"
            );
        }

        lastReadAt = [member.lastReadAt, member.clearedAt]
            .filter(Boolean).sort((a, b) => b - a)[0] || null;
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

    let clearedAt = null;

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
const otherParticipant =
    conversation.participants.find(
        (participant) =>
            participant.toString() !==
            currentUserId.toString()
    );

if (otherParticipant) {
    const blocked = await isBlockedBetweenUsers(
        currentUserId,
        otherParticipant
    );

    if (blocked) {
        throw new ApiError(
            403,
            "Conversation is not available"
        );
    }
}

        const readStatus = conversation.directReadStatus.find(
            (item) =>
                item.user.toString() === currentUserId.toString()
        );

        clearedAt = readStatus?.clearedAt || null;

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

        clearedAt = member.clearedAt || null;
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

    if (clearedAt) {
        searchFilter.createdAt = { $gt: clearedAt };
    }

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

        const otherParticipant =
            conversation.participants.find(
                (participant) =>
                    participant.toString() !==
                    currentUserId.toString()
            );

        if (otherParticipant) {
            const blocked = await isBlockedBetweenUsers(
                currentUserId,
                otherParticipant
            );

            if (blocked) {
                throw new ApiError(
                    403,
                    "Conversation is not available"
                );
            }
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

    const sourceConversation = await Conversation.findOne({
        _id: sourceMessage.conversation,
        isActive: true
    });

    if (!sourceConversation) {
        throw new ApiError(404, "Message not found");
    }

    let clearedAt;

    if (sourceConversation.type === "direct") {
        const isParticipant = sourceConversation.participants.some(
            (participant) => participant.toString() === currentUserId.toString()
        );

        if (!isParticipant) {
            throw new ApiError(403, "You are not a participant of this conversation");
        }

        const otherParticipant = sourceConversation.participants.find(
            (participant) => participant.toString() !== currentUserId.toString()
        );

        if (otherParticipant && await isBlockedBetweenUsers(currentUserId, otherParticipant)) {
            throw new ApiError(403, "Conversation is not available");
        }

        clearedAt = sourceConversation.directReadStatus.find(
            (status) => status.user.toString() === currentUserId.toString()
        )?.clearedAt;
    } else if (sourceConversation.type === "group") {
        const member = await ConversationMember.findOne({
            conversation: sourceConversation._id,
            user: currentUserId,
            isActive: true
        }).select("clearedAt");

        if (!member) {
            throw new ApiError(403, "You are not a member of this conversation");
        }

        clearedAt = member.clearedAt;
    } else {
        throw new ApiError(403, "Conversation is not available");
    }

    if (clearedAt && sourceMessage.createdAt <= clearedAt) {
        throw new ApiError(404, "Message not found");
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

        const otherParticipant =
            conversation.participants.find(
                (participant) =>
                    participant.toString() !==
                    currentUserId.toString()
            );

        if (otherParticipant) {
            const blocked = await isBlockedBetweenUsers(
                currentUserId,
                otherParticipant
            );

            if (blocked) {
                throw new ApiError(
                    403,
                    "Conversation is not available"
                );
            }
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
            resourceType: sourceMessage.attachment.resourceType,
            deliveryType: sourceMessage.attachment.deliveryType,
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

    let forwardedMessage;
    const forwardedId = new mongoose.Types.ObjectId();
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const currentSource = await Message.findOne({ _id: sourceMessage._id, isDeleted: false })
                .select("+attachment.mediaRegistry").session(session).lean();
            if (!currentSource || String(currentSource.conversation) !== String(sourceMessage.conversation) ||
                (clearedAt && currentSource.createdAt <= clearedAt)) throw new ApiError(404, "Message not found");
            if (currentSource.attachment) {
                const metadata = verifiedAttachment(currentSource.attachment);
                if (!metadata) throw new ApiError(409, "Attachment identity requires verification before forwarding");
                await registerAssetReference({ assetId: metadata.asset, sourceType: "attachment", sourceId: forwardedId,
                    userId: currentUserId, session });
                messageData.attachment = { ...currentSource.attachment, mediaRegistry: metadata };
            } else if (sourceMessage.attachment) throw new ApiError(404, "Message not found");
            [forwardedMessage] = await Message.create([{ ...messageData, _id: forwardedId }], { session });
            const updated = await Conversation.updateOne({ _id: conversationId, isActive: true },
                { $set: { lastMessage: forwardedId, lastMessageAt: forwardedMessage.createdAt } }, { session });
            if (!updated.matchedCount) throw new ApiError(404, "Conversation not found");
        });
    } finally { await session.endSession(); }
    forwardedMessage = await Message.findById(forwardedId);

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

    const clearedAt = new Date();

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

        const readStatus = conversation.directReadStatus.find(
            (item) =>
                item.user.toString() === currentUserId.toString()
        );

        if (readStatus) {
            readStatus.lastReadAt = clearedAt;
            readStatus.clearedAt = clearedAt;
        } else {
            conversation.directReadStatus.push({
                user: currentUserId,
                lastReadAt: clearedAt,
                clearedAt
            });
        }

        await conversation.save();
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

        member.lastReadAt = clearedAt;
        member.clearedAt = clearedAt;

        await member.save();
    } else {
        throw new ApiError(
            400,
            "Invalid conversation type"
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                conversationId,
                clearedAt
            },
            "Chat cleared for you successfully"
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
