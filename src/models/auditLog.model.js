import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
    {
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        action: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },

        resourceType: {
            type: String,
            enum: [
                "user",
                "video",
                "comment",
                "report",
                "copyright_claim",
                "order",
                "system",
                "other",
            ],
            default: "other",
        },

        resourceId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },

        description: {
            type: String,
            trim: true,
            maxlength: 500,
            default: null,
        },

        method: {
            type: String,
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            default: null,
        },

        endpoint: {
            type: String,
            trim: true,
            maxlength: 500,
            default: null,
        },

        ipAddress: {
            type: String,
            trim: true,
            maxlength: 100,
            default: null,
        },

        userAgent: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: null,
        },

        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ resourceType: 1, createdAt: -1 });
auditLogSchema.index({ resourceId: 1, createdAt: -1 });

export const AuditLog =
    mongoose.models.AuditLog ||
    mongoose.model("AuditLog", auditLogSchema);