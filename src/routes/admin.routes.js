import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/admin.middleware.js";

import {
    getAdminOverview,
    getAllUsers,
    getUserById,
    updateUserStatus,
    getAllVideos,
    getVideoById,
    getUserVideos,
    updateVideoStatus,
    deleteVideo,
    getVideoReports,
    getVideoReportById,
    updateVideoReportStatus,
    getUserReports,
    getUserReportById,
    updateUserReportStatus,
    getCopyrightClaims,
    getCopyrightClaimById,
    updateCopyrightClaimStatus,
    getUserAnalytics,
    getVideoAnalytics,
    getViewAnalytics,
    getReportAnalytics,
    getCopyrightAnalytics, 
} from "../controllers/admin.controller.js";

const router = Router();

router.use(verifyJWT);
router.use(verifyAdmin);

router.get("/dashboard", getAdminOverview);

router.get("/users", getAllUsers);
router.get("/users/:userId", getUserById);
router.patch("/users/:userId/status", updateUserStatus);

router.get("/videos", getAllVideos);
router.get("/videos/:videoId", getVideoById);
router.get("/users/:userId/videos", getUserVideos);

router.patch(
    "/videos/:videoId/status",
    verifyJWT,
    verifyAdmin,
    updateVideoStatus
);

router.delete(
    "/videos/:videoId",
    verifyJWT,
    verifyAdmin,
    deleteVideo
);

router.get("/reports/videos", getVideoReports);

router.get(
    "/video-reports/:reportId",
    verifyJWT,
    verifyAdmin,
    getVideoReportById
);

router.patch(
    "/video-reports/:reportId/status",
    verifyJWT,
    verifyAdmin,
    updateVideoReportStatus
);

router.get("/reports/users", getUserReports);

router.get(
    "/user-reports/:reportId",
    verifyJWT,
    verifyAdmin,
    getUserReportById
);

router.patch(
    "/user-reports/:reportId/status",
    verifyJWT,
    verifyAdmin,
    updateUserReportStatus
);

router.get("/copyright-claims", getCopyrightClaims);

router.get(
    "/copyright-claims/:claimId",
    verifyJWT,
    verifyAdmin,
    getCopyrightClaimById
);

router.patch(
    "/copyright-claims/:claimId/status",
    verifyJWT,
    verifyAdmin,
    updateCopyrightClaimStatus
);

router.get(
    "/users/:userId/analytics",
    verifyJWT,
    verifyAdmin,
    getUserAnalytics
);

router.get(
    "/videos/:videoId/analytics",
    verifyJWT,
    verifyAdmin,
    getVideoAnalytics
);

router.get(
    "/analytics/views",
    verifyJWT,
    verifyAdmin,
    getViewAnalytics
);

router.get(
    "/analytics/reports",
    verifyJWT,
    verifyAdmin,
    getReportAnalytics
);

router.get(
    "/analytics/copyright",
    verifyJWT,
    verifyAdmin,
    getCopyrightAnalytics
);

export default router;