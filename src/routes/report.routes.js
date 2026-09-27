import { Router } from "express";

import {
    reportVideo,
    getMyReports,
} from "../controllers/report.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);


router.post("/:videoId", reportVideo);


router.get("/my", getMyReports);

export default router;