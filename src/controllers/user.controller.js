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
import { videoUploadIdentity, registerVideoMedia, queueVideoMedia, unregisterVideoMedia } from "../services/videoAssetRegistry.service.js";
import { verifiedAttachment } from "../services/messageAttachmentRegistry.service.js";
import { fenceMediaCoverage } from "../services/mediaCoverageBarrier.service.js";
import { registerAssetReference } from "../services/cloudinaryAssetReference.service.js";
import { CloudinaryAsset } from "../models/cloudinaryAsset.model.js";
import { retirePendingUser } from "../services/expirePendingUser.service.js";

const retireRegistration = async (id, options = {}) => {
    const session = await mongoose.startSession();
    try { return await session.withTransaction(() => retirePendingUser(id, { ...options, session })); }
    finally { await session.endSession(); }
};
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

    // Generate OTP
    const otp = crypto
        .randomInt(100000, 1000000)
        .toString();

    const otpExpiry = new Date(
        Date.now() + 10 * 60 * 1000
    );

    // Create pending registration
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
    const previous = await PendingUser.find({ $or: [{ email: normalizedEmail }, { username: normalizedUsername }] }).select("_id").session(session).lean();
    for (const item of previous) await retirePendingUser(item._id, { session });
    await PendingUser.create([{
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
    }], { session });
    }); } finally { await session.endSession(); }

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
        await retireRegistration(pendingUser._id, { expiredOnly: true });

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

            await retireRegistration(pendingUser._id, { expectedOtp: pendingUser.verificationOtp });

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

    const session = await mongoose.startSession();
    let user;
    try {
      await session.withTransaction(async () => {
    // Re-read and consume the pending record in the same transaction as the user.
    const pendingUser = await PendingUser.findById(decodedToken._id).select("+mediaRegistry").session(session);

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
    }).session(session);

    if (existedUser) {
        throw new ApiError(
            409,
            "User with email or username already exists"
        );
    }

    // Create actual user
    await fenceMediaCoverage({ session });
    const created = await User.create([{
        fullName: pendingUser.fullName,
        email: pendingUser.email,
        username: pendingUser.username,

        password,

        // Optional profile images
        avatar: pendingUser.avatar || "",
        coverImage: pendingUser.coverImage || "",

        isVerified: true,
    }], { session });
    user = created[0];

    for (const slot of ["avatar", "coverImage"]) {
        const url = pendingUser[slot];
        const metadata = pendingUser.mediaRegistry?.[slot];
        if (!url && !metadata) continue;
        const verified = verifiedAttachment({ url, publicId: metadata?.publicId,
            resourceType: metadata?.resourceType, deliveryType: metadata?.deliveryType, mediaRegistry: metadata });
        const asset = verified && await CloudinaryAsset.findOne({ _id: verified.asset, cloudName: verified.cloudName,
            publicId: verified.publicId, resourceType: verified.resourceType, deliveryType: verified.deliveryType }).session(session).lean();
        if (asset) {
            await registerAssetReference({ assetId: verified.asset, sourceType: slot, sourceId: user._id, userId: user._id, session });
            user.set(`${slot}PublicId`, verified.publicId);
            user.set(`${slot}DeliveryType`, verified.deliveryType);
            user.set(`mediaRegistry.${slot}`, { ...verified.toObject?.() || verified, status: "linked" });
        } else {
            // Keep legacy identifiers for review; they are not proof of identity.
            user.set(`mediaRegistry.${slot}`, { ...(metadata?.toObject?.() || {}), url, status: "unresolved", identityVerified: false });
        }
    }
    await user.save({ session });

    // Delete pending registration
    const removed = await PendingUser.deleteOne({
        _id: pendingUser._id,
    }, { session });
    if (removed.deletedCount !== 1) throw new Error("Registration session changed");
      });
    } finally { await session.endSession(); }

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

// Replace profile media and its registry reference atomically.
const replaceProfileMedia = async (userId, field, uploaded) => {
    let metadata;
    try {
        metadata = videoUploadIdentity(uploaded, "image");
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const user = await User.findById(userId).select("+mediaRegistry +avatarPublicId +coverImagePublicId +avatarDeliveryType +coverImageDeliveryType").session(session);
                if (!user) throw new ApiError(404, "User not found");
                const previous = user.mediaRegistry?.[field];
                await registerVideoMedia({ metadata, kind: field, videoId: userId, owner: userId, session });
                if (previous?.asset !== metadata.asset && (user[field] || user[`${field}PublicId`])) {
                    const old = verifiedAttachment({ url: user[field], publicId: user[`${field}PublicId`], resourceType: "image",
                        deliveryType: user[`${field}DeliveryType`], mediaRegistry: previous })
                        ? previous : { url: user[field], publicId: user[`${field}PublicId`], resourceType: "image",
                            deliveryType: user[`${field}DeliveryType`] };
                    await queueVideoMedia({ metadata: old, kind: field, videoId: userId, owner: userId, session });
                    await unregisterVideoMedia({ metadata: old, kind: field, videoId: userId, owner: userId, session });
                }
                user[field] = metadata.url;
                user[`${field}PublicId`] = metadata.publicId;
                user[`${field}DeliveryType`] = metadata.deliveryType;
                if (!user.mediaRegistry) user.mediaRegistry = {};
                user.mediaRegistry[field] = metadata;
                await user.save({ session, validateBeforeSave: false });
            });
        } finally { await session.endSession(); }
    } catch (error) {
        const failed = metadata || { url: uploaded.secure_url || uploaded.url, publicId: uploaded.public_id,
            resourceType: uploaded.resource_type, deliveryType: uploaded.type };
        try { await queueVideoMedia({ metadata: failed, kind: field, videoId: userId, owner: userId, suffix: "failed-upload" }); }
        catch (queueError) { console.error("Failed to queue profile media:", queueError); }
        throw error;
    }
    return User.findById(userId).select("-password -refreshToken");
};

//===================== updateAavatar =========================/

const updateAvatar = asyncHandler(async(req, res) => {
    
    const avatarLocalPath = req.file?.path;

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required")
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath, { user: req.user._id, sourceId: req.user._id, sourceType: "avatar" });

    if(!avatar){
        throw new ApiError(400, "Avatar upload failed")
    }

    const updatedUser = await replaceProfileMedia(req.user._id, "avatar", avatar);

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
  
    const coverImage = await uploadOnCloudinary(coverImageLocalPath, { user: req.user._id, sourceId: req.user._id, sourceType: "coverImage" })

    if(!coverImage){
        throw new ApiError(400, "Cover image upload failed")
    }

const updatedUser = await replaceProfileMedia(req.user._id, "coverImage", coverImage)

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

    const isObjectId = mongoose.Types.ObjectId.isValid(userId);

    const user = isObjectId
        ? await User.findById(userId).select(
              "_id username fullName bio avatar coverImage isVerified createdAt"
          )
        : await User.findOne({
              username: userId.replace(/^@+/, "").toLowerCase(),
          }).select(
              "_id username fullName bio avatar coverImage isVerified createdAt"
          );

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const targetUserId = user._id;
    const currentUserId = req.user._id;

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);
    const skip = (page - 1) * limit;

    const [
        followers,
        following,
        totalVideos,
        videos,
        isFollowing,
    ] = await Promise.all([
        Subscribe.countDocuments({
            channel: targetUserId,
        }),

        Subscribe.countDocuments({
            subscriber: targetUserId,
        }),

        Video.countDocuments({
            owner: targetUserId,
            isPublished: true,
        }),

        Video.find({
            owner: targetUserId,
            isPublished: true,
        })
            .select("_id thumbnail title duration views createdAt")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),

        Subscribe.exists({
            subscriber: currentUserId,
            channel: targetUserId,
        }),
    ]);

    const totalPages = Math.ceil(totalVideos / limit);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                user,
                stats: {
                    videos: totalVideos,
                    followers,
                    following,
                },
                isFollowing: Boolean(isFollowing),
                isOwnProfile:
                    currentUserId.toString() === targetUserId.toString(),
                videos,
                pagination: {
                    currentPage: page,
                    limit,
                    totalVideos,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1,
                },
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
