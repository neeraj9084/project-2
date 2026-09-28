import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
    {
        reporter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        video: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Video",
            required: true,
        },

        reason: {
            type: String,
            required: true,
            trim: true,
            enum: [
                "spam",
                "misleading",
                "violence",
                "hate",
                "sexual_content",
                "harassment",
                "copyright",
                "illegal_content",
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

// Same user cannot report the same video multiple times
reportSchema.index(
    {
        reporter: 1,
        video: 1,
    },
    {
        unique: true,
    }
);

// Useful for admin moderation
reportSchema.index({
    video: 1,
    status: 1,
});

reportSchema.index({
    createdAt: -1,
});

export const Report =
    mongoose.models.Report ||
    mongoose.model("Report", reportSchema);