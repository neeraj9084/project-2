import mongoose from "mongoose";

const watchHistorySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User ID is required"],
            index: true
        },

        video: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Video",
            required: [true, "Video ID is required"],
            index: true
        },

        watchedAt: {
            type: Date,
            default: Date.now,
            index: true
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

watchHistorySchema.index({
    user: 1,
    watchedAt: -1
});


watchHistorySchema.index(
    {
        user: 1,
        video: 1
    },
    {
        unique: true
    }
);

export const WatchHistory =
    mongoose.models.WatchHistory ||
    mongoose.model("WatchHistory", watchHistorySchema);