import mongoose from "mongoose";
import crypto from "crypto";
import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js";
import { anonymizeUser } from "./anonymizeUser.service.js";
import { cleanupUserInteractions } from "./cleanupUserInteractions.service.js";
import { cleanupUserGroupMemberships } from "./cleanupUserGroupMemberships.service.js";
import { tombstoneVideo } from "./tombstoneVideo.service.js";
import { cleanupUserPersonalRecords } from "./cleanupUserPersonalRecords.service.js";
import { assertIsolatedMediaTest } from "./testMediaCoverageApproval.service.js";

// Until production activation is reviewed, destructive database cleanup is
// restricted to the same harness-owned local database as lifecycle execution.
const cleanupAccount = async (userId, { ownerToken } = {}) => {
    if (!mongoose.isValidObjectId(userId)) throw new Error("Invalid user ID");

    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            await assertIsolatedMediaTest({ session, ownerToken });
            // Writing the same user document serializes concurrent cleanup transactions.
            const user = await User.findOneAndUpdate(
                { _id: userId, isActive: false, deletionRequestedAt: { $ne: null },
                    databaseCleanupStatus: { $ne: "complete" } },
                { $set: { databaseCleanupStatus: "pending", databaseCleanupClaim: crypto.randomUUID() } },
                { returnDocument: "after", session, timestamps: false }
            ).select("_id");

            if (!user) {
                const existing = await User.findOne({
                    _id: userId, isActive: false, deletionRequestedAt: { $ne: null },
                    databaseCleanupStatus: "complete"
                }).select("_id databaseCleanupCompletedAt").session(session).lean();
                if (!existing) throw new Error("User not found or deletion was not requested");
                result = { status: "complete", completedAt: existing.databaseCleanupCompletedAt };
                return;
            }

            await anonymizeUser(user._id, { session });
            await cleanupUserInteractions(user._id, { session });
            await cleanupUserGroupMemberships(user._id, { session });

            const videos = await Video.find({ owner: user._id })
                .select("_id").session(session).lean();
            for (const video of videos) {
                await tombstoneVideo(video._id, { session });
            }

            await cleanupUserPersonalRecords(user._id, { session });

            const completedAt = new Date();
            await User.updateOne(
                { _id: user._id },
                { $set: { databaseCleanupStatus: "complete", databaseCleanupCompletedAt: completedAt },
                    $unset: { databaseCleanupClaim: 1 } },
                { session }
            );
            result = { status: "complete", completedAt };
        });
        return result;
    } finally {
        await session.endSession();
    }
};

export { cleanupAccount };
