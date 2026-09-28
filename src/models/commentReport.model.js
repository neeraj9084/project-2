import mongoose from "mongoose";

const commentReportSchema = new mongoose.Schema(
    {
        reporter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        comment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Comment",
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
                "sexual_content",
                "violence",
                "threats",
                "misleading",
                "copyright",
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

// Same user cannot report the same comment multiple times
commentReportSchema.index(
    {
        reporter: 1,
        comment: 1,
    },
    {
        unique: true,
    }
);

// Useful for admin moderation
commentReportSchema.index({
    comment: 1,
    status: 1,
});

commentReportSchema.index({
    createdAt: -1,
});

export const CommentReport =
    mongoose.models.CommentReport ||
    mongoose.model("CommentReport", commentReportSchema);