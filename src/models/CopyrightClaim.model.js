import mongoose from "mongoose";

const copyrightClaimSchema = new mongoose.Schema(
    {
        claimant: {
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
        },

        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },

        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
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

copyrightClaimSchema.index({
    claimant: 1,
    video: 1,
});

copyrightClaimSchema.index({
    video: 1,
    status: 1,
});

export const CopyrightClaim =
    mongoose.models.CopyrightClaim ||
    mongoose.model("CopyrightClaim", copyrightClaimSchema);