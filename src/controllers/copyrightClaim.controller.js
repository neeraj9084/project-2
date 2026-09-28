import mongoose from "mongoose";

import { CopyrightClaim } from "../models/copyrightClaim.model.js";
import { Video } from "../models/video.model.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

//=========================== submitCopyrightClaim ===========================

const submitCopyrightClaim = asyncHandler(async (req, res) => {
    const claimantId = req.user._id;
    const { videoId } = req.params;
    const { reason, description } = req.body || {};

    if (!claimantId) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (
        !videoId ||
        !mongoose.Types.ObjectId.isValid(videoId)
    ) {
        throw new ApiError(400, "Invalid video ID");
    }

    if (
        typeof reason !== "string" ||
        !reason.trim()
    ) {
        throw new ApiError(
            400,
            "Copyright claim reason is required"
        );
    }

    if (
        typeof description !== "string" ||
        !description.trim()
    ) {
        throw new ApiError(
            400,
            "Copyright claim description is required"
        );
    }

    const trimmedReason = reason.trim();
    const trimmedDescription = description.trim();

    if (trimmedDescription.length > 2000) {
        throw new ApiError(
            400,
            "Description cannot exceed 2000 characters"
        );
    }

    const video = await Video.findById(videoId)
        .select("_id owner title")
        .lean();

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    if (video.owner.equals(claimantId)) {
        throw new ApiError(
            400,
            "You cannot submit a copyright claim against your own video"
        );
    }

    const existingClaim = await CopyrightClaim.findOne({
        claimant: claimantId,
        video: videoId,
        status: {
            $in: ["pending", "approved"],
        },
    })
        .select("_id status")
        .lean();

    if (existingClaim) {
        throw new ApiError(
            409,
            `You already have a ${existingClaim.status} copyright claim for this video`
        );
    }

    let claim;

    try {
        claim = await CopyrightClaim.create({
            claimant: claimantId,
            video: videoId,
            reason: trimmedReason,
            description: trimmedDescription,
        });
    } catch (error) {
        if (error?.code === 11000) {
            throw new ApiError(
                409,
                "You already have an active copyright claim for this video"
            );
        }

        throw error;
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                claimId: claim._id,
                videoId: claim.video,
                reason: claim.reason,
                status: claim.status,
                submittedAt: claim.createdAt,
            },
            "Copyright claim submitted successfully"
        )
    );
});

//========================== getMyCopyrightClaims ==============================

const getMyCopyrightClaims = asyncHandler(async (req, res) => {

    const claims = await CopyrightClaim.find({
        claimant: req.user._id
    })
        .populate({
            path: "video",
            select: "_id title thumbnail owner"
        })
        .sort({ createdAt: -1 })
        .lean();

    return res.status(200).json(
        new ApiResponse(
            200,
            claims,
            "Your copyright claims fetched successfully"
        )
    );
});

export {
    submitCopyrightClaim,
    getMyCopyrightClaims
};