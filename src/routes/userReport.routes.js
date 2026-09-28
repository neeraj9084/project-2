import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";

import {
    reportUser,
    getMyReports,
} from "../controllers/userReport.controller.js";

const router = Router();

// Authentication required
router.use(verifyJWT);

// Report a user
router.post("/user/:userId", reportUser);

// Get my reports
router.get("/my", getMyReports);

export default router;