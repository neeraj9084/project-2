import mongoose from "mongoose";
import bcrypt from "bcrypt";

const pendingUserSchema = new mongoose.Schema(
    {
        // ==========================================
        // BASIC USER INFORMATION
        // ==========================================

        fullName: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            unique: true,
        },

        username: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            unique: true,
        },

        // ==========================================
        // PASSWORD
        // ==========================================

        password: {
            type: String,
            required: false,
            default: undefined,
        },

        // ==========================================
        // PROFILE IMAGES
        // ==========================================

        avatar: {
            type: String,
            default: "",
        },

        coverImage: {
            type: String,
            default: "",
        },

        // ==========================================
        // EMAIL VERIFICATION OTP
        // ==========================================

        verificationOtp: {
            type: String,
            default: null,
        },

        verificationOtpExpiry: {
            type: Date,
            required: true,
        },

        verificationOtpAttempts: {
            type: Number,
            default: 0,
        },

        isEmailVerified: {
            type: Boolean,
            default: false,
        },
    },

    {
        timestamps: true,
    }
);

// ==========================================
// PASSWORD HASH
// ==========================================

pendingUserSchema.pre("save", async function () {
    if (!this.isModified("password") || !this.password) {
        return;
    }

    this.password = await bcrypt.hash(
        this.password,
        10
    );
});

// ==========================================
// AUTO DELETE EXPIRED REGISTRATION
// ==========================================

pendingUserSchema.index(
    {
        verificationOtpExpiry: 1,
    },
    {
        expireAfterSeconds: 0,
    }
);

export const PendingUser = mongoose.model(
    "PendingUser",
    pendingUserSchema
);