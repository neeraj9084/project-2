import { Router } from "express";

import {
    likeVideo,
    unlikeVideo,
    getVideoLikeCount,
    getMyLikedVideos,
} from "../controllers/like.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();


// Like a video
router.post(
    "/video/:videoId",
    verifyJWT,
    likeVideo
);

// Unlike a video
router.delete(
    "/video/:videoId",
    verifyJWT,
    unlikeVideo
);


// Get total likes of a video
router.get(
    "/video/:videoId/count",
    getVideoLikeCount
);


// Get videos liked by logged-in user
router.get(
    "/my-liked-videos",
    verifyJWT,
    getMyLikedVideos
);


export default router;