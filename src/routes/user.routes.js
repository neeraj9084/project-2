import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import { otpLimiter } from "../middlewares/otpLimiter.middleware.js";

import {
    startRegistration,
    verifyRegistrationOtp,
    resendVerificationOtp,
    completeRegistration,
    updateAccountDetails,
    updateAvatar,
    updateCoverImage,
    getCurrentUser,
    changeUsername,
    getPublicProfile,
} from "../controllers/user.controller.js";

import { upload } from "../middlewares/multer.middleware.js";

const router = Router();


// ======================================================
// REGISTER
// ======================================================

// STEP 1
// Full Name + Username + Email
router.route("/register/start").post(
    otpLimiter,
    startRegistration
);


// STEP 2
// Verify Email OTP
router.route("/register/verify-otp").post(
    otpLimiter,
    verifyRegistrationOtp
);


// RESEND OTP
router.route("/register/resend-otp").post(
    otpLimiter,
    resendVerificationOtp
);


// STEP 3
// Password + Confirm Password
router.route("/register/complete").post(
    completeRegistration
);


// ======================================================
// UPDATE ACCOUNT
// ======================================================

router.route("/update-account").patch(
    verifyJWT,
    updateAccountDetails
);


// ======================================================
// UPDATE AVATAR
// ======================================================

router.route("/update-avatar").patch(
    verifyJWT,
    upload.single("avatar"),
    updateAvatar
);


// ======================================================
// UPDATE COVER IMAGE
// ======================================================

router.route("/update-cover-image").patch(
    verifyJWT,
    upload.single("coverImage"),
    updateCoverImage
);


// ======================================================
// CURRENT USER
// ======================================================

router.route("/current-user").get(
    verifyJWT,
    getCurrentUser
);


// ======================================================
// CHANGE USERNAME
// ======================================================

router.route("/change-username").patch(
    verifyJWT,
    changeUsername
);


// ======================================================
// PUBLIC PROFILE
// ======================================================

router.route("/profile/:userId").get(
    verifyJWT,
    getPublicProfile
);


export default router;