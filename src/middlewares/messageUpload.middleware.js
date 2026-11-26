import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import mongoose from "mongoose";
import { fileTypeFromFile } from "file-type";
import { Conversation } from "../models/conversation.model.js";
import { ConversationMember } from "../models/conversationMember.model.js";
import { isBlockedBetweenUsers } from "../utils/isBlockedBetweenUsers.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST_BYTES = 40 * 1024 * 1024 + 128 * 1024;
const allowed = {
    ".jpg": ["image/jpeg", "image"], ".jpeg": ["image/jpeg", "image"], ".png": ["image/png", "image"], ".webp": ["image/webp", "image"],
    ".mp4": ["video/mp4", "video"], ".webm": ["video/webm", "video"],
    ".mp3": ["audio/mpeg", "audio"], ".wav": ["audio/wav", "audio"],
    ".txt": ["text/plain", "file"]
};

const authorizeMessageUpload = asyncHandler(async (req, _res, next) => {
    const { conversationId } = req.params; const user = req.user?._id;
    if (!mongoose.isValidObjectId(conversationId) || !user) throw new ApiError(400, "Invalid conversation ID");
    const conversation = await Conversation.findOne({ _id: conversationId, isActive: true }).lean();
    if (!conversation) throw new ApiError(404, "Conversation not found");
    if (conversation.type === "direct") {
        if (!conversation.participants.some((id) => String(id) === String(user))) throw new ApiError(403, "Conversation unavailable");
        const other = conversation.participants.find((id) => String(id) !== String(user));
        if (other && await isBlockedBetweenUsers(user, other)) throw new ApiError(403, "Conversation unavailable");
    } else if (conversation.type === "group") {
        if (!await ConversationMember.exists({ conversation: conversationId, user, isActive: true })) throw new ApiError(403, "Active group membership required");
    } else throw new ApiError(403, "Conversation unavailable");
    const length = req.headers["content-length"];
    // Reject unknown-length multipart bodies before parsing, including chunked
    // transfers, so multipart overhead is bounded as well as file bytes.
    if (req.is("multipart/form-data") && !length) throw new ApiError(411, "Content-Length is required for attachments");
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) throw new ApiError(413, "Request too large");
    next();
});

const parser = multer({ storage: multer.diskStorage({ destination: "./public/temp", filename: (_req, _file, cb) => cb(null, `message-${crypto.randomUUID()}`) }),
    limits: { fileSize: MAX_FILE_BYTES, files: 2, fields: 10, fieldSize: 8192, parts: 12 } }).array("media", 2);
const cleanup = async (files) => {
    const results = await Promise.allSettled((files || []).map((file) => fs.unlink(file.path).catch((error) => { if (error.code !== "ENOENT") throw error; })));
    if (results.some((result) => result.status === "rejected")) console.error("Failed to remove a temporary message attachment");
};

// Bounded structural checks complement magic-byte detection. They are not a
// decoder, antivirus scanner, or proof that content is harmless.
const validContainer = (extension, data) => {
    if (extension === ".jpg" || extension === ".jpeg") return data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9;
    if (extension === ".webp" || extension === ".wav") return data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.readUInt32LE(4) + 8 === data.length && data.toString("ascii", 8, 12) === (extension === ".webp" ? "WEBP" : "WAVE");
    if (extension === ".png") {
        let offset = 8, first = true, imageData = false;
        while (offset + 12 <= data.length) {
            const size = data.readUInt32BE(offset), end = offset + 12 + size;
            if (end > data.length) return false;
            const kind = data.toString("ascii", offset + 4, offset + 8);
            if (first && (kind !== "IHDR" || size !== 13)) return false;
            if (kind === "IDAT") imageData = true;
            if (kind === "IEND") return size === 0 && imageData && end === data.length;
            first = false; offset = end;
        }
        return false;
    }
    return true;
};

const parseMessageUpload = (req, res, next) => {
    parser(req, res, async (error) => {
        if (error) { await cleanup(req.files); return next(new ApiError(error.code === "LIMIT_FILE_SIZE" ? 413 : 400, "Attachment upload limit exceeded or invalid")); }
        try {
            const files = req.files || [];
            if (files.reduce((sum, file) => sum + file.size, 0) > 40 * 1024 * 1024) throw new ApiError(413, "Attachments are too large");
            for (const file of files) {
                const original = file.originalname;
                if (!original || original.includes("/") || original.includes("\\") || /[\x00-\x1f\x7f]/.test(original) || original.length > 200) throw new ApiError(400, "Invalid attachment filename");
                const extension = path.extname(original).toLowerCase(); const rule = allowed[extension];
                const compatibleMime = rule && (file.mimetype === rule[0] || (extension === ".wav" && ["audio/vnd.wave", "audio/x-wav"].includes(file.mimetype)));
                if (!compatibleMime || req.body.type !== rule[1]) throw new ApiError(400, "Attachment type is not allowed");
                if (extension === ".txt") {
                    const bytes = await fs.readFile(file.path); let text;
                    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new ApiError(400, "Invalid text attachment"); }
                    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw new ApiError(400, "Invalid text attachment");
                } else {
                    let detected;
                    try { detected = await fileTypeFromFile(file.path); } catch { throw new ApiError(400, "Malformed attachment"); }
                    if (!detected || detected.mime !== rule[0]) throw new ApiError(400, "Attachment content does not match its type");
                    if ([".png", ".jpg", ".jpeg", ".webp", ".wav"].includes(extension) && !validContainer(extension, await fs.readFile(file.path))) throw new ApiError(400, "Malformed attachment");
                }
                file.mimetype = rule[0];
            }
            res.once("finish", () => { void cleanup(files); });
            res.once("close", () => { void cleanup(files); });
            next();
        } catch (validationError) { await cleanup(req.files); next(validationError); }
    });
};
export { authorizeMessageUpload, parseMessageUpload, MAX_FILE_BYTES, MAX_REQUEST_BYTES };
