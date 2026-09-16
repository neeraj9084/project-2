import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { otpLimiter } from "../middlewares/otpLimiter.middleware.js";
import {
     registeUser, 
     verifyEmail,
     resendVerificationOtp,
     updateAccountDetails,
     updateAvatar,
     updateCoverImage,
     getCurrentUser,
      changeUsername
      } from "../controllers/user.controller.js";
import {upload} from "../middlewares/multer.middleware.js"
const router = Router()


router.route("/register").post(
    upload.fields([
       { 
        name: "avatar",
        maxCount: 1
    },
    {
        name: "coverImage",
        maxCount: 1
    }
    ]),

    registeUser
)
router.route("/verify-email").post(otpLimiter, verifyEmail);

router
  .route("/resend-verification-otp")
  .post(otpLimiter, resendVerificationOtp);


router.route("/update-account").patch(
    verifyJWT,
    updateAccountDetails
);
router.route("/update-avatar").patch(
    verifyJWT,
    upload.single("avatar"),
    updateAvatar
);
router.route("/update-cover-image").patch(
    verifyJWT,
    upload.single("coverImage"),
    updateCoverImage
);

router.route("/current-user").get(
    verifyJWT,
    getCurrentUser
);
router
    .route("/change-username")
    .patch(verifyJWT, changeUsername);

export default router
