import { Router } from "express";

import {
    addComment,
    getVideoComments,
    getCommentById,
    updateComment,
    deleteComment,
    likeComment,
    unlikeComment,
    getCommentLikeCount
} from "../controllers/comment.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Add comment
router.post("/video/:videoId", verifyJWT, addComment);

// Get all comments of a video
router.get("/video/:videoId", getVideoComments);

// Get single comment
router.get("/:commentId", getCommentById);

// Update comment
router.patch("/:commentId", verifyJWT, updateComment);

// Delete comment
router.delete("/:commentId", verifyJWT, deleteComment);


// Like comment
router.post("/:commentId/like", verifyJWT, likeComment);

// Unlike comment
router.delete("/:commentId/like", verifyJWT, unlikeComment);

// Get comment like count
router.get("/:commentId/likes", getCommentLikeCount);


export default router;