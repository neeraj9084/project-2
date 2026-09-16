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

export const Share =
    mongoose.models.Share ||
    mongoose.model("Share", shareSchema);