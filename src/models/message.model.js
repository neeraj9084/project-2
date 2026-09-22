import mongoose from "mongoose";

const reactionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        emoji: {
            type: String,
            required: true,
            trim: true,
            maxlength: 10
        }
    },
    {
        _id: false
    }
);

const attachmentSchema = new mongoose.Schema(
    {
        url: {
            type: String,
            trim: true,
            required: true
        },

        publicId: {
            type: String,
            trim: true,
            default: null
        },

        fileName: {
            type: String,
            trim: true,
            maxlength: 255,
            default: null
        },

        mimeType: {
            type: String,
            trim: true,
            maxlength: 100,
            default: null
        },

        size: {
            type: Number,
            default: null
        }
    },
    {
        _id: false
    }
);

const messageSchema = new mongoose.Schema(
    {
        conversation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
            required: true,
            index: true
        },

        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        clientMessageId: {
            type: String,
            trim: true,
            maxlength: 100,
            default: undefined
        },

        type: {
            type: String,
            enum: [
                "text",
                "image",
                "video",
                "audio",
                "file"
            ],
            default: "text",
            required: true
        },

        content: {
            type: String,
            trim: true,
            maxlength: 5000,
            default: null
        },

        attachment: {
            type: attachmentSchema,
            default: null
        },

        replyTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message",
            default: null
        },

        forwardedFrom: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message",
            default: null
        },

        reactions: {
            type: [reactionSchema],
            default: []
        },

        isEdited: {
            type: Boolean,
            default: false
        },

        editedAt: {
            type: Date,
            default: null
        },

        isDeleted: {
            type: Boolean,
            default: false
        },

        deletedAt: {
            type: Date,
            default: null
        },

        deletedForEveryone: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

messageSchema.index({
    conversation: 1,
    createdAt: -1
});

messageSchema.index(
    {
        sender: 1,
        clientMessageId: 1
    },
    {
        unique: true,
        partialFilterExpression: {
            clientMessageId: {
                $type: "string"
            }
        }
    }
);

messageSchema.index({
    sender: 1,
    createdAt: -1
});

export const Message =
    mongoose.models.Message ||
    mongoose.model("Message", messageSchema);