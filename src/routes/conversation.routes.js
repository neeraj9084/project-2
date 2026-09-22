import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";

import {
    createDirectConversation,
    getUserConversation,
    getConversationById,
    findDirectConversation,
    deleteConversation
} from "../controllers/conversation.controller.js";

const router = Router();


// Authentication
router.use(verifyJWT);


// Create one-to-one direct conversation
router.post(
    "/direct",
    createDirectConversation
);


// Get user's conversations
router.get(
    "/",
    getUserConversation
);


// Get conversation by ID
router.get(
    "/:conversationId",
    getConversationById
);


// Find direct conversation with a user
router.get(
    "/direct/:userId",
    findDirectConversation
);


// Delete conversation
router.delete(
    "/:conversationId",
    deleteConversation
);


export default router;