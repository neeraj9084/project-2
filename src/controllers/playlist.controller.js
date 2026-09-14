import { Playlist } from "../models/playlist.model.js";
import { Video } from "../models/video.model.js";
import mongoose from "mongoose";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

//======================= createPlaylist =======================//

const createPlaylist = asyncHandler(async(req, res) => {
    
    const { name, description } = req.body;

    if(!name){
        throw new ApiError(400, "Playlist name is required")
    }

    if (name.trim().length > 100) {
        throw new ApiError(400, "Playlist name cannot exceed 100 characters");
    }

    if (description && description.trim().length > 500) {
        throw new ApiError(400, "Playlist description cannot exceed 500 characters");
    }

    const userId = req.user._id 

   const playlist = await Playlist.create({
        name: name.trim(),
        description: description?.trim() || "",
        owner: userId
    });

    return res
    .status(201)
    .json(
        new ApiResponse(
            201,
            playlist,
            "Playlist created successfully"
        )
    );
    

})

//======================= getUserPlaylists =====================//

const getUserPlaylists = asyncHandler(async (req, res) => {

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized request");
    }

    const rawPage = Array.isArray(req.query.page)
        ? req.query.page[0]
        : req.query.page;

    const rawLimit = Array.isArray(req.query.limit)
        ? req.query.limit[0]
        : req.query.limit;

    const page = Math.max(Number.parseInt(rawPage, 10) || 1, 1);

    const limit = Math.min(
        Math.max(Number.parseInt(rawLimit, 10) || 10, 1),
        50
    );

    const skip = (page - 1) * limit;

    const [totalPlaylists, playlists] = await Promise.all([
        Playlist.countDocuments({
            owner: userId
        }).exec(),

        Playlist.find({
            owner: userId
        })
            .select("name description videos isPublic createdAt updatedAt")
            .populate({
                path: "videos",
                match: {
                    isPublished: true
                },
                select: "title thumbnail duration views isPublished"
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
            .exec()
    ]);

    const filteredPlaylists = Playlist.map((playlist) => ({
        ...playlist,
        videos: playlist.videos.filter(Boolean)
    }));

    const totalPages = Math.max(
        1,
        Math.ceil(totalPlaylists / limit)
    );

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    playlists: filteredPlaylists,
                    pagination: {
                        currentPage: page,
                        totalPages,
                        totalPlaylists,
                        limit,
                        hasNextPage: page < totalPages,
                        hasPreviousPage: page > 1
                    }
                },
                "User playlists fetched successfully"
            )
        );
});

///====================== getPlaylistById =======================//

const getPlaylistById = asyncHandler(async (req, res) => {

    const { playlistId } = req.params;

    if (!playlistId) {
        throw new ApiError(400, "Playlist ID is required");
    }

    if (!mongoose.Types.ObjectId.isValid(playlistId)) {
        throw new ApiError(400, "Invalid playlist ID");
    }

    const playlist = await Playlist.findById(playlistId)
        .populate({
            path: "videos",
            match: {
                isPublished: true
            },
            select: "title thumbnail duration views isPublished owner createdAt"
        })
        .lean()
        .exec();

    if (!playlist) {
        throw new ApiError(404, "Playlist not found");
    }

    playlist.videos = playlist.videos.filter(Boolean);

    const userId = req.user._id;

    if (
        !playlist.isPublic &&
        playlist.owner.toString() !== userId.toString()
    ) {
        throw new ApiError(
            403,
            "You are not allowed to access this playlist"
        );
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                playlist,
                "Playlist fetched successfully"
            )
        );
});

export {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById
};
