import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    shareVideo,
    getVideoShareCount,
    shareVideoToChat
} from "../controllers/share.controller.js";

const router = Router();

router.post(
    "/video/:videoId",
    verifyJWT,
    shareVideo
);

router.get(
    "/video/:videoId/count",
    verifyJWT,
    getVideoShareCount
);

router.post(
    "/video/:videoId/chat",
    verifyJWT,
    shareVideoToChat
);


export default router;