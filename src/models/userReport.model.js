import mongoose from "mongoose";

const userReportSchema = new mongoose.Schema(
    {
        // User who submitted the report
        reporter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // Report is only for users
        reportType: {
            type: String,
            required: true,
            enum: ["user"],
            default: "user",
        },

        // User being reported
        reportedUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        reason: {
            type: String,
            required: true,
            trim: true,
            enum: [
                "spam",
                "harassment",
                "hate",
                "impersonation",
                "fake_account",
                "scam_or_fraud",
                "inappropriate_profile",
                "sexual_content",
                "violence",
                "threats",
                "misleading",
                "copyright",
                "illegal_activity",
                "other",
            ],
        },

        description: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: null,
        },

        status: {
            type: String,
            enum: [
                "pending",
                "reviewed",
                "resolved",
                "rejected",
            ],
            default: "pending",
        },

        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        reviewedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// ==================== INDEXES ====================

// Same user cannot report the same user multiple times
userReportSchema.index(
    {
        reporter: 1,
        reportedUser: 1,
    },
    {
        unique: true,
    }
);

// Useful for admin moderation
userReportSchema.index({
    reportType: 1,
    status: 1,
});

userReportSchema.index({
    createdAt: -1,
});

export const UserReport =
    mongoose.models.UserReport ||
    mongoose.model("UserReport", userReportSchema);