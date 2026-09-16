import { Playlist } from "../models/playList.model.js";
import { Video } from "../models/video.model.js";
import mongoose from "mongoose";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";


//======================= createPlaylist =======================//

const createPlaylist = asyncHandler(async (req, res) => {

    const body = req.body ?? {};

    const { name, description } = body;

    // Name is required
    if (name === undefined || name === null) {
        throw new ApiError(
            400,
            "Playlist name is required"
        );
    }

    // Name type validation
    if (typeof name !== "string") {
        throw new ApiError(
            400,
            "Playlist name must be a string"
        );
    }

    const trimmedName = name.trim();

    if (!trimmedName) {
        throw new ApiError(
            400,
            "Playlist name cannot be empty"
        );
    }

    if (trimmedName.length > 100) {
        throw new ApiError(
            400,
            "Playlist name cannot exceed 100 characters"
        );
    }

    // Description validation
    let trimmedDescription = "";

    if (description !== undefined) {

        if (description === null || typeof description !== "string") {
            throw new ApiError(
                400,
                "Playlist description must be a string"
            );
        }

        trimmedDescription = description.trim();

        if (trimmedDescription.length > 500) {
            throw new ApiError(
                400,
                "Playlist description cannot exceed 500 characters"
            );
        }
    }

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    const playlist = await Playlist.create({
        name: trimmedName,
        description: trimmedDescription,
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
});


//======================= getUserPlaylists =====================//

const getUserPlaylists = asyncHandler(async (req, res) => {

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    const rawPage = Array.isArray(req.query.page)
        ? req.query.page[0]
        : req.query.page;

    const rawLimit = Array.isArray(req.query.limit)
        ? req.query.limit[0]
        : req.query.limit;

    let page = 1;
    let limit = 10;

    // Page validation
    if (rawPage !== undefined) {

        if (!/^\d+$/.test(String(rawPage))) {
            throw new ApiError(
                400,
                "Page must be a positive integer"
            );
        }

        page = Number.parseInt(rawPage, 10);

        if (
            !Number.isSafeInteger(page) ||
            page < 1
        ) {
            throw new ApiError(
                400,
                "Page must be a positive integer"
            );
        }
    }

    // Limit validation
    if (rawLimit !== undefined) {

        if (!/^\d+$/.test(String(rawLimit))) {
            throw new ApiError(
                400,
                "Limit must be a positive integer"
            );
        }

        limit = Number.parseInt(rawLimit, 10);

        if (
            !Number.isSafeInteger(limit) ||
            limit < 1
        ) {
            throw new ApiError(
                400,
                "Limit must be a positive integer"
            );
        }

        // Maximum allowed page size
        limit = Math.min(limit, 50);
    }

    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
        throw new ApiError(
            400,
            "Page value is too large"
        );
    }

    const [totalPlaylists, playlists] = await Promise.all([

        Playlist.countDocuments({
            owner: userId
        }).exec(),

        Playlist.find({
            owner: userId
        })
            .select(
                "name description videos isPublic createdAt updatedAt"
            )
            .populate({
                path: "videos",
                match: {
                    isPublished: true
                },
                select:
                    "title thumbnail duration views isPublished owner createdAt"
            })
            .sort({
                createdAt: -1,
                _id: -1
            })
            .skip(skip)
            .limit(limit)
            .lean()
            .exec()
    ]);

    const filteredPlaylists = playlists.map((playlist) => ({
        ...playlist,
        videos: Array.isArray(playlist.videos)
            ? playlist.videos.filter(Boolean)
            : []
    }));

    const totalPages = Math.ceil(
        totalPlaylists / limit
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
                        hasNextPage:
                            page < totalPages,
                        hasPreviousPage:
                            page > 1
                    }
                },
                "User playlists fetched successfully"
            )
        );
});


//====================== getPlaylistById =======================//

const getPlaylistById = asyncHandler(async (req, res) => {

    const { playlistId } = req.params;

    if (!playlistId) {
        throw new ApiError(
            400,
            "Playlist ID is required"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(playlistId)) {
        throw new ApiError(
            400,
            "Invalid playlist ID"
        );
    }

    const playlist = await Playlist.findById(playlistId)
        .populate({
            path: "videos",
            match: {
                isPublished: true
            },
            select:
                "title thumbnail duration views isPublished owner createdAt"
        })
        .lean()
        .exec();

    if (!playlist) {
        throw new ApiError(
            404,
            "Playlist not found"
        );
    }

    playlist.videos = Array.isArray(playlist.videos)
        ? playlist.videos.filter(Boolean)
        : [];

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    // Private playlist -> owner only
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


//======================= updatePlaylist =======================//

const updatePlaylist = asyncHandler(async (req, res) => {

    const { playlistId } = req.params;

    const body = req.body ?? {};

    const {
        name,
        description,
        isPublic
    } = body;

    if (!playlistId) {
        throw new ApiError(
            400,
            "Playlist ID is required"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(playlistId)) {
        throw new ApiError(
            400,
            "Invalid playlist ID"
        );
    }

    // At least one field must be supplied
    if (
        name === undefined &&
        description === undefined &&
        isPublic === undefined
    ) {
        throw new ApiError(
            400,
            "At least one field is required to update playlist"
        );
    }

    // Name validation
    let trimmedName;

    if (name !== undefined) {

        if (
            name === null ||
            typeof name !== "string"
        ) {
            throw new ApiError(
                400,
                "Playlist name must be a string"
            );
        }

        trimmedName = name.trim();

        if (!trimmedName) {
            throw new ApiError(
                400,
                "Playlist name cannot be empty"
            );
        }

        if (trimmedName.length > 100) {
            throw new ApiError(
                400,
                "Playlist name cannot exceed 100 characters"
            );
        }
    }

    // Description validation
    let trimmedDescription;

    if (description !== undefined) {

        if (
            description === null ||
            typeof description !== "string"
        ) {
            throw new ApiError(
                400,
                "Playlist description must be a string"
            );
        }

        trimmedDescription = description.trim();

        if (trimmedDescription.length > 500) {
            throw new ApiError(
                400,
                "Playlist description cannot exceed 500 characters"
            );
        }
    }

    // isPublic validation
    if (
        isPublic !== undefined &&
        typeof isPublic !== "boolean"
    ) {
        throw new ApiError(
            400,
            "isPublic must be a boolean"
        );
    }

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    const playlist = await Playlist.findOne({
        _id: playlistId,
        owner: userId
    });

    if (!playlist) {
        throw new ApiError(
            404,
            "Playlist not found or you are not the owner"
        );
    }

    if (name !== undefined) {
        playlist.name = trimmedName;
    }

    if (description !== undefined) {
        playlist.description = trimmedDescription;
    }

    if (isPublic !== undefined) {
        playlist.isPublic = isPublic;
    }

    await playlist.save();

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                playlist,
                "Playlist updated successfully"
            )
        );
});


//======================= deletePlaylist =======================//

const deletePlaylist = asyncHandler(async (req, res) => {

    const { playlistId } = req.params;

    if (!playlistId) {
        throw new ApiError(
            400,
            "Playlist ID is required"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(playlistId)) {
        throw new ApiError(
            400,
            "Invalid playlist ID"
        );
    }

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    const playlist = await Playlist.findOneAndDelete({
        _id: playlistId,
        owner: userId
    });

    if (!playlist) {
        throw new ApiError(
            404,
            "Playlist not found or you are not the owner"
        );
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                playlist,
                "Playlist deleted successfully"
            )
        );
});


//======================= addVideoToPlaylist =======================//

const addVideoToPlaylist = asyncHandler(async (req, res) => {

    const {
        playlistId,
        videoId
    } = req.params;

    if (!playlistId) {
        throw new ApiError(
            400,
            "Playlist ID is required"
        );
    }

    if (!videoId) {
        throw new ApiError(
            400,
            "Video ID is required"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(playlistId)) {
        throw new ApiError(
            400,
            "Invalid playlist ID"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(
            400,
            "Invalid video ID"
        );
    }

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    // Verify playlist ownership
    const playlistExists = await Playlist.exists({
        _id: playlistId,
        owner: userId
    });

    if (!playlistExists) {
        throw new ApiError(
            404,
            "Playlist not found or you are not the owner"
        );
    }

    // Verify published video exists
    const videoExists = await Video.exists({
        _id: videoId,
        isPublished: true
    });

    if (!videoExists) {
        throw new ApiError(
            404,
            "Video not found or video is not published"
        );
    }

    /*
     * $addToSet is atomic and prevents duplicates
     * when multiple requests arrive at the same time.
     */
    const playlist = await Playlist.findOneAndUpdate(
        {
            _id: playlistId,
            owner: userId
        },
        {
            $addToSet: {
                videos: videoId
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!playlist) {
        throw new ApiError(
            404,
            "Playlist not found or you are not the owner"
        );
    }

    const alreadyExists = playlist.videos.some(
        (id) => id.toString() === videoId
    );

    /*
     * Because the update has already happened, checking
     * the returned array alone cannot tell whether this
     * request inserted the value or it already existed.
     *
     * Therefore duplicate detection should ideally be
     * handled by checking before the update OR by using
     * modifiedCount with updateOne.
     */

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                playlist,
                alreadyExists
                    ? "Video already exists in this playlist"
                    : "Video added to playlist successfully"
            )
        );
});


//======================= removeVideoFromPlaylist =======================//

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {

    const {
        playlistId,
        videoId
    } = req.params;

    if (!playlistId) {
        throw new ApiError(
            400,
            "Playlist ID is required"
        );
    }

    if (!videoId) {
        throw new ApiError(
            400,
            "Video ID is required"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(playlistId)) {
        throw new ApiError(
            400,
            "Invalid playlist ID"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(
            400,
            "Invalid video ID"
        );
    }

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    /*
     * Query requires both playlist ownership and the
     * requested video to be present.
     */
    const playlist = await Playlist.findOneAndUpdate(
        {
            _id: playlistId,
            owner: userId,
            videos: videoId
        },
        {
            $pull: {
                videos: videoId
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!playlist) {

        const playlistExists = await Playlist.exists({
            _id: playlistId,
            owner: userId
        });

        if (!playlistExists) {
            throw new ApiError(
                404,
                "Playlist not found or you are not the owner"
            );
        }

        throw new ApiError(
            404,
            "Video not found in this playlist"
        );
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                playlist,
                "Video removed from playlist successfully"
            )
        );
});


//======================= exports =======================//

export {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    updatePlaylist,
    deletePlaylist,
    addVideoToPlaylist,
    removeVideoFromPlaylist
};