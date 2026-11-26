import mongoose from "mongoose";
import { Conversation } from "../models/conversation.model.js";
import { ConversationMember } from "../models/conversationMember.model.js";
import { User } from "../models/user.model.js";
import { BlockedUser } from "../models/blockedUser.model.js";
import { ApiError } from "../utils/ApiError.js";

// Account deactivation writes these same User documents, so a concurrent
// deactivation and group creation cannot both commit from stale snapshots.
const fenceGroupParticipants = async (participantIds, { session } = {}) => {
    if (!session?.inTransaction()) throw new Error("An active MongoDB transaction is required");
    for (const id of [...new Set(participantIds.map(String))].sort()) {
        const updated = await User.updateOne({ _id: id, isActive: true, deletionRequestedAt: null, anonymizedAt: null },
            { $inc: { groupMembershipFence: 1 } }, { session, timestamps: false });
        if (updated.matchedCount !== 1) throw new ApiError(400, "One or more participants are invalid or inactive");
    }
};

// ConversationMember is authoritative; participants is a compatibility mirror.
const mutateGroupMembership = async ({ conversationId, actorId, targetId = actorId, action, role }) => {
    if (![conversationId, actorId, targetId].every(mongoose.isValidObjectId)) throw new ApiError(400, "Invalid conversation or user ID");
    if (!["add", "remove", "role", "leave"].includes(action) || (action === "role" && !["admin", "member"].includes(role))) throw new ApiError(400, "Invalid membership action");
    const session = await mongoose.startSession();
    try { return await session.withTransaction(async () => {
        const group = await Conversation.findOneAndUpdate({ _id: conversationId, type: "group", isActive: true },
            { $inc: { membershipVersion: 1 } }, { session, returnDocument: "after" });
        if (!group) throw new ApiError(404, "Group not found");
        const members = await ConversationMember.find({ conversation: group._id }).sort({ joinedAt: 1, _id: 1 }).session(session);
        const seen = new Set();
        for (const item of members) { const id = String(item.user); if (seen.has(id)) throw new ApiError(409, "Duplicate membership requires review"); seen.add(id); }
        if (!members.some((item) => item.isActive && item.role === "admin" && String(item.user) === String(group.createdBy))) throw new ApiError(409, "Group ownership requires review");
        const actor = members.find((item) => String(item.user) === String(actorId) && item.isActive);
        if (!actor) throw new ApiError(403, "Active membership required");
        if (action !== "leave" && actor.role !== "admin") throw new ApiError(403, "Only admins can change membership");
        let target = members.find((item) => String(item.user) === String(targetId));
        const reactivated = action === "add" && Boolean(target);
        const oldRole = target?.role || null;
        let promotedUser = null;
        if (action === "add") {
            if (String(actorId) === String(targetId)) throw new ApiError(400, "You cannot add yourself");
            if (target?.isActive) throw new ApiError(409, "User is already a member");
            if (!await User.exists({ _id: targetId, isActive: true, deletionRequestedAt: null, anonymizedAt: null }).session(session)) throw new ApiError(404, "User not found or inactive");
            if (await BlockedUser.exists({ $or: [{ blocker: actorId, blockedUser: targetId }, { blocker: targetId, blockedUser: actorId }] }).session(session)) throw new ApiError(403, "User is blocked");
            if (target) { target.isActive = true; target.role = "member"; target.joinedAt = new Date(); target.isHidden = false; await target.save({ session }); }
            else { [target] = await ConversationMember.create([{ conversation: group._id, user: targetId, role: "member" }], { session }); members.push(target); }
        } else {
            if (!target?.isActive) throw new ApiError(404, "Active member not found");
            if (action === "remove" && String(actorId) === String(targetId)) throw new ApiError(400, "Use leave to remove yourself");
            if ((action === "remove" || action === "role" && role !== "admin") && String(group.createdBy) === String(targetId)) throw new ApiError(403, "Group owner cannot be removed or demoted");
            if (action === "role") {
                if (target.role === "admin" && role === "member" && !members.some((m) => m.isActive && m.role === "admin" && String(m.user) !== String(targetId))) throw new ApiError(400, "Cannot remove the last admin");
                target.role = role; await target.save({ session });
            } else {
                const remaining = members.filter((m) => m.isActive && String(m.user) !== String(targetId));
                if (action === "remove" && target.role === "admin" && !remaining.some((m) => m.role === "admin")) throw new ApiError(400, "Cannot remove the last admin");
                if (action === "leave" && remaining.length && (String(group.createdBy) === String(actorId) || !remaining.some((m) => m.role === "admin"))) {
                    const eligible = await User.find({ _id: { $in: remaining.map((m) => m.user) }, isActive: true, deletionRequestedAt: null, anonymizedAt: null }).select("_id").session(session).lean();
                    const ids = new Set(eligible.map((item) => String(item._id)));
                    const blocks = await BlockedUser.find({ $or: [{ blocker: actorId, blockedUser: { $in: remaining.map((m) => m.user) } }, { blocker: { $in: remaining.map((m) => m.user) }, blockedUser: actorId }] }).session(session).lean();
                    const blocked = new Set(blocks.map((b) => String(b.blocker) === String(actorId) ? String(b.blockedUser) : String(b.blocker)));
                    const candidates = remaining.filter((m) => ids.has(String(m.user)) && !blocked.has(String(m.user)));
                    const successor = candidates.find((m) => m.role === "admin") || candidates[0];
                    if (!successor) throw new ApiError(409, "No eligible successor; group requires review");
                    if (successor.role !== "admin") promotedUser = successor.user;
                    successor.role = "admin"; await successor.save({ session });
                    if (String(group.createdBy) === String(actorId)) group.createdBy = successor.user;
                }
                target.isActive = false; target.role = "member"; await target.save({ session });
                if (!remaining.length) group.isActive = false;
            }
        }
        group.participants = members.filter((item) => item.isActive).map((item) => item.user);
        await group.save({ session });
        return { member: target.toObject(), archived: !group.isActive, reactivated, promotedUser, oldRole, groupName: group.name };
    }); } finally { await session.endSession(); }
};

// Read-only; never repairs or deletes legacy records.
const inspectGroupMembership = async (conversationId) => {
    if (!mongoose.isValidObjectId(conversationId)) throw new ApiError(400, "Invalid conversation ID");
    const group = await Conversation.findOne({ _id: conversationId, type: "group" }).lean();
    if (!group) throw new ApiError(404, "Group not found");
    const records = await ConversationMember.find({ conversation: group._id }).lean();
    const counts = new Map(); for (const item of records) counts.set(String(item.user), (counts.get(String(item.user)) || 0) + 1);
    const active = new Set(records.filter((item) => item.isActive).map((item) => String(item.user)));
    const participants = new Set(group.participants.map(String));
    const participantCounts = new Map(); for (const participant of group.participants) { const id = String(participant); participantCounts.set(id, (participantCounts.get(id) || 0) + 1); }
    return { duplicateUsers: [...counts].filter(([, count]) => count > 1).map(([id]) => id),
        duplicateParticipants: [...participantCounts].filter(([, count]) => count > 1).map(([id]) => id),
        missingParticipants: [...active].filter((id) => !participants.has(id)), staleParticipants: [...participants].filter((id) => !active.has(id)),
        ownerMissingOrNotAdmin: !records.some((item) => item.isActive && item.role === "admin" && String(item.user) === String(group.createdBy)),
        noActiveAdmin: !records.some((item) => item.isActive && item.role === "admin") };
};
export { mutateGroupMembership, inspectGroupMembership, fenceGroupParticipants };
