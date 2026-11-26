import { asyncHandler } from "../utils/asyncHandler.js";

import { ConversationMember } from "../models/conversationMember.model.js";

import { Conversation } from "../models/conversation.model.js";

import mongoose from "mongoose";

import { ApiError } from "../utils/ApiError.js";

import { ApiResponse } from "../utils/ApiResponse.js";

import { User } from "../models/user.model.js";

import { isBlockedBetweenUsers } from "../utils/isBlockedBetweenUsers.js";

import { Notification } from "../models/notification.model.js";
import { registerGroupAvatar } from "../services/groupAvatarRegistry.service.js";
import { mutateGroupMembership, fenceGroupParticipants } from "../services/groupMembership.service.js";

const notifyMembershipChange = async (req, title, message, action, extra = {}) => {
    try { await Notification.create({ recipient: req.body.userId, actor: req.user._id, type: "system", title, message,
        entityType: "user", entityId: req.body.userId, data: { conversationId: req.params.conversationId, action, ...extra } }); }
    catch (error) { console.error("Failed to create membership notification:", error.message); }
};

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

    let conversation;
    const conversationId = new mongoose.Types.ObjectId();
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
    await fenceGroupParticipants(uniqueParticipantIds, { session });
    const avatarUrl = avatar?.trim() || null;
    const avatarMetadata = await registerGroupAvatar({ url: avatarUrl, conversationId, userId: currentUserId, session });
    [conversation] = await Conversation.create([{
        _id: conversationId,
        participants: uniqueParticipantIds,
        type: "group",
        name: name.trim(),
        avatar: avatarUrl,
        mediaRegistry: avatarMetadata ? { avatar: avatarMetadata } : undefined,
        createdBy: currentUserId
    }], { session });

    const members = uniqueParticipantIds.map((participantId) => ({
        conversation: conversation._id,
        user: participantId,
        role:
            participantId.toString() === currentUserId.toString()
                ? "admin"
                : "member"
    }));

    await ConversationMember.insertMany(members, { session });
        });
    } finally { await session.endSession(); }

    const responseConversation = conversation.toObject();
    delete responseConversation.mediaRegistry;
    return res.status(201).json(
        new ApiResponse(
            201,
            responseConversation,
            "Group conversation created successfully"
        )
    );
});

//====================== AddConversationMember ======================//

const addConversationMember = asyncHandler(async (req, res) => {
    const result = await mutateGroupMembership({ conversationId: req.params.conversationId, actorId: req.user?._id, targetId: req.body.userId, action: "add" });
    await notifyMembershipChange(req, "Added to Group", `You have been added to the group "${result.groupName}".`, "group_member_added", { conversationName: result.groupName, addedBy: req.user._id });
    const status = result.reactivated ? 200 : 201;
    return res.status(status).json(new ApiResponse(status, result.member, "Member added successfully"));
});




//====================== removeConversationMember ======================//

const removeConversationMember = asyncHandler(async (req, res) => {
    const result = await mutateGroupMembership({ conversationId: req.params.conversationId, actorId: req.user?._id, targetId: req.body.userId, action: "remove" });
    await notifyMembershipChange(req, "Removed from Group", `You have been removed from the group "${result.groupName}".`, "group_member_removed", { conversationName: result.groupName, removedBy: req.user._id });
    return res.status(200).json(new ApiResponse(200, {}, "Member removed successfully"));
});




//===================== leaveConversation ==================================//

const leaveConversation = asyncHandler(async (req, res) => {
    const result = await mutateGroupMembership({ conversationId: req.params.conversationId, actorId: req.user?._id, action: "leave" });
    if (result.promotedUser) {
        try { await Notification.create({ recipient: result.promotedUser, actor: req.user._id, type: "system", title: "You Are Now a Group Admin", message: `You are now an admin of the group "${result.groupName}".`, entityType: "user", entityId: result.promotedUser, data: { conversationId: req.params.conversationId, conversationName: result.groupName, action: "group_admin_promoted" } }); }
        catch (error) { console.error("Failed to create admin promotion notification:", error.message); }
    }
    return res.status(200).json(new ApiResponse(200, {}, result.archived ? "You left and the empty conversation was archived" : "You left the conversation successfully"));
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
    const result = await mutateGroupMembership({ conversationId: req.params.conversationId, actorId: req.user?._id, targetId: req.body.userId, role: req.body.role, action: "role" });
    if (result.oldRole !== req.body.role) await notifyMembershipChange(req, req.body.role === "admin" ? "You Are Now a Group Admin" : "Group Admin Role Removed", req.body.role === "admin" ? `You are now an admin of the group "${result.groupName}".` : `Your admin role has been removed from the group "${result.groupName}".`, "group_member_role_changed", { conversationName: result.groupName, changedBy: req.user._id, oldRole: result.oldRole, newRole: req.body.role });
    const member = await ConversationMember.findById(result.member._id).populate("user", "username fullName avatar");
    return res.status(200).json(new ApiResponse(200, member, "Member role updated successfully"));
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

const setConversationArchived = async (conversationId, userId, archived) => {
    if (!mongoose.isValidObjectId(conversationId) || !mongoose.isValidObjectId(userId)) throw new ApiError(400, "Invalid conversation ID");
    const session = await mongoose.startSession();
    try { return await session.withTransaction(async () => {
        const conversation = await Conversation.findOneAndUpdate({ _id: conversationId, isActive: true }, { $inc: { membershipVersion: 1 } }, { session, returnDocument: "after" });
        if (!conversation) throw new ApiError(404, "Conversation not found");
        if (conversation.type === "direct") {
            if (!conversation.participants.some((participant) => participant.equals(userId))) throw new ApiError(403, "You are not a participant of this conversation");
            let status = conversation.directReadStatus.find((item) => item.user.equals(userId));
            if (!status) { conversation.directReadStatus.push({ user: userId, isArchived: archived }); status = conversation.directReadStatus[conversation.directReadStatus.length - 1]; }
            else status.isArchived = archived;
            await conversation.save({ session });
            return status.toObject();
        }
        if (conversation.type === "group") {
            const member = await ConversationMember.findOne({ conversation: conversationId, user: userId, isActive: true }).session(session);
            if (!member) throw new ApiError(403, "Active membership required");
            member.isArchived = archived; await member.save({ session }); return member.toObject();
        }
        throw new ApiError(400, "Invalid conversation type");
    }); } finally { await session.endSession(); }
};

const archiveConversation = asyncHandler(async (req, res) => {
    const result = await setConversationArchived(req.params.conversationId, req.user?._id, true);
    return res.status(200).json(new ApiResponse(200, result, "Conversation archived successfully"));
});

const unarchiveConversation = asyncHandler(async (req, res) => {
    const result = await setConversationArchived(req.params.conversationId, req.user?._id, false);
    return res.status(200).json(new ApiResponse(200, result, "Conversation unarchived successfully"));
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
