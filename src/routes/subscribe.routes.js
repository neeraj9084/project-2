import { Router } from "express";

import {
    subscribeToChannel,
    unsubscribeFromChannel,
    getChannelSubscribers,
    getUserSubscriptions
} from "../controllers/subscribe.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Subscribe to channel
router.post(
    "/channel/:channelId",
    verifyJWT,
    subscribeToChannel
);

// Unsubscribe from channel
router.delete(
    "/channel/:channelId",
    verifyJWT,
    unsubscribeFromChannel
);

// Get channel subscribers
// Get channel followers
router.get(
    "/channel/:channelId/subscribers",
    verifyJWT,
    getChannelSubscribers
);

// Get my subscribed channels
router.get(
    "/my-subscriptions",
    verifyJWT,
    getUserSubscriptions
);

export default router;