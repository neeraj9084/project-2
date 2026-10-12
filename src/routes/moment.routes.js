import { Router } from "express";

import {
    createMoment,
    getMoments,
    getMyMoments,
    getUserMoments,
    getMomentById,
    viewMoment,
    getMomentViewers,
    deleteMoment
} from "../controllers/moment.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import { momentUpload } from "../middlewares/momentUpload.middleware.js";

const router = Router();

router.post(
    "/",
    verifyJWT,
    momentUpload.single("media"),
    createMoment
);

router.get(
    "/",
    verifyJWT,
    getMoments
);

router.get(
    "/my",
    verifyJWT,
    getMyMoments
);

router.get(
    "/user/:userId",
    verifyJWT,
    getUserMoments
);

router.get(
    "/:momentId",
    verifyJWT,
    getMomentById
);

router.post(
    "/:momentId/view",
    verifyJWT,
    viewMoment
);

router.get(
    "/:momentId/viewers",
    verifyJWT,
    getMomentViewers
);

router.delete(
    "/:momentId",
    verifyJWT,
    deleteMoment
);

export default router;