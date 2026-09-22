import mongoose from "mongoose";

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
        }
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
        }
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