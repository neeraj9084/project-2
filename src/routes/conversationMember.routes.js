import { Router } from "express";

import {
    addConversationMember,
    removeConversationMember,
    leaveConversation,
    getConversationMembers,
    updateMemberRole,
    updateLastRead,
    muteConversation,
    unmuteConversation,
    createMemberConversation,
     archiveConversation,
     unarchiveConversation
} from "../controllers/conversationMember.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post("/group", createMemberConversation);

// Add member
router.post(
    "/:conversationId/members",
    addConversationMember
);

// Remove member
router.delete(
    "/:conversationId/member",
    removeConversationMember
);

// Leave conversation
router.patch(
    "/:conversationId/leave",
    leaveConversation
);

// Get conversation members
router.get(
    "/:conversationId/members",
    getConversationMembers
);

// Update member role
router.patch(
    "/:conversationId/members/role",
    updateMemberRole
);

// Mark conversation as read
router.patch(
    "/:conversationId/read",
    updateLastRead
);

// Mute conversation
router.patch(
    "/:conversationId/mute",
    muteConversation
);

// Unmute conversation
router.patch(
    "/:conversationId/unmute",
    unmuteConversation
);

router.patch(
    "/:conversationId/archive",
    verifyJWT,
    archiveConversation
);

router.patch(
    "/:conversationId/unarchive",
    verifyJWT,
    unarchiveConversation
);

export default router;