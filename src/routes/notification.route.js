import { Router } from "express";

import {
    getMyNotifications,
    getUnreadNotifications,
    getUnreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    clearAllNotifications,
} from "../controllers/notification.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

//====================== GET ======================//

router.get(
    "/",
    verifyJWT,
    getMyNotifications
);

router.get(
    "/unread",
    verifyJWT,
    getUnreadNotifications
);

router.get(
    "/unread/count",
    verifyJWT,
    getUnreadNotificationCount
);

//====================== PATCH ======================//

// IMPORTANT: static route first
router.patch(
    "/read-all",
    verifyJWT,
    markAllNotificationsAsRead
);

router.patch(
    "/:notificationId/read",
    verifyJWT,
    markNotificationAsRead
);

//====================== DELETE ======================//

// IMPORTANT: static route first
router.delete(
    "/clear-all",
    verifyJWT,
    clearAllNotifications
);

router.delete(
    "/:notificationId",
    verifyJWT,
    deleteNotification
);

export default router;