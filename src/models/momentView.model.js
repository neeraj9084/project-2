import mongoose, { Schema } from "mongoose";

const momentViewSchema = new Schema(
    {
        moment: {
            type: Schema.Types.ObjectId,
            ref: "Moment",
            required: true,
            index: true
        },

        viewer: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        viewedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        versionKey: false
    }
);

momentViewSchema.index(
    {
        moment: 1,
        viewer: 1
    },
    {
        unique: true
    }
);

export const MomentView =
    mongoose.models.MomentView ||
    mongoose.model("MomentView", momentViewSchema);