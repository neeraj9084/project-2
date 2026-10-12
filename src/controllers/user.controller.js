import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { PendingUser } from "../models/pendingUser.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { sendEmail } from "../utils/sendEmail.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Subscribe } from "../models/subscribe.model.js";
import { Video } from "../models/video.model.js";
//====================== startRegistration ======================//

const startRegistration = asyncHandler(async (req, res) => {
    const {
        fullName,
        username,
        email,
    } = req.body;

    if (
        ![fullName, username, email].every(
            (field) => typeof field === "string" && field.trim()
        )
    ) {
        throw new ApiError(
            400,
            "Full name, username and email are required"
        );
    }

    const normalizedFullName = fullName.trim();
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

    // Username validation
    const usernameRegex = /^(?=.*[0-9])[a-z0-9_@.]+$/;

    if (!usernameRegex.test(normalizedUsername)) {
        throw new ApiError(
            400,
            "Username can only contain lowercase letters, numbers, _, @ and . and must contain at least one number"
        );
    }

    // Check already registered user
    const existedUser = await User.findOne({
        $or: [
            { email: normalizedEmail },
            { username: normalizedUsername },
        ],
    });

    if (existedUser) {
        throw new ApiError(
            409,
            "User with username or email already exists"
        );
    }

    // Remove any old pending registration
    await PendingUser.deleteMany({
        $or: [
            { email: normalizedEmail },
            { username: normalizedUsername },
        ],
    });

    // Generate OTP
    const otp = crypto
        .randomInt(100000, 1000000)
        .toString();

    const otpExpiry = new Date(
        Date.now() + 10 * 60 * 1000
    );

    // Create pending registration
    await PendingUser.create({
        fullName: normalizedFullName,
        email: normalizedEmail,
        username: normalizedUsername,

        password: undefined,

        avatar: "",
        coverImage: "",

        verificationOtp: otp,
        verificationOtpExpiry: otpExpiry,
        verificationOtpAttempts: 0,

        isEmailVerified: false,
    });

    // Send OTP
    await sendEmail({
        to: normalizedEmail,
        subject: "Verify your VideoApp account",
        text: `Your VideoApp verification OTP is ${otp}. This OTP will expire in 10 minutes.`,
    });

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                email: normalizedEmail,
            },
            "OTP sent successfully"
        )
    );
});

//====================== verifyRegistrationOtp ======================//

const verifyRegistrationOtp = asyncHandler(async (req, res) => {

    const { email, otp } = req.body;

    if (!email || !otp) {
        throw new ApiError(
            400,
            "Email and OTP are required"
        );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedOtp = otp.toString().trim();

    const pendingUser = await PendingUser.findOne({
        email: normalizedEmail
    });

    if (!pendingUser) {
        throw new ApiError(
            404,
            "Registration not found or OTP expired"
        );
    }

    // Already verified
    if (pendingUser.isEmailVerified) {
        throw new ApiError(
            400,
            "Email is already verified"
        );
    }

    // OTP expiry
    if (
        !pendingUser.verificationOtpExpiry ||
        pendingUser.verificationOtpExpiry < new Date()
    ) {
        await PendingUser.deleteOne({
            _id: pendingUser._id
        });

        throw new ApiError(
            400,
            "Verification OTP has expired"
        );
    }

    // OTP check
    if (pendingUser.verificationOtp !== normalizedOtp) {

        pendingUser.verificationOtpAttempts += 1;

        // 5 wrong attempts
        if (pendingUser.verificationOtpAttempts >= 5) {

            await PendingUser.deleteOne({
                _id: pendingUser._id
            });

            throw new ApiError(
                429,
                "Too many invalid OTP attempts. Please request a new OTP."
            );
        }

        await pendingUser.save();

        throw new ApiError(
            400,
            "Invalid verification OTP"
        );
    }

    // OTP correct
    pendingUser.isEmailVerified = true;

    // Clear OTP
    pendingUser.verificationOtp = null;

    // Keep registration alive for password completion
    pendingUser.verificationOtpExpiry = new Date(
        Date.now() + 10 * 60 * 1000
    );

    pendingUser.verificationOtpAttempts = 0;

    await pendingUser.save();

    // Registration completion token
    const registrationToken = jwt.sign(
        {
            _id: pendingUser._id,
            purpose: "registration-completion"
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: "10m"
        }
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                registrationToken,
                email: normalizedEmail
            },
            "Email verified successfully"
        )
    );
});

//====================== completeRegistration ======================//

const completeRegistration = asyncHandler(async (req, res) => {
    const {
        registrationToken,
        password,
        confirmPassword,
    } = req.body;

    if (
        !registrationToken ||
        !password ||
        !confirmPassword
    ) {
        throw new ApiError(
            400,
            "Registration token, password and confirm password are required"
        );
    }

    if (password !== confirmPassword) {
        throw new ApiError(
            400,
            "Password and confirm password do not match"
        );
    }

    if (password.length < 8) {
        throw new ApiError(
            400,
            "Password must be at least 8 characters"
        );
    }

    // Verify registration token
    let decodedToken;

    try {
        decodedToken = jwt.verify(
            registrationToken,
            process.env.ACCESS_TOKEN_SECRET
        );
    } catch (error) {
        throw new ApiError(
            401,
            "Registration session expired. Please start again."
        );
    }

    if (
        decodedToken?.purpose !== "registration-completion" ||
        !decodedToken?._id
    ) {
        throw new ApiError(
            401,
            "Invalid registration token"
        );
    }

    // Find pending user
    const pendingUser = await PendingUser.findById(
        decodedToken._id
    );

    if (!pendingUser) {
        throw new ApiError(
            404,
            "Registration session not found or expired"
        );
    }

    if (!pendingUser.isEmailVerified) {
        throw new ApiError(
            403,
            "Please verify your email first"
        );
    }

    // Final duplicate check
    const existedUser = await User.findOne({
        $or: [
            { email: pendingUser.email },
            { username: pendingUser.username },
        ],
    });

    if (existedUser) {
        throw new ApiError(
            409,
            "User with email or username already exists"
        );
    }

    // Create actual user
    const user = await User.create({
        fullName: pendingUser.fullName,
        email: pendingUser.email,
        username: pendingUser.username,

        password,

        // Optional profile images
        avatar: pendingUser.avatar || "",
        coverImage: pendingUser.coverImage || "",

        isVerified: true,
    });

    // Delete pending registration
    await PendingUser.deleteOne({
        _id: pendingUser._id,
    });

    const safeUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    return res.status(201).json(
        new ApiResponse(
            201,
            safeUser,
            "Account created successfully. Please login."
        )
    );
});

//====================== resendVerificationOtp ======================//

const resendVerificationOtp = asyncHandler(async (req, res) => {
    const { email } = req.body;

    // Email required
    if (!email || typeof email !== "string" || !email.trim()) {
        throw new ApiError(
            400,
            "Email is required"
        );
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Find pending registration
    const pendingUser = await PendingUser.findOne({
        email: normalizedEmail,
    });

    if (!pendingUser) {
        throw new ApiError(
            404,
            "Registration not found or already verified"
        );
    }

    // Email already verified
    if (pendingUser.isEmailVerified) {
        throw new ApiError(
            400,
            "Email is already verified. Please complete your registration."
        );
    }

    // Generate new 6 digit OTP
    const otp = crypto
        .randomInt(100000, 1000000)
        .toString();

    // OTP valid for 10 minutes
    const otpExpiry = new Date(
        Date.now() + 10 * 60 * 1000
    );

    // Update OTP details
    pendingUser.verificationOtp = otp;
    pendingUser.verificationOtpExpiry = otpExpiry;
    pendingUser.verificationOtpAttempts = 0;

    await pendingUser.save();

    // Send new OTP
    await sendEmail({
        to: normalizedEmail,
        subject: "Your new VideoApp verification OTP",
        text: `Your new VideoApp verification OTP is ${otp}. This OTP will expire in 10 minutes.`,
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                email: normalizedEmail,
            },
            "Verification OTP sent successfully"
        )
    );
});

//====================== updateAccountDetails ==========================//

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, username, bio } = req.body;

    if (
        !fullName?.trim() &&
        !username?.trim() &&
        bio === undefined
    ) {
        throw new ApiError(
            400,
            "At least one field is required"
        );
    }

    const user = await User.findById(req.user._id);

    if (!user) {
        throw new ApiError(
            404,
            "User not found"
        );
    }

    if (fullName?.trim()) {
        user.fullName = fullName.trim();
    }

    if (username?.trim()) {
        const normalizedUsername = username
            .trim()
            .toLowerCase();

        const checkUsername =
            /^(?=.*[0-9])[a-z0-9_@.]+$/;

        if (!checkUsername.test(normalizedUsername)) {
            throw new ApiError(
                400,
                "Username can only contain letters, numbers, _, @ and . and must contain at least one number"
            );
        }

        const existedUser = await User.findOne({
            username: normalizedUsername,
            _id: { $ne: req.user._id }
        });

        if (existedUser) {
            throw new ApiError(
                409,
                "Username already exists"
            );
        }

        user.username = normalizedUsername;
    }

    if (bio !== undefined) {
        const trimmedBio = bio.trim();

        if (trimmedBio.length > 150) {
            throw new ApiError(
                400,
                "Bio cannot exceed 150 characters"
            );
        }

        user.bio = trimmedBio;
    }

    await user.save();

    const updatedUser = await User.findById(
        user._id
    ).select("-password -refreshToken");

    return res.status(200).json(
        new ApiResponse(
            200,
            updatedUser,
            "Account details updated successfully"
        )
    );
});

//===================== updateAavatar =========================/

const updateAvatar = asyncHandler(async(req, res) => {
    
    const avatarLocalPath = req.file?.path;

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required")
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if(!avatar){
        throw new ApiError(400, "Avatar upload failed")
    }

    const user = await User.findById(req.user._id);

    if (!user) {
        throw new ApiError(
            404,
            "User not found"
        );
    }

    user.avatar = avatar.url;

    await user.save({
        validateBeforeSave: false
    });

    const updatedUser = await User.findById(
        user._id
    ).select("-password -refreshToken");

    return res.status(200).json(
        new ApiResponse(
            200,
            updatedUser,
            "Avatar updated successfully"
        )
    );
})

//===================== updateCoverImage =========================/

const updateCoverImage = asyncHandler(async(req, res) => {

    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath) {
        throw new ApiError(400, "Cover file required")
    }
  
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!coverImage){
        throw new ApiError(400, "Cover image upload failed")
    }

    const user = await User.findById(req.user._id);
    
    if(!user){
        throw new ApiError(404, " User not found")
    }

    user.coverImage = coverImage.url;

    await user.save({validateBeforeSave: false})

const updatedUser = await User.findById(user._id).select("-password -refreshToken")

return res.status(200).json(new ApiResponse(200, updatedUser,
    "Cover image updated successfully"))
});

//===================== getCurrentUser =========================//

const getCurrentUser = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const [followers, following, videos] = await Promise.all([
        Subscribe.countDocuments({
            channel: userId
        }),

        Subscribe.countDocuments({
            subscriber: userId
        }),

        Video.countDocuments({
            owner: userId,
            isPublished: true
        })
    ]);

    const user = await User.findById(userId).select(
        "_id username email fullName bio avatar coverImage isVerified isActive role createdAt"
    );

    if (!user) {
        throw new ApiError(
            404,
            "User not found"
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                user,
                stats: {
                    videos,
                    followers,
                    following
                },
                isOwnProfile: true
            },
            "Current user fetched successfully"
        )
    );
});

//------------------ changeUsername -----------------------//

const changeUsername = asyncHandler(async (req, res) => {

    const { username } = req.body;

    if (!username) {
        throw new ApiError(400, "Username is required");
    }

    const newUsername = username.toLowerCase().trim();

    // Username format check
   const usernameRegex = /^(?=.*[0-9])[a-z0-9_@.]+$/;

    if (!usernameRegex.test(newUsername)) {
        throw new ApiError(
            400,
           "Username can only contain lowercase letters, numbers, _, @ and . and must contain at least one number"
        );
    }

    // Check username already exists
    const usernameExists = await User.findOne({
        username: newUsername
    });

    if (usernameExists) {
        throw new ApiError(
            409,
            "Username already exists"
        );
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                username: newUsername
            }
        },
        {
            new: true,
            runValidators: true
        }
    ).select("-password -refreshToken");

    if (!user) {
        throw new ApiError(
            404,
            "User not found"
        );
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                user,
                "Username changed successfully"
            )
        );
});

//======================= getPublicProfile ============================//

const getPublicProfile = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(
            400,
            "Invalid user ID"
        );
    }

    const user = await User.findById(userId).select(
        "_id username fullName bio avatar coverImage isVerified createdAt"
    );

    if (!user) {
        throw new ApiError(
            404,
            "User not found"
        );
    }

    const page = Math.max(
        Number(req.query.page) || 1,
        1
    );

    const limit = Math.min(
        Math.max(Number(req.query.limit) || 12, 1),
        50
    );

    const skip = (page - 1) * limit;

    const [followers, following, totalVideos, videos, isFollowing] =
        await Promise.all([
            Subscribe.countDocuments({
                channel: userId
            }),

            Subscribe.countDocuments({
                subscriber: userId
            }),

            Video.countDocuments({
                owner: userId,
                isPublished: true
            }),

            Video.find({
                owner: userId,
                isPublished: true
            })
                .select(
                    "_id thumbnail title duration views createdAt"
                )
                .sort({
                    createdAt: -1
                })
                .skip(skip)
                .limit(limit),

            Subscribe.exists({
                subscriber: req.user._id,
                channel: userId
            })
        ]);

    const totalPages = Math.ceil(
        totalVideos / limit
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                user,
                stats: {
                    videos: totalVideos,
                    followers,
                    following
                },
                isFollowing: !!isFollowing,
                isOwnProfile:
                    req.user._id.toString() === userId,
                videos,
                pagination: {
                    currentPage: page,
                    limit,
                    totalVideos,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            },
            "Public profile fetched successfully"
        )
    );
});

export {
    startRegistration,
    verifyRegistrationOtp,
    completeRegistration,
    resendVerificationOtp,

    updateAccountDetails,
    updateAvatar,
    updateCoverImage,
    getCurrentUser,
    changeUsername,
    getPublicProfile
};
