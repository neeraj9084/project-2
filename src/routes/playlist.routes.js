import { Router } from "express";

import {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    updatePlaylist,
    deletePlaylist,
    addVideoToPlaylist,
    removeVideoFromPlaylist
} from "../controllers/playlist.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();


//======================= Playlist Routes =======================//


// Create Playlist
router.route("/").post(
    verifyJWT,
    createPlaylist
);


// Get User Playlists
router.route("/").get(
    verifyJWT,
    getUserPlaylists
);


// Get Playlist By ID
router.route("/:playlistId").get(
    verifyJWT,
    getPlaylistById
);


// Update Playlist
router.route("/:playlistId").patch(
    verifyJWT,
    updatePlaylist
);


// Delete Playlist
router.route("/:playlistId").delete(
    verifyJWT,
    deletePlaylist
);


// Add Video To Playlist
router.route("/:playlistId/videos/:videoId").post(
    verifyJWT,
    addVideoToPlaylist
);


// Remove Video From Playlist
router.route("/:playlistId/videos/:videoId").delete(
    verifyJWT,
    removeVideoFromPlaylist
);


export default router;