import { Router } from "express";

import {
    addReaction,
    removeReaction,
} from "../controllers/messageReaction.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

// Add / update reaction
router.post("/:messageId", addReaction);

// Remove reaction
router.delete("/:messageId", removeReaction);

export default router;