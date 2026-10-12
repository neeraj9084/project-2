import mongoose from "mongoose";

const shareSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Owner is required"],
            index: true
        },

        video: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Video",
            required: [true, "Video is required"],
            index: true
        },

        shareType: {
            type: String,
            enum: [
                "copy_link",
                "chat",
                "whatsapp",
                "facebook",
                "instagram",
                "telegram",
                "twitter",
                "other"
            ],
            default: "copy_link",
            index: true
        },

        conversation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
            default: null,
            index: true
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);


shareSchema.index({
    owner: 1,
    createdAt: -1
});


shareSchema.index({
    video: 1,
    createdAt: -1
});


shareSchema.index({
    video: 1,
    shareType: 1,
    createdAt: -1
});


shareSchema.index({
    conversation: 1,
    createdAt: -1
});

export const Share =
    mongoose.models.Share ||
    mongoose.model("Share", shareSchema);