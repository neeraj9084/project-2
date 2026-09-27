import mongoose from "mongoose";

const blockedUserSchema = new mongoose.Schema(
    {
        blocker: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Blocker user is required"],
            index: true
        },

        blockedUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Blocked user is required"],
            index: true
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);


blockedUserSchema.pre("validate", function () {

    if (
        this.blocker &&
        this.blockedUser &&
        this.blocker.equals(this.blockedUser)
    ) {
        throw new Error("User cannot block themselves");
    }
});


// Prevent duplicate block relationship
blockedUserSchema.index(
    {
        blocker: 1,
        blockedUser: 1
    },
    {
        unique: true
    }
);


// Fast reverse lookup
blockedUserSchema.index({
    blockedUser: 1,
    blocker: 1
});


export const BlockedUser =
    mongoose.models.BlockedUser ||
    mongoose.model("BlockedUser", blockedUserSchema);