import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    shareVideo,
    getVideoShareCount
} from "../controllers/share.controller.js";

const router = Router();

router.get("/:videoId/count", getVideoShareCount);

router.use(verifyJWT);

router.post("/:videoId", shareVideo);

export default router;