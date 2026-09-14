import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { PendingUser } from "../models/pendingUser.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { sendEmail } from "../utils/sendEmail.js";

//====================== registerUser ======================//

const registeUser = asyncHandler(async (req, res) => {

    const {
        fullName,
        email,
        username,
        password
    } = req.body;

    if (
        [fullName, email, username, password].some(
            (field) => field?.trim() === ""
        )
    ) {
        throw new ApiError(400, "All fields are required");
    }

    const normalizedEmail = email.toLowerCase();
    const normalizedUsername = username.toLowerCase();

    // Username validation
    const checkUsername = /^(?=.*[0-9])[a-z0-9_@.]+$/;

    if (!checkUsername.test(normalizedUsername)) {
        throw new ApiError(
            400,
            "Username can only contain letters, numbers, _, @ and . and must contain at least one number"
        );
    }

    // Check already registered user
    const existedUser = await User.findOne({
        $or: [
            { email: normalizedEmail },
            { username: normalizedUsername }
        ]
    });

    if (existedUser) {
        throw new ApiError(
            409,
            "User with username or email already exists"
        );
    }

    // Check pending registration
    const pendingUser = await PendingUser.findOne({
        $or: [
            { email: normalizedEmail },
            { username: normalizedUsername }
        ]
    });

    if (pendingUser) {
        throw new ApiError(
            409,
            "Email or username verification is already pending. Please verify OTP or resend OTP."
        );
    }

    // Avatar path
    let avatarLocalPath;

    if (
        req.files &&
        Array.isArray(req.files.avatar) &&
        req.files.avatar.length > 0
    ) {
        avatarLocalPath = req.files.avatar[0].path;
    }

    // Cover image path
    let coverImageLocalPath;

    if (
        req.files &&
        Array.isArray(req.files.coverImage) &&
        req.files.coverImage.length > 0
    ) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if (!avatarLocalPath) {
        throw new ApiError(
            400,
            "Avatar file is required"
        );
    }

    // Upload avatar
    const avatar = await uploadOnCloudinary(
        avatarLocalPath
    );

    if (!avatar) {
        throw new ApiError(
            400,
            "Avatar upload failed"
        );
    }

    // Upload cover image
    const coverImage = coverImageLocalPath
        ? await uploadOnCloudinary(coverImageLocalPath)
        : null;

    // Generate OTP
    const otp = Math.floor(
        100000 + Math.random() * 900000
    ).toString();

    const otpExpiry = new Date(
        Date.now() + 10 * 60 * 1000
    );

    // Create temporary user
    await PendingUser.create({
        fullName,
        email: normalizedEmail,
        username: normalizedUsername,
        password,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        verificationOtp: otp,
        verificationOtpExpiry: otpExpiry
    });

    // Send OTP
    await sendEmail({
        to: normalizedEmail,
        subject: "Verify your email",
        text: `Your verification OTP is ${otp}. This OTP will expire in 10 minutes.`
    });

    

    return res.status(201).json(
        new ApiResponse(
            201,
            {},
            "Registration successful. Please verify your email."
        )
    );
});

//====================== verifyEmail ======================//

const verifyEmail = asyncHandler(async (req, res) => {

    const {
        email,
        otp
    } = req.body;

    if (!email || !otp) {
        throw new ApiError(
            400,
            "Email and OTP are required"
        );
    }

    const normalizedEmail = email.toLowerCase();

    // Find temporary user
    const pendingUser = await PendingUser.findOne({
        email: normalizedEmail
    });

    if (!pendingUser) {
        throw new ApiError(
            404,
            "Registration not found or OTP expired"
        );
    }

    // Check OTP expiry
    if (
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

    // Check OTP
    if (pendingUser.verificationOtp !== otp) {
        throw new ApiError(
            400,
            "Invalid verification OTP"
        );
    }

    // Final check before creating actual user
    const existedUser = await User.findOne({
        $or: [
            { email: pendingUser.email },
            { username: pendingUser.username }
        ]
    });

    if (existedUser) {
        throw new ApiError(
            409,
            "User with email or username already exists"
        );
    }

    // Create actual verified user
    const user = await User.create({
        fullName: pendingUser.fullName,
        email: pendingUser.email,
        username: pendingUser.username,
        password: pendingUser.password,
        avatar: pendingUser.avatar,
        coverImage: pendingUser.coverImage,
        isVerified: true
    });

    // Delete temporary user
    await PendingUser.deleteOne({
        _id: pendingUser._id
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Email verified and account created successfully"
        )
    );
});

//====================== resendVerificationOtp ======================//

const resendVerificationOtp = asyncHandler(async (req, res) => {

    const {
        email
    } = req.body;

    if (!email) {
        throw new ApiError(
            400,
            "Email is required"
        );
    }

    const normalizedEmail = email.toLowerCase();

    // Find pending registration
    const pendingUser = await PendingUser.findOne({
        email: normalizedEmail
    });

    if (!pendingUser) {
        throw new ApiError(
            404,
            "Registration not found or already verified"
        );
    }

    // Generate new OTP
    const otp = Math.floor(
        100000 + Math.random() * 900000
    ).toString();

    const otpExpiry = new Date(
        Date.now() + 10 * 60 * 1000
    );

    // Update OTP
    pendingUser.verificationOtp = otp;
    pendingUser.verificationOtpExpiry = otpExpiry;

    await pendingUser.save();

    // Send new OTP
    await sendEmail({
        to: normalizedEmail,
        subject: "Your new verification OTP",
        text: `Your new verification OTP is ${otp}. This OTP will expire in 10 minutes.`
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Verification OTP sent successfully"
        )
    );
});

//====================== updateAccountDetails ==========================//

const updateAccountDetails = asyncHandler(async (req, res) => {

    const { fullName, username } = req.body;

    if (!fullName?.trim() && !username?.trim()) {
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

    // Update full name
    if (fullName?.trim()) {
        user.fullName = fullName.trim();
    }

    // Update username
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

    return res.status(200).json(
        new ApiResponse(
            200,
            req.user,
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
    const usernameRegex = /^[a-z0-9_@.]+$/;

    if (!usernameRegex.test(newUsername)) {
        throw new ApiError(
            400,
            "Username can only contain lowercase letters, numbers, _, @ and ."
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

export {
    registeUser,
    verifyEmail,
    resendVerificationOtp,
     updateAccountDetails,
      updateAvatar,
      updateCoverImage,
       getCurrentUser,
        changeUsername
};