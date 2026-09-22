import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({

    content: {
        type: String,
        required: [true, "Comment content is required"],
        trim: true,
        maxlength: [1000, "Comment cannot exceed 1000 character"]
    },

    video: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Video",
        required: [true, "Video ID is required"],
        index: true
    },

    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "Comment owner is required"],
        index: true
    },

    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }]

},
{
    timestamps: true,
    versionKey: false
});

commentSchema.index({
    video: 1,
    createdAt: -1
});

commentSchema.index({
    owner: 1,
    createdAt: -1
});

export const Comment =
    mongoose.models.Comment ||
    mongoose.model("Comment", commentSchema);