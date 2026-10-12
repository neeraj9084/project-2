import mongoose, { Schema } from "mongoose";

const momentMusicSchema = new Schema(
    {
        provider: {
            type: String,
            trim: true,
            maxlength: 50
        },

        trackId: {
            type: String,
            trim: true,
            maxlength: 200
        },

        title: {
            type: String,
            trim: true,
            maxlength: 200
        },

        artist: {
            type: String,
            trim: true,
            maxlength: 200
        },

        image: {
            type: String,
            trim: true,
            maxlength: 1000
        },

        previewUrl: {
            type: String,
            trim: true,
            maxlength: 2000
        },

        officialUrl: {
            type: String,
            trim: true,
            maxlength: 2000
        }
    },
    {
        _id: false
    }
);

const momentSchema = new Schema(
    {
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Moment owner is required"],
            index: true
        },

        mediaUrl: {
            type: String,
            required: [true, "Moment media URL is required"],
            trim: true
        },

        mediaPublicId: {
            type: String,
            required: [true, "Moment media public ID is required"],
            trim: true
        },

        mediaType: {
            type: String,
            enum: {
                values: ["image", "video"],
                message: "Media type must be image or video"
            },
            required: [true, "Moment media type is required"]
        },

        caption: {
            type: String,
            trim: true,
            maxlength: [500, "Caption cannot exceed 500 characters"],
            default: ""
        },

        music: {
            type: momentMusicSchema,
            default: null
        },

        views: {
            type: Number,
            default: 0,
            min: 0
        },

        expiresAt: {
            type: Date,
            required: true
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

momentSchema.index({
    owner: 1,
    createdAt: -1
});

momentSchema.index(
    {
        expiresAt: 1
    },
    {
        expireAfterSeconds: 0
    }
);

export const Moment =
    mongoose.models.Moment ||
    mongoose.model("Moment", momentSchema);