import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import { otpLimiter } from "../middlewares/otpLimiter.middleware.js";

import {
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeEmail,
    verifyChangedEmail,
    forgotPassword,
    verifyForgotPasswordOtp,
    resetPassword,
    changePassword,
    deactivateAccount,
    deleteAccount,
    accountRecovery,
    verifyAccountRecovery,
} from "../controllers/auth.controller.js";

const router = Router();


// ==================== AUTH ROUTES ====================

router.route("/login").post(loginUser);

router.route("/logout").post(
    verifyJWT,
    logoutUser
);

router.route("/refresh-token").post(
    refreshAccessToken
);

router.route("/change-email").post(
    verifyJWT,
    otpLimiter,
    changeEmail
);

router.route("/verify-changed-email").post(
    verifyJWT,
    otpLimiter,
    verifyChangedEmail
);


// ==================== PASSWORD RESET ====================

router.route("/forgot-password").post(
    otpLimiter,
    forgotPassword
);

router.route("/verify-forgot-password-otp").post(
    otpLimiter,
    verifyForgotPasswordOtp
);

router.route("/reset-password").post(
    resetPassword
);


// ==================== PASSWORD ====================

router.route("/change-password").post(
    verifyJWT,
    changePassword
);

router.route("/deactivate-account").patch(
    verifyJWT,
    deactivateAccount
);

router
    .route("/delete-account")
    .delete(
        verifyJWT,
        deleteAccount
    );


// ==================== ACCOUNT RECOVERY ====================

router
    .route("/account-recovery")
    .post(
        otpLimiter,
        accountRecovery
    );

router
    .route("/verify-account-recovery")
    .post(
        otpLimiter,
        verifyAccountRecovery
    );

export default router;
