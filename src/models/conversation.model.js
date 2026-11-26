import mongoose from "mongoose";
import { mediaRegistrySchema } from "./mediaRegistryMetadata.js";

const directReadStatusSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        lastReadAt: {
            type: Date,
            default: null
        },

        clearedAt: {
            type: Date,
            default: null
        },

        isHidden: {
            type: Boolean,
            default: false
        },

        isArchived: { type: Boolean, default: false }
    },
    {
        _id: false
    }
);

const conversationSchema = new mongoose.Schema(
    {
        participants: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true
            }
        ],

        type: {
            type: String,
            enum: ["direct", "group"],
            default: "direct",
            required: true
        },

        name: {
            type: String,
            trim: true,
            maxlength: 100,
            default: null
        },

        avatar: {
            type: String,
            trim: true,
            default: null
        },

        mediaRegistry: { type: mediaRegistrySchema, default: undefined, select: false },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        lastMessage: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message",
            default: null
        },

        lastMessageAt: {
            type: Date,
            default: null
        },

        directReadStatus: {
            type: [directReadStatusSchema],
            default: []
        },

        isActive: {
            type: Boolean,
            default: true
        },
        // Serializes all group membership mutations on the conversation record.
        membershipVersion: { type: Number, default: 0 }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

conversationSchema.index({
    participants: 1,
    lastMessageAt: -1
});

conversationSchema.index({
    type: 1,
    lastMessageAt: -1
});

export const Conversation =
    mongoose.models.Conversation ||
    mongoose.model("Conversation", conversationSchema);
