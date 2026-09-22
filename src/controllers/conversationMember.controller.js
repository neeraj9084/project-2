import { asyncHandler } from "../utils/asyncHandler.js";
import { ConversationMember } from "../models/conversationMember.model.js";
import { Conversation } from "../models/conversation.model.js"; 
import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { isBlockedBetweenUsers } from "../utils/isBlockedBetweenUsers.js";


//===================== createMemberConversation =======================//

const createMemberConversation = asyncHandler(async (req, res) => {
    const { participantIds, name, avatar } = req.body;

    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
        throw new ApiError(400, "Participants are required");
    }

    if (!name?.trim()) {
        throw new ApiError(400, "Group name is required");
    }

    const uniqueParticipantIds = [
        ...new Set([
            currentUserId.toString(),
            ...participantIds.map((id) => id.toString())
        ])
    ];

    for (const id of uniqueParticipantIds) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, "Invalid participant ID");
        }
    }

    if (uniqueParticipantIds.length < 2) {
        throw new ApiError(
            400,
            "Group conversation must have at least two participants"
        );
    }

    const users = await User.find({
        _id: { $in: uniqueParticipantIds },
        isActive: true
    }).select("_id");

    if (users.length !== uniqueParticipantIds.length) {
        throw new ApiError(
            400,
            "One or more participants are invalid or inactive"
        );
    }

    for (const participantId of uniqueParticipantIds) {
        if (participantId.toString() === currentUserId.toString()) {
            continue;
        }

        const blocked = await isBlockedBetweenUsers(
            currentUserId,
            participantId
        );

        if (blocked) {
            throw new ApiError(
                403,
                "You cannot create a group conversation with a blocked user"
            );
        }
    }

    const conversation = await Conversation.create({
        participants: uniqueParticipantIds,
        type: "group",
        name: name.trim(),
        avatar: avatar?.trim() || null,
        createdBy: currentUserId
    });

    const members = uniqueParticipantIds.map((participantId) => ({
        conversation: conversation._id,
        user: participantId,
        role:
            participantId.toString() === currentUserId.toString()
                ? "admin"
                : "member"
    }));

    await ConversationMember.insertMany(members);

    return res.status(201).json(
        new ApiResponse(
            201,
            conversation,
            "Group conversation created successfully"
        )
    );
});

//====================== AddConversationMember ======================//

const addConversationMember = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { userId } = req.body;

    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new ApiError(400, "Invalid conversation ID");
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(400, "Invalid user ID");
    }

    if (currentUserId.toString() === userId.toString()) {
        throw new ApiError(400, "You cannot add yourself");
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    });

    if (!conversation) {
        throw new ApiError(404, "Conversation not found");
    }

    const currentUserMember = await ConversationMember.findOne({
        conversation: conversationId,
        user: currentUserId,
        isActive: true
    });

    if (!currentUserMember || currentUserMember.role !== "admin") {
        throw new ApiError(
            403,
            "You are not authorized to add members to this conversation"
        );
    }

    const user = await User.findOne({
        _id: userId,
        isActive: true
    }).select("_id");

    if (!user) {
        throw new ApiError(404, "User not found or inactive");
    }

    const blocked = await isBlockedBetweenUsers(
        currentUserId,
        userId
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot add a blocked user to this conversation"
        );
    }

    const existingMember = await ConversationMember.findOne({
        conversation: conversationId,
        user: userId
    });

    if (existingMember) {
        if (existingMember.isActive) {
            throw new ApiError(
                409,
                "User is already a member of this conversation"
            );
        }

        existingMember.isActive = true;
        existingMember.joinedAt = new Date();
        existingMember.role = "member";

        await existingMember.save();

        if (!conversation.participants.some(
            (participantId) => participantId.toString() === userId.toString()
        )) {
            conversation.participants.push(userId);
            await conversation.save();
        }

        return res.status(200).json(
            new ApiResponse(
                200,
                existingMember,
                "Member added successfully"
            )
        );
    }

    const member = await ConversationMember.create({
        conversation: conversationId,
        user: userId,
        role: "member"
    });

    if (!conversation.participants.some(
        (participantId) => participantId.toString() === userId.toString()
    )) {
        conversation.participants.push(userId);
        await conversation.save();
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            member,
            "Member added successfully"
        )
    );
});

//====================== removeConversationMember ======================//

const removeConversationMember = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { userId } = req.body;

    const currentUserId = req.user._id;

    if (!currentUserId) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new ApiError(400, "Invalid conversation ID");
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(400, "Invalid user ID");
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    });

    if (!conversation) {
        throw new ApiError(404, "Conversation not found");
    }

    const currentUserMember = await ConversationMember.findOne({
        conversation: conversationId,
        user: currentUserId,
        isActive: true
    });

    if (!currentUserMember) {
        throw new ApiError(
            403,
            "You are not a member of this conversation"
        );
    }

    if (currentUserMember.role !== "admin") {
        throw new ApiError(
            403,
            "Only admins can remove members"
        );
    }

    const member = await ConversationMember.findOne({
        conversation: conversationId,
        user: userId,
        isActive: true
    });

    if (!member) {
        throw new ApiError(
            404,
            "Member not found in this conversation"
        );
    }

    member.isActive = false;

    await member.save();

    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Member removed successfully"
        )
    );
});

//====================== leaveConversation ======================//

   const leaveConversation = asyncHandler(async (req, res) => {
    
    const { conversationId } = req.params;
    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new ApiError(400, "Invalid conversation ID");
    }

    const session = await mongoose.startSession();

    let responseMessage = "You left the conversation successfully";

    try {
        await session.withTransaction(async () => {
            // 1. Find active conversation
            const conversation = await Conversation.findOne({
                _id: conversationId,
                isActive: true
            }).session(session);

            if (!conversation) {
                throw new ApiError(404, "Conversation not found");
            }

            // 2. Leave is only allowed for group conversations
            if (conversation.type !== "group") {
                throw new ApiError(
                    400,
                    "Leave is only available for group conversations"
                );
            }

            // 3. Get every active membership
            const activeMembers = await ConversationMember.find({
                conversation: conversation._id,
                isActive: true
            })
                .select("_id user role joinedAt")
                .sort({ joinedAt: 1, _id: 1 })
                .session(session);

            if (activeMembers.length === 0) {
                throw new ApiError(
                    500,
                    "Conversation has no active members"
                );
            }

            /*
             * 4. Validate roles and normalize active members by user.
             *
             * One user should have only one active membership.
             * Existing bad data may contain duplicates, so we collapse
             * duplicate records here before making leave/admin decisions.
             */
            const membersByUser = new Map();
            const duplicateMembershipIds = [];

            for (const member of activeMembers) {
                const userId = member.user.toString();

                if (!["member", "admin"].includes(member.role)) {
                    throw new ApiError(
                        500,
                        `Invalid conversation member role for user ${userId}`
                    );
                }

                if (!membersByUser.has(userId)) {
                    membersByUser.set(userId, {
                        user: member.user,
                        role: member.role,
                        memberId: member._id,
                        joinedAt: member.joinedAt
                    });
                    continue;
                }

                const existingMember = membersByUser.get(userId);

                // Conflicting duplicate roles indicate corrupted data.
                if (existingMember.role !== member.role) {
                    throw new ApiError(
                        500,
                        `Inconsistent membership roles found for user ${userId}`
                    );
                }

                duplicateMembershipIds.push(member._id);
            }

            const uniqueMembers = Array.from(membersByUser.values());

            // 5. Find the current user's canonical membership
            const currentUserMember = membersByUser.get(
                currentUserId.toString()
            );

            if (!currentUserMember) {
                throw new ApiError(
                    404,
                    "You are not an active member of this conversation"
                );
            }

            // 6. Clean up old duplicate active membership records.
            //    Nothing is physically deleted.
            if (duplicateMembershipIds.length > 0) {
                await ConversationMember.updateMany(
                    {
                        _id: { $in: duplicateMembershipIds },
                        isActive: true
                    },
                    {
                        $set: {
                            isActive: false
                        }
                    },
                    {
                        session
                    }
                );
            }

            // 7. Build remaining unique members
            const remainingMembers = uniqueMembers.filter(
                (member) =>
                    member.user.toString() !== currentUserId.toString()
            );

            // 8. Last member is leaving
            if (remainingMembers.length === 0) {
                await ConversationMember.updateMany(
                    {
                        conversation: conversation._id,
                        user: currentUserId,
                        isActive: true
                    },
                    {
                        $set: {
                            isActive: false,
                            leftAt: new Date()
                        }
                    },
                    {
                        session
                    }
                );

                // Keep conversation for history.
                // Just archive/deactivate it.
                conversation.participants = [];
                conversation.isActive = false;

                await conversation.save({ session });

                responseMessage =
                    "You left and the empty conversation was archived";

                return;
            }

            // 9. If admin is leaving, guarantee another admin exists
            if (currentUserMember.role === "admin") {
                const remainingAdmins = remainingMembers.filter(
                    (member) => member.role === "admin"
                );

                // Current user was the last admin
                if (remainingAdmins.length === 0) {
                    /*
                     * uniqueMembers are already sorted by joinedAt + _id.
                     * Therefore the first remaining member is deterministic
                     * and represents the oldest remaining member.
                     */
                    const newAdmin = remainingMembers[0];

                    const promotedMember =
                        await ConversationMember.findOneAndUpdate(
                            {
                                _id: newAdmin.memberId,
                                conversation: conversation._id,
                                isActive: true,
                                role: "member"
                            },
                            {
                                $set: {
                                    role: "admin"
                                }
                            },
                            {
                                new: true,
                                session
                            }
                        );

                    if (!promotedMember) {
                        throw new ApiError(
                            500,
                            "Unable to assign a new conversation admin"
                        );
                    }

                    newAdmin.role = "admin";
                }
            }

            // 10. Soft-leave all active memberships of current user
            await ConversationMember.updateMany(
                {
                    conversation: conversation._id,
                    user: currentUserId,
                    isActive: true
                },
                {
                    $set: {
                        isActive: false,
                        leftAt: new Date()
                    }
                },
                {
                    session
                }
            );

            // 11. Conversation participants come from active memberships
            conversation.participants = remainingMembers.map(
                (member) => member.user
            );

            // 12. Save conversation
            await conversation.save({ session });
        });

        return res.status(200).json(
            new ApiResponse(
                200,
                {},
                responseMessage
            )
        );
    } finally {
        await session.endSession();
    }
});



//====================== getConversationMembers ======================//

const getConversationMembers = asyncHandler(async (req, res) => {

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

    const conversationMember = await ConversationMember.findOne({
        conversation: conversationId,
        user: currentUserId,
        isActive: true
    });

    if (!conversationMember) {
        throw new ApiError(
            403,
            "You are not a member of this conversation"
        );
    }

    const members = await ConversationMember.find({
        conversation: conversationId,
        isActive: true
    }).populate(
        "user",
        "username email fullName avatar"
    );

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                members,
                "Conversation members fetched successfully"
            )
        );
});

//====================== updateMemberRole ======================//

const updateMemberRole = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { userId, role } = req.body;
    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new ApiError(400, "Invalid conversation ID");
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(400, "Invalid user ID");
    }

    if (!["admin", "member"].includes(role)) {
        throw new ApiError(
            400,
            "Invalid role. Must be 'admin' or 'member'"
        );
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    });

    if (!conversation) {
        throw new ApiError(404, "Conversation not found");
    }

    const currentUserMember = await ConversationMember.findOne({
        conversation: conversationId,
        user: currentUserId,
        isActive: true
    });

    if (!currentUserMember) {
        throw new ApiError(
            403,
            "You are not a member of this conversation"
        );
    }

    if (currentUserMember.role !== "admin") {
        throw new ApiError(
            403,
            "Only admins can update member roles"
        );
    }

  const targetMember = await ConversationMember.findOne({
    conversation: conversationId,
    user: userId,
    isActive: true
}).populate(
    "user",
    "username fullName avatar"
);
    if (!targetMember) {
        throw new ApiError(
            404,
            "Member not found in this conversation"
        );
    }

    if (targetMember.role === role) {
        return res.status(200).json(
            new ApiResponse(
                200,
                targetMember,
                "Member role is already set to the specified value"
            )
        );
    }

    // Prevent removing the last admin
    if (targetMember.role === "admin" && role === "member") {
        const otherAdmin = await ConversationMember.findOne({
            conversation: conversationId,
            user: { $ne: userId },
            role: "admin",
            isActive: true
        });

        if (!otherAdmin) {
            throw new ApiError(
                400,
                "Cannot remove the last admin"
            );
        }
    }

    targetMember.role = role;

    await targetMember.save();

    return res.status(200).json(
        new ApiResponse(
            200,
            targetMember,
            "Member role updated successfully"
        )
    );
});

//====================== updateLastRead ======================//    

const updateLastRead = asyncHandler(async (req, res) => {

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

    const conversationMember = await ConversationMember.findOne({
        conversation: conversationId,
        user: currentUserId,
        isActive: true
    });

    if (!conversationMember) {
        throw new ApiError(
            403,
            "You are not a member of this conversation"
        );
    }

    conversationMember.lastReadAt = new Date();

    await conversationMember.save();

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                conversationMember,
                "Conversation marked as read"
            )
        );
});

//====================== muteConversation ======================//

const muteConversation = asyncHandler(async (req, res) => {

    const { conversationId } = req.params;
    const { mutedUntil } = req.body;
    const currentUserId = req.user?._id;

    if (!currentUserId) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new ApiError(400, "Invalid conversation ID");
    }

    if (!mutedUntil) {
        throw new ApiError(400, "mutedUntil is required");
    }

    const muteDate = new Date(mutedUntil);

    if (Number.isNaN(muteDate.getTime())) {
        throw new ApiError(400, "Invalid mutedUntil date");
    }

    if (muteDate <= new Date()) {
        throw new ApiError(
            400,
            "mutedUntil must be a future date"
        );
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        isActive: true
    });

    if (!conversation) {
        throw new ApiError(404, "Conversation not found");
    }

    const conversationMember = await ConversationMember.findOne({
        conversation: conversationId,
        user: currentUserId,
        isActive: true
    });

    if (!conversationMember) {
        throw new ApiError(
            403,
            "You are not a member of this conversation"
        );
    }

    conversationMember.mutedUntil = muteDate;

    await conversationMember.save();

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                conversationMember,
                "Conversation muted successfully"
            )
        );
});

//===================== unmuteConversation ======================//

const unmuteConversation = asyncHandler(async (req, res) => {

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

    const conversationMember = await ConversationMember.findOne({
        conversation: conversationId,
        user: currentUserId,
        isActive: true
    });

    if (!conversationMember) {
        throw new ApiError(
            403,
            "You are not a member of this conversation"
        );
    }

    conversationMember.mutedUntil = null;

    await conversationMember.save();

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                conversationMember,
                "Conversation unmuted successfully"
            )
        );
});

//====================== archiveConversation ======================//

const archiveConversation = asyncHandler(async (req, res) => {
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

    const conversationMember = await ConversationMember.findOne({
        conversation: conversationId,
        user: currentUserId,
        isActive: true
    });

    if (!conversationMember) {
        throw new ApiError(
            403,
            "You are not a member of this conversation"
        );
    }

    if (conversationMember.isArchived) {
        return res.status(200).json(
            new ApiResponse(
                200,
                conversationMember,
                "Conversation is already archived"
            )
        );
    }

    conversationMember.isArchived = true;

    await conversationMember.save();

    return res.status(200).json(
        new ApiResponse(
            200,
            conversationMember,
            "Conversation archived successfully"
        )
    );
});

//====================== unarchiveConversation ======================//

const unarchiveConversation = asyncHandler(async (req, res) => {
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

    const conversationMember = await ConversationMember.findOne({
        conversation: conversationId,
        user: currentUserId,
        isActive: true
    });

    if (!conversationMember) {
        throw new ApiError(
            403,
            "You are not a member of this conversation"
        );
    }

    if (!conversationMember.isArchived) {
        return res.status(200).json(
            new ApiResponse(
                200,
                conversationMember,
                "Conversation is already unarchived"
            )
        );
    }

    conversationMember.isArchived = false;

    await conversationMember.save();

    return res.status(200).json(
        new ApiResponse(
            200,
            conversationMember,
            "Conversation unarchived successfully"
        )
    );
});

export {
    createMemberConversation,
    addConversationMember,
    removeConversationMember,
    leaveConversation,
    getConversationMembers,
    updateMemberRole,
    updateLastRead,
    muteConversation, 
    unmuteConversation,
    archiveConversation,
    unarchiveConversation
};