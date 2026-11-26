import mongoose from "mongoose";
import { mediaRegistrySchema } from "./mediaRegistryMetadata.js";

const notificationSchema = new mongoose.Schema(
    {
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        type: {
            type: String,
            required: true,
            enum: [
                "report_update",
                "video_report_update",
                "comment_report_update",
                "like",
                "comment",
                "subscription",
                "system",
            ],
        },

        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },

        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500,
        },

        entityType: {
            type: String,
            enum: [
                "report",
                "video",
                "comment",
                "user",
                "system",
            ],
            default: null,
        },

        entityId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },

        data: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        adminOnly: { type: Boolean, default: false, select: false },
        mediaRegistry: { type: mediaRegistrySchema, default: undefined, select: false },

        isRead: {
            type: Boolean,
            default: false,
        },

        readAt: {
            type: Date,
            default: null,
        },

        expiresAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

notificationSchema.index({
    recipient: 1,
    createdAt: -1,
});

notificationSchema.index({
    recipient: 1,
    isRead: 1,
    createdAt: -1,
});

// This index does not delete documents. Existing TTL indexes require migration.
notificationSchema.index({ expiresAt: 1, _id: 1 }, { name: "notification_expiration_scan" });

export const Notification =
    mongoose.models.Notification ||
    mongoose.model("Notification", notificationSchema);
