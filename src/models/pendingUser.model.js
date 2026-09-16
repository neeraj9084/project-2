import mongoose from "mongoose";
import bcrypt from "bcrypt";

const pendingUserSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            unique: true
        },

        username: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            unique: true
        },

        password: {
            type: String,
            required: true
        },

        avatar: {
            type: String,
            required: true
        },

        coverImage: {
            type: String,
            default: ""
        },

        verificationOtp: {
            type: String,
            required: true
        },

        verificationOtpExpiry: {
            type: Date,
            required: true
        },

        verificationOtpAttempts: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

// Password hash
pendingUserSchema.pre("save", async function () {

    if (!this.isModified("password")) {
        return;
    }

    this.password = await bcrypt.hash(this.password, 10);
});

// Pending user automatically delete after OTP expiry
pendingUserSchema.index(
    { verificationOtpExpiry: 1 },
    { expireAfterSeconds: 0 }
);

export const PendingUser = mongoose.model(
    "PendingUser",
    pendingUserSchema
);