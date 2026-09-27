import { Router } from "express";

import {
    blockUser,
    unblockUser,
    getBlockedUsers,
    isUserBlocked,
} from "../controllers/blockedUser.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/:userId", verifyJWT, blockUser);

router.delete("/:userId", verifyJWT, unblockUser);

router.get("/", verifyJWT, getBlockedUsers);

router.get("/status/:userId", verifyJWT, isUserBlocked);

export default router;