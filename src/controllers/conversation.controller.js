import mongoose from "mongoose";
import { Conversation } from "../models/conversation.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Message } from "../models/message.model.js";
import { isBlockedBetweenUsers } from "../utils/isBlockedBetweenUsers.js";

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
        return res.status(200).json(
            new ApiResponse(
                200,
                existingConversation,
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

   const conversation = await Conversation.find({
    participants: userId,
    isActive: true
   })
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

   const total = await Conversation.countDocuments({
    participants: userId,
    isActive: true
   })

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                conversation,
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
        participants: userId,
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
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            conversation,
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
            conversation,
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
        participants: currentUserId,
        isActive: true
    }); 

    if(!conversation){  
        throw new ApiError(404, "Conversation not found");
    }

    const participant = conversation.participants.find(
        (participantId) => participantId.toString() === currentUserId.toString()            
    );

    if(!participant){
        throw new ApiError(403, "You are not a member of this conversation");
    }

    await Message.deleteMany({
        conversation: conversationId
    });

    await Conversation.findByIdAndDelete(conversationId)

    return res
     .status(200)
     .json(
        new  ApiResponse(
            200,
            {},
            "Conversation deleted successfully"   
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