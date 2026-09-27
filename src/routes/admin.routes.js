import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/admin.middleware.js";

import {
    getAdminOverview,
    getAllUsers,
    getUserById,
    updateUserStatus
} from "../controllers/admin.controller.js";

const router = Router();

router.use(verifyJWT);
router.use(verifyAdmin);

router.get("/dashboard", getAdminOverview);

router.get("/users", getAllUsers);

router.get("/users/:userId", getUserById);

router.patch("/users/:userId/status", updateUserStatus);

export default router;