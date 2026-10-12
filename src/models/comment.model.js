import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
    {
        // ================= Comment Content ================= //

        content: {
            type: String,
            required: [true, "Comment content is required"],
            trim: true,
            maxlength: [
                1000,
                "Comment cannot exceed 1000 characters"
            ]
        },


        // ================= Video ================= //

        video: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Video",
            required: [true, "Video ID is required"],
            index: true
        },


        // ================= Comment Owner ================= //

        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Comment owner is required"],
            index: true
        },


        // ================= Parent Comment ================= //

        // null = normal/top-level comment
        // comment ID = reply to that comment
        parentComment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Comment",
            default: null,
            index: true
        },


        // ================= Comment Likes ================= //

        likes: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            }
        ]
    },
    {
        timestamps: true,
        versionKey: false
    }
);


// ================= Indexes ================= //

// Get comments of a video
commentSchema.index({
    video: 1,
    createdAt: -1
});


// Get comments/replies of a particular user
commentSchema.index({
    owner: 1,
    createdAt: -1
});


// Get replies of a particular comment
commentSchema.index({
    parentComment: 1,
    createdAt: -1
});


// Get top-level comments of a video
commentSchema.index({
    video: 1,
    parentComment: 1,
    createdAt: -1
});


// ================= Model ================= //

export const Comment =
    mongoose.models.Comment ||
    mongoose.model("Comment", commentSchema);