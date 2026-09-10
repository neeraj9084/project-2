import mongoose from "mongoose";

const likeSchema = new mongoose.Schema({
    video: {
        type: mongoose.Schema.Types.objectId,
        ref: "Video",
        required: [true, "Video ID is required"],
        index: true
    },
    likedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: [true, "User ID is required"],
          index: true
    }
  },
    {
        timestamps: true
    }
)

likeSchema.index(
    { video: 1, likedBy: 1},
    { unique: true}
);

export const Like = mongoose.model("Like", likeSchema);