import { Router } from "express";

import {
    submitCopyrightClaim,
    getMyCopyrightClaims,
} from "../controllers/copyrightClaim.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);


router.post("/:videoId", submitCopyrightClaim);


router.get("/my", getMyCopyrightClaims);

export default router;