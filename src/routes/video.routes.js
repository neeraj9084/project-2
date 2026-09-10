import { Router } from "express";

import {
    publishAVideo,
    getAllVideos,
    getVideoById,
    updateVideo,
    deleteVideo,
    incrementVideoViews,
    togglePublishStatus,
    getMyVideos
} from "../controllers/video.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();


// Publish Video
router
    .route("/publish")
    .post(
        verifyJWT,
        upload.fields([
            {
                name: "videoFile",
                maxCount: 1
            },
            {
                name: "thumbnail",
                maxCount: 1
            }
        ]),
        publishAVideo
    );


// Get All Videos
router
    .route("/")
    .get(getAllVideos);


// Get My Videos
router
    .route("/my-videos")
    .get(
        verifyJWT,
        getMyVideos
    );


// Increment Video Views
router
    .route("/:videoId/views")
    .patch(
        incrementVideoViews
    );


// Toggle Publish Status
router
    .route("/:videoId/toggle-publish")
    .patch(
        verifyJWT,
        togglePublishStatus
    );


// Get / Update / Delete Video
router
    .route("/:videoId")
    .get(
        getVideoById
    )
    .patch(
        verifyJWT,
        upload.fields([
            {
                name: "thumbnail",
                maxCount: 1
            }
        ]),
        updateVideo
    )
    .delete(
        verifyJWT,
        deleteVideo
    );


export default router;