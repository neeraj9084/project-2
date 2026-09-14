import mongoose from "mongoose";

const playlistSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Playlist name is required"],
            trim: true
        },

        description: {
            type: String,
            trim: true
        },

        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Owner ID is required"],
            index: true
        },

        videos: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Video"
            }
        ],

        isPublic: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

playlistSchema.index({
    owner: 1,
    createdAt: -1
});

export const Playlist =
    mongoose.models.Playlist ||
    mongoose.model("Playlist", playlistSchema);