import mongoose from "mongoose";
import { retireMessageAttachment } from "../services/messageAttachmentRegistry.service.js";
import { retireGroupAvatar } from "../services/groupAvatarRegistry.service.js";
import { Conversation } from "../models/conversation.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Message } from "../models/message.model.js";
import { ConversationMember } from "../models/conversationMember.model.js";
import { MessageReaction } from "../models/messageReaction.model.js";
import { Share } from "../models/share.model.js";
import { isBlockedBetweenUsers } from "../utils/isBlockedBetweenUsers.js";

const hideClearedPreview = (conversation, clearedAt) => {
    const result = conversation.toObject();
    if (clearedAt && result.lastMessageAt && result.lastMessageAt <= clearedAt) {
        result.lastMessage = null;
        result.lastMessageAt = null;
    }
    return result;
};

const getClearedAt = async (conversation, userId) => {
    if (conversation.type === "group") {
        const member = await ConversationMember.findOne({
            conversation: conversation._id, user: userId, isActive: true
        }).select("clearedAt");
        if (!member) throw new ApiError(403, "You are not a member of this conversation");
        return member.clearedAt;
    }
    return conversation.directReadStatus.find(
        (status) => status.user.toString() === userId.toString()
    )?.clearedAt;
};

//===================== createDirectConversation =========================//

const createDirectConversation = asyncHandler(async (req, res) => {

    const { participantId } = req.body;

    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    if (!participantId) {
        throw new ApiError(
            400,
            "Participant ID is required"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(participantId)) {
        throw new ApiError(
            400,
            "Invalid participant ID"
        );
    }

    if (
        currentUserId.toString() ===
        participantId.toString()
    ) {
        throw new ApiError(
            400,
            "You cannot create a conversation with yourself"
        );
    }

    const user = await User.findOne({
        _id: participantId,
        isActive: true
    }).select("_id");

    if (!user) {
        throw new ApiError(
            404,
            "Participant not found or inactive"
        );
    }

    const blocked = await isBlockedBetweenUsers(
        currentUserId,
        participantId
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot access this conversation"
        );
    }

    const existingConversation =
        await Conversation.findOne({
            type: "direct",
            isActive: true,
            participants: {
                $all: [
                    currentUserId,
                    participantId
                ]
            }
        });

    if (existingConversation) {
        const status = existingConversation.directReadStatus.find(
            (item) => item.user.toString() === currentUserId.toString()
        );
        if (status?.isHidden) {
            status.isHidden = false;
            await existingConversation.save();
        }
        return res.status(200).json(
            new ApiResponse(
                200,
                hideClearedPreview(existingConversation, await getClearedAt(existingConversation, currentUserId)),
                "Direct conversation already exists"
            )
        );
    }

    const conversation =
        await Conversation.create({
            participants: [
                currentUserId,
                participantId
            ],
            type: "direct",
            name: null,
            avatar: null,
            createdBy: currentUserId
        });

    return res.status(201).json(
        new ApiResponse(
            201,
            conversation,
            "Direct conversation created successfully"
        )
    );
});

//======================= getUserConversation =========================//

const getUserConversation = asyncHandler(async(req, res) => {

    const userId = req.user?._id;

    if(!userId){
        throw new ApiError(400, "Unauthorizedrequest")
    }

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);

   const skip = (page - 1) * limit;

   const archived = req.query.archived === "true";

   const memberships = await ConversationMember.find({
    user: userId, isActive: true, isHidden: { $ne: true }, isArchived: archived ? true : { $ne: true }
   }).select("conversation").lean();
   const filter = {
    isActive: true,
    $or: [
        { type: "direct", participants: userId, $and: [
            { directReadStatus: { $not: { $elemMatch: { user: userId, isHidden: true } } } },
            archived ? { directReadStatus: { $elemMatch: { user: userId, isArchived: true } } }
                : { directReadStatus: { $not: { $elemMatch: { user: userId, isArchived: true } } } }
        ] },
        { type: "group", _id: { $in: memberships.map((member) => member.conversation) } }
    ]
   };
   const conversation = await Conversation.find(filter)
   .populate(
    "participants",
    "username fullname avatar isActive"
   )
   .populate(
    "lastMessage",
    "content sender type createdAt"
   )
   .sort({
    lastMessageAt: -1
   })
   .skip(skip)
   .limit(limit)

   const total = await Conversation.countDocuments(filter)

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                conversation: (await Promise.all(conversation.map(async (item) => {
                    if (item.type === "group") {
                        const member = await ConversationMember.findOne({
                            conversation: item._id, user: userId, isActive: true
                        }).select("clearedAt");
                        return member ? hideClearedPreview(item, member.clearedAt) : null;
                    }
                    return hideClearedPreview(item, await getClearedAt(item, userId));
                }))).filter(Boolean),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                    hasNextPage: page * limit < total,
                    hasPreviousPage: page > 1
                }
            },
            "Conversations fetched successfully"
        )
    );
})

//====================== getConversationById =========================//

const getConversationById = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new ApiError(400, "Invalid conversation ID");
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    })
        .populate(
            "participants",
            "username fullName avatar isActive"
        )
        .populate(
            "lastMessage",
            "content sender type createdAt"
        );

    if (!conversation) {
        throw new ApiError(404, "Conversation not found");
    }

    if (conversation.type === "direct") {
        if (!conversation.participants.some((participant) => participant._id.toString() === userId.toString())) throw new ApiError(404, "Conversation not found");
        const otherParticipant = conversation.participants.find(
            (participant) =>
                participant._id.toString() !== userId.toString()
        );

        if (otherParticipant) {
            const blocked = await isBlockedBetweenUsers(
                userId,
                otherParticipant._id
            );

            if (blocked) {
                throw new ApiError(
                    403,
                    "Conversation is not available"
                );
            }
        }
    } else if (conversation.type === "group") {
        if (!await ConversationMember.exists({ conversation: conversationId, user: userId, isActive: true })) throw new ApiError(404, "Conversation not found");
    } else throw new ApiError(404, "Conversation not found");

    return res.status(200).json(
        new ApiResponse(
            200,
            hideClearedPreview(conversation, await getClearedAt(conversation, userId)),
            "Conversation fetched successfully"
        )
    );
});

//===================== findDirectConversation =============================//

const findDirectConversation = asyncHandler(async (req, res) => {

    const { userId } = req.params;

    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(401, "Unauthorized request");
    }

    if(!mongoose.Types.ObjectId.isValid(userId)){
        throw new ApiError(400, "Invalid user ID");
    }

    if(currentUserId.toString() === userId){
        throw new ApiError(400, "Cannot find conversation with yourself");
    }

    const user = await User.findOne({
        _id: userId,
        isActive: true
    }).select("_id");

    if(!user){
        throw new ApiError(404, "User not found or inactive");
    }

    const blocked = await isBlockedBetweenUsers(
    currentUserId,
    userId
);

if (blocked) {
    throw new ApiError(
        403,
        "You cannot access this conversation"
    );
}

    const conversation = await Conversation.findOne({
        type: "direct",
        participants: { 
            $all: [currentUserId, userId],
            $size: 2
        },      
        isActive: true
    })
    .populate(  
        "participants",
        "username fullName avatar isActive"
    )
    .populate(
        "lastMessage",
        "content sender type createdAt"
    );

    if(!conversation){
        throw new ApiError(404, "Conversation not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,        
            hideClearedPreview(conversation, await getClearedAt(conversation, currentUserId)),
            "Direct conversation fetched successfully"
        )
    );
});

//===================== delete conversation =============================//

const deleteConversation = asyncHandler(async (req, res) => {

    const { conversationId } = req.params;  

    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(401, "Unauthorized request");
    }

    if(!mongoose.Types.ObjectId.isValid(conversationId)){
        throw new ApiError(400, "Invalid conversation ID");
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    }); 

    if(!conversation){  
        throw new ApiError(404, "Conversation not found");
    }

    let responseMessage = "Conversation hidden successfully";
    if (conversation.type === "direct") {
        if (!conversation.participants.some((participant) => participant.equals(currentUserId))) throw new ApiError(404, "Conversation not found");
        const now = new Date();
        const status = conversation.directReadStatus.find(
            (item) => item.user.toString() === currentUserId.toString()
        );
        if (status) {
            status.isHidden = true;
            status.clearedAt = now;
            status.lastReadAt = now;
        } else {
            conversation.directReadStatus.push({
                user: currentUserId, isHidden: true, clearedAt: now, lastReadAt: now
            });
        }
        await conversation.save();
    } else if (conversation.type === "group") {
        const member = await ConversationMember.findOne({
            conversation: conversationId, user: currentUserId, isActive: true
        });
        if (!member) {
            throw new ApiError(403, "You are not an active member of this conversation");
        }

        if (!conversation.createdBy.equals(currentUserId)) {
            member.isHidden = true;
            await member.save();
        } else {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    const activeMember = await ConversationMember.exists({
                        conversation: conversationId, user: currentUserId, isActive: true
                    }).session(session);
                    if (!activeMember) {
                        throw new ApiError(403, "You are not an active member of this conversation");
                    }
                    const deleted = await Conversation.findOneAndDelete({
                        _id: conversationId, type: "group", createdBy: currentUserId,
                        isActive: true
                    }).select("+mediaRegistry").session(session);
                    if (!deleted) throw new ApiError(404, "Conversation not found");

                    await retireGroupAvatar(deleted, { session });

                    const messages = await Message.find({ conversation: conversationId })
                        .select("_id sender attachment.url attachment.publicId attachment.resourceType attachment.deliveryType attachments.url attachments.publicId attachments.resourceType attachments.deliveryType +attachment.mediaRegistry +attachments.mediaRegistry").session(session).lean();
                    for (const message of messages) await retireMessageAttachment(message, { session });
                    const messageIds = messages.map((message) => message._id);
                    await MessageReaction.deleteMany({ message: { $in: messageIds } }, { session });
                    await Message.updateMany({ forwardedFrom: { $in: messageIds } },
                        { $set: { forwardedFrom: null } }, { session });
                    await Message.updateMany({ replyTo: { $in: messageIds } },
                        { $set: { replyTo: null } }, { session });
                    await Message.deleteMany({ conversation: conversationId }, { session });
                    await ConversationMember.deleteMany({ conversation: conversationId }, { session });
                    await Share.updateMany({ conversation: conversationId },
                        { $set: { conversation: null } }, { session });
                });
                responseMessage = "Conversation deleted successfully";
            } finally {
                await session.endSession();
            }
        }
    } else {
        throw new ApiError(400, "Invalid conversation type");
    }

    return res
     .status(200)
     .json(
        new  ApiResponse(
            200,
            {},
            responseMessage
        )
     )


})
export {
    createDirectConversation,
    getUserConversation,
    getConversationById,
    findDirectConversation,
    deleteConversation
};
