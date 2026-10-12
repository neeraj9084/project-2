import { Router } from "express";

import {
    searchMusic
} from "../controllers/music.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.get(
    "/search",
    verifyJWT,
    searchMusic
);

export default router;