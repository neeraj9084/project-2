import mongoose from "mongoose";
import { fileTypeFromFile } from "file-type";
import fs from "fs/promises";

import { Moment } from "../models/moment.model.js";
import { MomentView } from "../models/momentView.model.js";
import { User } from "../models/user.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const removeLocalFile = async (filePath) => {
    if (!filePath) {
        return;
    }

    try {
        await fs.unlink(filePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error(
                "Failed to remove local file:",
                error.message
            );
        }
    }
};

const normalizeMusic = (music) => {
    if (!music) {
        return null;
    }

    if (typeof music === "string") {
        try {
            music = JSON.parse(music);
        } catch {
            throw new ApiError(
                400,
                "Invalid music data"
            );
        }
    }

    if (
        typeof music !== "object" ||
        Array.isArray(music)
    ) {
        throw new ApiError(
            400,
            "Invalid music data"
        );
    }

    return {
        provider: music.provider?.toString().trim() || "",
        trackId: music.trackId?.toString().trim() || "",
        title: music.title?.toString().trim() || "",
        artist: music.artist?.toString().trim() || "",
        image: music.image?.toString().trim() || "",
        previewUrl: music.previewUrl?.toString().trim() || "",
        officialUrl: music.officialUrl?.toString().trim() || ""
    };
};

const createMoment = asyncHandler(async (req, res) => {
    const mediaLocalPath = req.file?.path;

    if (!mediaLocalPath) {
        throw new ApiError(
            400,
            "Moment media is required"
        );
    }

    try {
        const detectedFileType =
            await fileTypeFromFile(mediaLocalPath);

        const allowedMimeTypes = new Set([
            "image/jpeg",
            "image/png",
            "image/webp",
            "video/mp4",
            "video/webm",
            "video/quicktime"
        ]);

        if (
            !detectedFileType ||
            !allowedMimeTypes.has(detectedFileType.mime)
        ) {
            throw new ApiError(
                400,
                "Invalid image or video file"
            );
        }

        const mediaType =
            detectedFileType.mime.startsWith("video/")
                ? "video"
                : "image";

        const caption =
            typeof req.body.caption === "string"
                ? req.body.caption.trim()
                : "";

        if (caption.length > 500) {
            throw new ApiError(
                400,
                "Caption cannot exceed 500 characters"
            );
        }

        const music = normalizeMusic(
            req.body.music
        );

        const media = await uploadOnCloudinary(
            mediaLocalPath
        );

        if (!media) {
            throw new ApiError(
                400,
                "Moment media upload failed"
            );
        }

        const expiresAt = new Date(
            Date.now() + 24 * 60 * 60 * 1000
        );

        const moment = await Moment.create({
            owner: req.user._id,
            mediaUrl: media.secure_url || media.url,
            mediaPublicId: media.public_id,
            mediaType,
            caption,
            music,
            expiresAt
        });

        return res.status(201).json(
            new ApiResponse(
                201,
                moment,
                "Moment created successfully"
            )
        );
    } finally {
        await removeLocalFile(mediaLocalPath);
    }
});

const getMoments = asyncHandler(async (req, res) => {
    const page = Math.max(
        Number(req.query.page) || 1,
        1
    );

    const limit = Math.min(
        Math.max(Number(req.query.limit) || 20, 1),
        50
    );

    const skip = (page - 1) * limit;

    const now = new Date();

    const [moments, totalMoments] =
        await Promise.all([
            Moment.find({
                expiresAt: {
                    $gt: now
                }
            })
                .populate(
                    "owner",
                    "username fullName avatar isVerified"
                )
                .sort({
                    createdAt: -1
                })
                .skip(skip)
                .limit(limit)
                .lean(),

            Moment.countDocuments({
                expiresAt: {
                    $gt: now
                }
            })
        ]);

    const momentIds = moments.map(
        (moment) => moment._id
    );

    const viewedMoments =
        momentIds.length > 0
            ? await MomentView.find({
                viewer: req.user._id,
                moment: {
                    $in: momentIds
                }
            })
                .select("moment")
                .lean()
            : [];

    const viewedMomentIds = new Set(
        viewedMoments.map(
            (item) => item.moment.toString()
        )
    );

    const data = moments.map((moment) => ({
        ...moment,
        isViewed: viewedMomentIds.has(
            moment._id.toString()
        )
    }));

    const totalPages = Math.ceil(
        totalMoments / limit
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                moments: data,
                pagination: {
                    currentPage: page,
                    limit,
                    totalMoments,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            },
            "Moments fetched successfully"
        )
    );
});

const getMyMoments = asyncHandler(async (req, res) => {
    const moments = await Moment.find({
        owner: req.user._id,
        expiresAt: {
            $gt: new Date()
        }
    })
        .sort({
            createdAt: -1
        })
        .lean();

    return res.status(200).json(
        new ApiResponse(
            200,
            moments,
            "My moments fetched successfully"
        )
    );
});

const getUserMoments = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new ApiError(
            400,
            "Invalid user ID"
        );
    }

    const user = await User.findById(userId)
        .select("_id username fullName avatar isVerified")
        .lean();

    if (!user) {
        throw new ApiError(
            404,
            "User not found"
        );
    }

    const moments = await Moment.find({
        owner: userId,
        expiresAt: {
            $gt: new Date()
        }
    })
        .sort({
            createdAt: -1
        })
        .lean();

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                user,
                moments
            },
            "User moments fetched successfully"
        )
    );
});

const getMomentById = asyncHandler(async (req, res) => {
    const { momentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(momentId)) {
        throw new ApiError(
            400,
            "Invalid moment ID"
        );
    }

    const moment = await Moment.findOne({
        _id: momentId,
        expiresAt: {
            $gt: new Date()
        }
    })
        .populate(
            "owner",
            "username fullName avatar isVerified"
        )
        .lean();

    if (!moment) {
        throw new ApiError(
            404,
            "Moment not found or expired"
        );
    }

    const isViewed = await MomentView.exists({
        moment: momentId,
        viewer: req.user._id
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                ...moment,
                isViewed: !!isViewed
            },
            "Moment fetched successfully"
        )
    );
});

const viewMoment = asyncHandler(async (req, res) => {
    const { momentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(momentId)) {
        throw new ApiError(
            400,
            "Invalid moment ID"
        );
    }

    const moment = await Moment.findOne({
        _id: momentId,
        expiresAt: {
            $gt: new Date()
        }
    }).select(
        "_id owner views expiresAt"
    );

    if (!moment) {
        throw new ApiError(
            404,
            "Moment not found or expired"
        );
    }

    if (
        moment.owner.toString() ===
        req.user._id.toString()
    ) {
        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    momentId: moment._id,
                    views: moment.views,
                    counted: false
                },
                "Own moment view recorded"
            )
        );
    }

    let counted = false;

    try {
        await MomentView.create({
            moment: moment._id,
            viewer: req.user._id
        });

        await Moment.updateOne(
            {
                _id: moment._id
            },
            {
                $inc: {
                    views: 1
                }
            }
        );

        counted = true;
    } catch (error) {
        if (error.code !== 11000) {
            throw error;
        }
    }

    const updatedMoment = await Moment.findById(
        moment._id
    ).select(
        "_id views"
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                momentId: updatedMoment._id,
                views: updatedMoment.views,
                counted
            },
            "Moment view recorded successfully"
        )
    );
});

const getMomentViewers = asyncHandler(async (req, res) => {
    const { momentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(momentId)) {
        throw new ApiError(
            400,
            "Invalid moment ID"
        );
    }

    const moment = await Moment.findOne({
        _id: momentId,
        owner: req.user._id
    }).select("_id");

    if (!moment) {
        throw new ApiError(
            404,
            "Moment not found"
        );
    }

    const page = Math.max(
        Number(req.query.page) || 1,
        1
    );

    const limit = Math.min(
        Math.max(Number(req.query.limit) || 20, 1),
        100
    );

    const skip = (page - 1) * limit;

    const [
        viewers,
        totalViewers
    ] = await Promise.all([
        MomentView.find({
            moment: momentId
        })
            .populate(
                "viewer",
                "username fullName avatar isVerified"
            )
            .sort({
                viewedAt: -1
            })
            .skip(skip)
            .limit(limit)
            .lean(),

        MomentView.countDocuments({
            moment: momentId
        })
    ]);

    const totalPages = Math.ceil(
        totalViewers / limit
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                viewers,
                pagination: {
                    currentPage: page,
                    limit,
                    totalViewers,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            },
            "Moment viewers fetched successfully"
        )
    );
});

const deleteMoment = asyncHandler(async (req, res) => {
    const { momentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(momentId)) {
        throw new ApiError(
            400,
            "Invalid moment ID"
        );
    }

    const moment = await Moment.findOne({
        _id: momentId,
        owner: req.user._id
    });

    if (!moment) {
        throw new ApiError(
            404,
            "Moment not found"
        );
    }

    await Moment.deleteOne({
        _id: momentId
    });

    await MomentView.deleteMany({
        moment: momentId
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            null,
            "Moment deleted successfully"
        )
    );
});

export {
    createMoment,
    getMoments,
    getMyMoments,
    getUserMoments,
    getMomentById,
    viewMoment,
    getMomentViewers,
    deleteMoment
};