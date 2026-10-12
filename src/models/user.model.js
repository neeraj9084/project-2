import mongoose, { Schema } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const userSchema = new Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
            match: /^[a-z0-9_@.]+$/,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        fullName: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },

        bio: {
            type: String,
            trim: true,
            maxlength: 150,
            default: "",
        },

        // Avatar optional hai
        avatar: {
            type: String,
            default: "",
        },

        // Cover optional hai
        coverImage: {
            type: String,
            default: "",
        },

        watchHistory: [
            {
                type: Schema.Types.ObjectId,
                ref: "Video",
            },
        ],

        password: {
            type: String,
            required: [true, "Password is required"],
        },

        refreshToken: {
            type: String,
        },

        isVerified: {
            type: Boolean,
            default: false,
        },

        verificationOtp: {
            type: String,
        },

        verificationOtpExpiry: {
            type: Date,
        },

        verificationOtpAttempts: {
            type: Number,
            default: 0,
        },

        newEmail: {
            type: String,
        },

        changeEmail: {
            type: String,
        },

        emailChangeOtp: {
            type: String,
        },

        emailChangeOtpExpiry: {
            type: Date,
        },

        emailChangeOtpAttempts: {
            type: Number,
            default: 0,
        },

        passwordResetToken: {
            type: String,
        },

        forgotPasswordOtp: {
            type: String,
        },

        forgotPasswordOtpExpiry: {
            type: Date,
        },

        forgotPasswordOtpAttempts: {
            type: Number,
            default: 0,
        },

        accountRecoveryOtp: {
            type: String,
        },

        accountRecoveryOtpExpiry: {
            type: Date,
        },

        accountRecoveryOtpAttempts: {
            type: Number,
            default: 0,
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user",
        },
    },
    {
        timestamps: true,
    }
);

userSchema.pre("save", async function () {
    if (!this.isModified("password")) {
        return;
    }

    if (this.password.startsWith("$2b$")) {
        return;
    }

    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            username: this.username,
            fullName: this.fullName,
            role: this.role,
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
        }
    );
};

userSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        {
            _id: this._id,
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
        }
    );
};

export const User = mongoose.model("User", userSchema);