import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = new Schema(
    {
        videoFile: {
            type: String,
            required: [true, "Video file is required"],
            trim: true
        },

        thumbnail: {
            type: String,
            required: [true, "Thumbnail is required"],
            trim: true
        },

        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
            maxlength: [200, "Title cannot exceed 200 characters"]
        },

        description: {
            type: String,
            required: [true, "Description is required"],
            trim: true,
            maxlength: [5000, "Description cannot exceed 5000 characters"]
        },

        duration: {
            type: Number,
            required: [true, "Video duration is required"],
            min: [0, "Duration cannot be negative"]
        },

        views: {
            type: Number,
            default: 0,
            min: [0, "Views cannot be negative"]
        },

        isPublished: {
            type: Boolean,
            default: true
        },

        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Video owner is required"],
            index: true
        },

        videoPublicId: {
            type: String,
            required: [true, "Video public ID is required"],
            trim: true
        },

        thumbnailPublicId: {
            type: String,
            required: [true, "Thumbnail public ID is required"],
            trim: true
        }
    },
    {
        timestamps: true
    }
);

videoSchema.plugin(mongooseAggregatePaginate);

videoSchema.index({
    owner: 1,
    createdAt: -1
});

videoSchema.index({
    isPublished: 1,
    createdAt: -1
});
videoSchema.index({
    title: "text",
    description: "text"
});

export const Video =
    mongoose.models.Video ||
    mongoose.model("Video", videoSchema);