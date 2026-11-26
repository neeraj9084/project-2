import { User } from "../models/user.model.js";

// Writes the same user documents changed by role/deactivation operations so
// recipient selection cannot commit from a stale administrator snapshot.
const activeModerationAdmins = async ({ session } = {}) => {
    if (!session?.inTransaction()) throw new Error("An active transaction is required");
    const filter = { role: "admin", isActive: true, deletionRequestedAt: null, anonymizedAt: null };
    const admins = await User.find(filter).select("_id").sort({ _id: 1 }).session(session).lean();
    for (const admin of admins) {
        const result = await User.updateOne({ _id: admin._id, ...filter }, { $inc: { moderationNotificationFence: 1 } }, { session, timestamps: false });
        if (result.matchedCount !== 1) throw new Error("Administrator eligibility changed");
    }
    return admins;
};
export { activeModerationAdmins };
