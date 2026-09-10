import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";

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
    verifyAccountRecovery
} from "../controllers/auth.controller.js";

const router = Router();

router.route("/login").post(loginUser);

router.route("/logout").post(verifyJWT, logoutUser);

router.route("/refresh-token").post(refreshAccessToken);

router.route("/change-email").post(
    verifyJWT,
    changeEmail
);

router.route("/verify-changed-email").post(
    verifyJWT,
    verifyChangedEmail
);

router.route("/forgot-password").post(
    forgotPassword
);

router.route("/verify-forgot-password-otp").post(
    verifyForgotPasswordOtp
);

router.route("/reset-password").post(
    resetPassword
);

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
    .delete(verifyJWT, deleteAccount);

router
    .route("/account-recovery")
    .post(accountRecovery);   
    
router
    .route("/verify-account-recovery")
    .post(verifyAccountRecovery);    

export default router;