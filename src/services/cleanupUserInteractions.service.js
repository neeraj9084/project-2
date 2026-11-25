import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { Comment } from "../models/comment.model.js";
import { Like } from "../models/like.model.js";
import { Message } from "../models/message.model.js";
import { MessageReaction } from "../models/messageReaction.model.js";
import { Report } from "../models/report.model.js";
import { UserReport } from "../models/userReport.model.js";
import { CopyrightClaim } from "../models/CopyrightClaim.model.js";
import { AuditLog } from "../models/auditLog.model.js";

// The caller owns the transaction, including anonymization and retry handling.
const cleanupUserInteractions = async (userId, { session } = {}) => {
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

    await Like.deleteMany({ likedBy: user._id }, { session });
    await MessageReaction.deleteMany({ user: user._id }, { session });
    await Message.updateMany(
        { "reactions.user": user._id },
        { $pull: { reactions: { user: user._id } } },
        { session }
    );
    await Comment.updateMany(
        { likes: user._id },
        { $pull: { likes: user._id } },
        { session }
    );
    await Comment.updateMany(
        { owner: user._id },
        { $set: { content: "[deleted]" } },
        { session }
    );

    await Report.updateMany(
        { reporter: user._id },
        { $set: { description: null } },
        { session }
    );
    await UserReport.updateMany(
        { reporter: user._id },
        { $set: { description: null } },
        { session }
    );
    await CopyrightClaim.updateMany(
        { claimant: user._id },
        { $set: { reason: "[deleted]", description: "[deleted]" } },
        { session }
    );
    await AuditLog.updateMany(
        { actor: user._id },
        { $set: { description: null, ipAddress: null, userAgent: null, metadata: {} } },
        { session }
    );
};

export { cleanupUserInteractions };
