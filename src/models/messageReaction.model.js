import mongoose from "mongoose";

const messageReactionSchema = new mongoose.Schema(
    {
        message: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message",
            required: true,
        },

        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        reaction: {
            type: String,
            required: true,
            trim: true,
            enum: [
                "❤️",
                "😂",
                "👍",
                "👎",
                "😮",
                "😢",
                "😡",
                "🙏",
            ],
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// One user can have only one reaction on a message
messageReactionSchema.index(
    { message: 1, user: 1 },
    { unique: true }
);

export const MessageReaction = mongoose.model(
    "MessageReaction",
    messageReactionSchema
);