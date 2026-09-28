import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";

import {
    reportVideo,
    getMyReports
} from "../controllers/report.controller.js";

const router = Router();

// Authentication required
router.use(verifyJWT);

// Report a video
router.post("/video/:videoId", reportVideo);

// Get my video reports
router.get("/my", getMyReports);

export default router;