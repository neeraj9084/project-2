import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";


const videoSchema = new Schema(
    {
        videoFile: {
            type: String,
            required: true
        },

        thumbnail: {
            type: String,
            required: true
        },

        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },

        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 5000
        },

        duration: {
            type: Number,
            required: true,
            min: 0
        },

        views: {
            type: Number,
            default: 0,
            min: 0
        },

        isPublished: {
            type: Boolean,
            default: true
        },

        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        videoPublicId: {
            type: String,
            required: true
        },

        thumbnailPublicId: {
            type: String,
            required: true
}
    },
    {
        timestamps: true
    }
);


videoSchema.plugin(mongooseAggregatePaginate);


// Useful indexes
videoSchema.index({ owner: 1 });
videoSchema.index({ isPublished: 1, createdAt: -1 });


export const Video = mongoose.model("Video", videoSchema);