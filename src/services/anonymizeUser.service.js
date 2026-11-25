import crypto from "crypto";
import mongoose from "mongoose";
import { User } from "../models/user.model.js";

// Pass a session to include this atomic update in a caller's transaction.
const anonymizeUser = async (userId, { session } = {}) => {
    if (!mongoose.isValidObjectId(userId)) {
        throw new Error("Invalid user ID");
    }

    const suffix = crypto.randomBytes(24).toString("hex");
    const now = new Date();
    const user = await User.findOneAndUpdate(
        { _id: userId, deletionRequestedAt: { $ne: null }, anonymizedAt: null },
        [
            {
                $set: {
                    deletionMedia: {
                        avatar: { $ifNull: ["$avatar", ""] },
                        coverImage: { $ifNull: ["$coverImage", ""] },
                        avatarPublicId: { $ifNull: ["$avatarPublicId", null] },
                        coverImagePublicId: { $ifNull: ["$coverImagePublicId", null] },
                        avatarDeliveryType: { $ifNull: ["$avatarDeliveryType", null] },
                        coverImageDeliveryType: { $ifNull: ["$coverImageDeliveryType", null] }
                    },
                    username: `deleted_${suffix}`,
                    email: `deleted_${suffix}@invalid.invalid`,
                    fullName: "Deleted User",
                    bio: "",
                    avatar: "",
                    coverImage: "",
                    isActive: false,
                    isVerified: false,
                    role: "user",
                    anonymizedAt: now
                }
            },
            {
                $unset: [
                    "password", "refreshToken", "avatarPublicId", "coverImagePublicId", "avatarDeliveryType", "coverImageDeliveryType", "verificationOtp", "verificationOtpExpiry",
                    "newEmail", "changeEmail", "emailChangeOtp", "emailChangeOtpExpiry",
                    "passwordResetToken", "forgotPasswordOtp", "forgotPasswordOtpExpiry",
                    "accountRecoveryOtp", "accountRecoveryOtpExpiry"
                ]
            }
        ],
        { new: true, session, updatePipeline: true }
    ).select("_id anonymizedAt");

    if (user) return user;

    const existing = await User.findById(userId).select("_id anonymizedAt").session(session || null);
    if (existing?.anonymizedAt) return existing;
    throw new Error("User not found or deletion was not requested");
};

export { anonymizeUser };
