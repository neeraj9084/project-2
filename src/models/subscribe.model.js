import mongoose from "mongoose";

const subscribeSchema = new mongoose.Schema(
    {
        subscriber: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Subscriber ID is required"],
            index: true
        },

        channel: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Channel ID is required"],
            index: true
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

subscribeSchema.index(
    { subscriber: 1, channel: 1 },
    { unique: true }
);

export const Subscribe =
    mongoose.models.Subscribe ||
    mongoose.model("Subscribe", subscribeSchema);