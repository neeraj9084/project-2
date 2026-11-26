import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { approveModerationRetention, releaseModerationHolds } from "../services/assetModerationHold.service.js";

const validateParams = (req) => {
    const { caseType, caseId } = req.params;
    if (!["report", "copyright"].includes(caseType) || !mongoose.isValidObjectId(caseId)) throw new ApiError(400, "Invalid moderation case");
    return { caseType, caseId, adminId: req.user._id };
};

const approveRetention = asyncHandler(async (req, res) => {
    const args = validateParams(req);
    const { retentionUntil, reason } = req.body || {};
    if (typeof retentionUntil !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(retentionUntil)) throw new ApiError(400, "retentionUntil must be a UTC ISO timestamp");
    const date = new Date(retentionUntil);
    if (!Number.isFinite(date.getTime())) throw new ApiError(400, "Invalid retentionUntil");
    const session = await mongoose.startSession();
    let result;
    try { await session.withTransaction(async () => { result = await approveModerationRetention({ ...args, retentionUntil: date, reason, session }); }); }
    finally { await session.endSession(); }
    return res.status(200).json(new ApiResponse(200, result, "Moderation retention approved"));
});

const releaseHolds = asyncHandler(async (req, res) => {
    const args = validateParams(req);
    const session = await mongoose.startSession();
    let result;
    try { await session.withTransaction(async () => { result = await releaseModerationHolds({ ...args, session }); }); }
    finally { await session.endSession(); }
    return res.status(200).json(new ApiResponse(200, result, "Moderation holds released"));
});

export { approveRetention, releaseHolds };
