import mongoose from "mongoose";
import { fileTypeFromFile } from "file-type";
import fs from "fs/promises";

import { Moment } from "../models/moment.model.js";
import { MomentView } from "../models/momentView.model.js";
import { User } from "../models/user.model.js";
import { Subscribe } from "../models/subscribe.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { recordMomentMedia } from "../services/expireMoment.service.js";
import { videoUploadIdentity, registerVideoMedia, queueVideoMedia } from "../services/videoAssetRegistry.service.js";

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

//===================== createMoment ===========================//

const createMoment = asyncHandler(async (req, res) => {
    const mediaLocalPath = req.file?.path;
    const momentId = new mongoose.Types.ObjectId();
    let uploadedMedia = null;
    let committed = false;

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
        uploadedMedia = media;

        if (!media) {
            throw new ApiError(
                400,
                "Moment media upload failed"
            );
        }

        const expiresAt = new Date(
            Date.now() + 24 * 60 * 60 * 1000
        );

        const metadata = videoUploadIdentity(media, mediaType);
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await registerVideoMedia({ metadata, kind: "moment", videoId: momentId, owner: req.user._id, session });
                await Moment.create([{
            _id: momentId,
            owner: req.user._id,
            mediaUrl: media.secure_url || media.url,
            mediaPublicId: media.public_id,
            mediaType,
            mediaDeliveryType: media.type || null,
            mediaResourceType: media.resource_type || null,
            mediaRegistry: { moment: metadata },
            caption,
            music,
            expiresAt
                }], { session });
            });
            committed = true;
        } finally { await session.endSession(); }

        const moment = await Moment.findById(momentId);

        return res.status(201).json(
            new ApiResponse(
                201,
                moment,
                "Moment created successfully"
            )
        );
    } finally {
        if (uploadedMedia && !committed && req.user?._id) {
            let metadata;
            try { metadata = videoUploadIdentity(uploadedMedia, uploadedMedia.resource_type); }
            catch { metadata = { publicId: uploadedMedia.public_id, url: uploadedMedia.secure_url || uploadedMedia.url,
                resourceType: uploadedMedia.resource_type, deliveryType: uploadedMedia.type }; }
            try { await queueVideoMedia({ metadata, kind: "moment", videoId: momentId,
                owner: req.user._id, suffix: "failed-upload" }); }
            catch (error) { console.error("Failed to queue uploaded Moment media for review:", error); }
        }
        await removeLocalFile(mediaLocalPath);
    }
});

//======================== getMoments ==========================//

const getMoments = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    // Read pagination query parameters
    const rawPage = Array.isArray(req.query.page)
        ? req.query.page[0]
        : req.query.page;

    const rawLimit = Array.isArray(req.query.limit)
        ? req.query.limit[0]
        : req.query.limit;

    let page = 1;
    let limit = 20;

    // Validate page
    if (rawPage !== undefined) {
        if (
            typeof rawPage !== "string" ||
            !/^[1-9]\d*$/.test(rawPage)
        ) {
            throw new ApiError(
                400,
                "Page must be a positive integer"
            );
        }

        page = Number(rawPage);

        if (!Number.isSafeInteger(page)) {
            throw new ApiError(
                400,
                "Page value is too large"
            );
        }
    }

    // Validate limit
    if (rawLimit !== undefined) {
        if (
            typeof rawLimit !== "string" ||
            !/^[1-9]\d*$/.test(rawLimit)
        ) {
            throw new ApiError(
                400,
                "Limit must be a positive integer"
            );
        }

        limit = Number(rawLimit);

        if (!Number.isSafeInteger(limit)) {
            throw new ApiError(
                400,
                "Limit value is too large"
            );
        }

        // Maximum 50 Moments per request
        limit = Math.min(limit, 50);
    }

    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
        throw new ApiError(
            400,
            "Page value is too large"
        );
    }
const now = new Date();

// Find users whom the logged-in user follows
const subscriptions = await Subscribe.find({
    subscriber: userId
})
    .select("channel")
    .lean();

const followedUserIds = subscriptions
    .map((subscription) => subscription.channel)
    .filter(Boolean);

// Include your own Moments and followed users' Moments
const allowedOwnerIds = [
    userId,
    ...followedUserIds
];

// Only active Moments from allowed users
const activeFilter = {
    owner: {
        $in: allowedOwnerIds
    },
    expiresAt: {
        $gt: now
    }
};

    // Fetch Moments and total count together
    const [moments, totalMoments] = await Promise.all([
        Moment.find(activeFilter)
            .populate(
                "owner",
                "username fullName avatar isVerified"
            )
            .sort({
                createdAt: -1,
                _id: -1
            })
            .skip(skip)
            .limit(limit)
            .lean(),

        Moment.countDocuments(activeFilter)
    ]);

    // Find which Moments the logged-in user has viewed
    const momentIds = moments.map(
        (moment) => moment._id
    );

    const viewedMoments = momentIds.length > 0
        ? await MomentView.find({
            viewer: userId,
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

    // Add isViewed to each Moment
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

//======================== getMyMoments ==========================//

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

//====================== getUserMoments =========================//

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

//==================== getMomentById =========================//

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

//======================== viewMoment ==========================//

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

//======================== getMomentViewers ==========================//

const getMomentViewers = asyncHandler(async (req, res) => {
    const { momentId } = req.params;
    const userId = req.user?._id;

    // Login required
    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    // Validate Moment ID
    if (!mongoose.Types.ObjectId.isValid(momentId)) {
        throw new ApiError(
            400,
            "Invalid moment ID"
        );
    }

    // Only the owner can see viewers of an active Moment
    const moment = await Moment.findOne({
        _id: momentId,
        owner: userId,
        expiresAt: {
            $gt: new Date()
        }
    }).select("_id");

    if (!moment) {
        throw new ApiError(
            404,
            "Moment not found"
        );
    }

    // Read pagination parameters
    const rawPage = Array.isArray(req.query.page)
        ? req.query.page[0]
        : req.query.page;

    const rawLimit = Array.isArray(req.query.limit)
        ? req.query.limit[0]
        : req.query.limit;

    let page = 1;
    let limit = 20;

    if (rawPage !== undefined) {
        if (
            typeof rawPage !== "string" ||
            !/^[1-9]\d*$/.test(rawPage)
        ) {
            throw new ApiError(
                400,
                "Page must be a positive integer"
            );
        }

        page = Number(rawPage);

        if (!Number.isSafeInteger(page)) {
            throw new ApiError(
                400,
                "Page value is too large"
            );
        }
    }

    if (rawLimit !== undefined) {
        if (
            typeof rawLimit !== "string" ||
            !/^[1-9]\d*$/.test(rawLimit)
        ) {
            throw new ApiError(
                400,
                "Limit must be a positive integer"
            );
        }

        limit = Number(rawLimit);

        if (!Number.isSafeInteger(limit)) {
            throw new ApiError(
                400,
                "Limit value is too large"
            );
        }

        limit = Math.min(limit, 100);
    }

    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
        throw new ApiError(
            400,
            "Page value is too large"
        );
    }

    // Fetch viewers and total count
    const [viewers, totalViewers] = await Promise.all([
        MomentView.find({
            moment: moment._id
        })
            .populate(
                "viewer",
                "username fullName avatar isVerified"
            )
            .sort({
                viewedAt: -1,
                _id: -1
            })
            .skip(skip)
            .limit(limit)
            .lean(),

        MomentView.countDocuments({
            moment: moment._id
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

//======================= deleteMoment =========================//

const deleteMoment = asyncHandler(async (req, res) => {
    const { momentId } = req.params;
    const userId = req.user?._id;

    // Login required
    if (!userId) {
        throw new ApiError(
            401,
            "Unauthorized request"
        );
    }

    // Validate Moment ID
    if (!mongoose.Types.ObjectId.isValid(momentId)) {
        throw new ApiError(
            400,
            "Invalid moment ID"
        );
    }

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const moment = await Moment.findOne({ _id: momentId, owner: userId })
                .select("owner mediaUrl mediaPublicId mediaType +mediaDeliveryType +mediaResourceType +mediaRegistry")
                .session(session).lean();
            if (!moment) throw new ApiError(404, "Moment not found");

            await recordMomentMedia(moment, { session });
            await MomentView.deleteMany({ moment: moment._id }, { session });
            await Moment.deleteOne({ _id: moment._id, owner: userId }, { session });
        });
    } finally {
        await session.endSession();
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            null,
            "Moment deleted; media cleanup is pending review"
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
