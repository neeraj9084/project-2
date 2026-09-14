import { Router } from "express";

import {
    addToWatchHistory,
    getWatchHistory,
    removeFromWatchHistory,
    clearWatchHistory
} from "../controllers/watchHistory.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/add/:videoId").post(
    verifyJWT,
    addToWatchHistory
);

router.route("/").get(
    verifyJWT,
    getWatchHistory
);
router.route("/remove/:videoId").delete(
    verifyJWT,
    removeFromWatchHistory
);
router.route("/clear").delete(
    verifyJWT,
    clearWatchHistory
);

export default router;