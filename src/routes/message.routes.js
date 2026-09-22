import { Router } from "express";

import {
    sendMessage,
    getMessages,
    editMessage,
    deleteMessage,
    markMessageAsRead,
    getUnreadMessageCount,
    searchMessages,
    replyToMessage,
    forwardMessage,
    clearChat
} from "../controllers/message.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post(
    "/:conversationId",
    upload.array("media", 10),
    sendMessage
);

router.get(
    "/:conversationId/search",
    searchMessages
);

router.get(
    "/:conversationId/unread-count",
    getUnreadMessageCount
);

router.patch(
    "/:conversationId/read",
    markMessageAsRead
);

router.post(
    "/:conversationId/reply",
    replyToMessage
);

router.delete(
    "/:conversationId/clear",
    clearChat
);

router.post(
    "/:messageId/forward",
    forwardMessage
);

router.patch(
    "/:messageId",
    editMessage
);

router.delete(
    "/:messageId",
    deleteMessage
);

router.get(
    "/:conversationId",
    getMessages
);

export default router;