import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { Conversation } from "../models/conversation.model.js";
import { ConversationMember } from "../models/conversationMember.model.js";
import { BlockedUser } from "../models/blockedUser.model.js";

// The caller owns the transaction and retries if it aborts.
const cleanupUserGroupMemberships = async (userId, { session } = {}) => {
    if (!mongoose.isValidObjectId(userId)) {
        throw new Error("Invalid user ID");
    }
    if (!session?.inTransaction()) {
        throw new Error("An active MongoDB transaction is required");
    }

    const user = await User.findOne({
        _id: userId,
        deletionRequestedAt: { $ne: null },
        anonymizedAt: { $ne: null },
        isActive: false
    }).select("_id").session(session);

    if (!user) {
        throw new Error("User must be deletion-pending and anonymized");
    }

    const memberships = await ConversationMember.find({ user: user._id })
        .select("conversation").session(session).lean();
    const groups = await Conversation.find({
        type: "group",
        $or: [
            { createdBy: user._id },
            { participants: user._id },
            { _id: { $in: memberships.map((member) => member.conversation) } }
        ]
    }).session(session);

    for (const group of groups) {
        if (group.isActive && group.createdBy.equals(user._id)) {
            const candidates = await ConversationMember.find({
                conversation: group._id,
                user: { $ne: user._id },
                isActive: true
            }).sort({ joinedAt: 1, _id: 1 }).session(session).lean();

            const candidateIds = candidates.map((candidate) => candidate.user);
            const eligibleUsers = await User.find({
                _id: { $in: candidateIds },
                isActive: true,
                deletionRequestedAt: null,
                anonymizedAt: null
            }).select("_id").session(session).lean();
            const blocks = await BlockedUser.find({
                $or: [
                    { blocker: user._id, blockedUser: { $in: candidateIds } },
                    { blocker: { $in: candidateIds }, blockedUser: user._id }
                ]
            }).select("blocker blockedUser").session(session).lean();
            const eligibleIds = new Set(eligibleUsers.map((candidate) => String(candidate._id)));
            const blockedIds = new Set(blocks.map((block) =>
                String(block.blocker.equals(user._id) ? block.blockedUser : block.blocker)
            ));
            const eligible = candidates.filter((candidate) =>
                eligibleIds.has(String(candidate.user)) && !blockedIds.has(String(candidate.user))
            );
            const successor = eligible.find((candidate) => candidate.role === "admin") || eligible[0];

            if (successor) {
                await ConversationMember.updateOne(
                    { _id: successor._id, isActive: true },
                    { $set: { role: "admin" } },
                    { session }
                );
                group.createdBy = successor.user;
                if (!group.participants.some((participant) => participant.equals(successor.user))) {
                    group.participants.push(successor.user);
                }
            } else {
                group.isActive = false;
            }
        }

        group.participants = group.participants.filter((participant) => !participant.equals(user._id));
        await group.save({ session });
    }

    await ConversationMember.updateMany(
        { user: user._id, conversation: { $in: groups.map((group) => group._id) }, isActive: true },
        { $set: { isActive: false, role: "member" } },
        { session }
    );
};

export { cleanupUserGroupMemberships };
