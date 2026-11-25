import mongoose from "mongoose";

import { Comment } from "../models/comment.model.js";
import { Video } from "../models/video.model.js";
import { Notification } from "../models/notification.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { isBlockedBetweenUsers } from "../utils/isBlockedBetweenUsers.js";

//====================== addComment ===============================//

const addComment = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { content, parentComment = null } = req.body;

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    if (
        typeof content !== "string" ||
        !content.trim() ||
        content.trim().length > 1000
    ) {
        throw new ApiError(
            400,
            "Comment must contain 1 to 1000 characters"
        );
    }

    const video = await Video.findOne({
        _id: videoId,
        isPublished: true
    });

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        video.owner
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot comment on this video"
        );
    }

    let parent = null;

    // A reply can target any comment or reply on this video.
    if (parentComment !== null && parentComment !== "") {
        if (
            typeof parentComment !== "string" ||
            !mongoose.Types.ObjectId.isValid(parentComment)
        ) {
            throw new ApiError(400, "Invalid parent comment ID");
        }

        parent = await Comment.findOne({
            _id: parentComment,
            video: videoId
        });

        if (!parent) {
            throw new ApiError(
                404,
                "Parent comment not found for this video"
            );
        }

        const parentBlocked = await isBlockedBetweenUsers(
            req.user._id,
            parent.owner
        );

        if (parentBlocked) {
            throw new ApiError(
                403,
                "You cannot reply to this comment"
            );
        }
    }

    const comment = await Comment.create({
        video: video._id,
        content: content.trim(),
        owner: req.user._id,
        parentComment: parent ? parent._id : null
    });

    if (!comment) {
        throw new ApiError(500, "Failed to add comment");
    }

    // Notify the parent comment owner for a reply.
    // Otherwise, notify the video owner.
    const recipientId = parent ? parent.owner : video.owner;

    if (recipientId.toString() !== req.user._id.toString()) {
        await Notification.create({
            recipient: recipientId,
            actor: req.user._id,
            type: "comment",
            title: parent ? "New Reply" : "New Comment",
            message: parent
                ? `${req.user.username} replied to your comment`
                : `${req.user.username} commented on your video: ${video.title}`,
            entityType: "comment",
            entityId: comment._id,
            data: {
                commentId: comment._id,
                parentCommentId: parent?._id ?? null,
                videoId: video._id,
                videoTitle: video.title,
                commenterId: req.user._id,
                comment: comment.content
            }
        });
    }

    const populatedComment = await Comment.findById(comment._id)
        .populate("owner", "username fullName avatar isVerified");

    return res.status(201).json(
        new ApiResponse(
            201,
            populatedComment,
            parent
                ? "Reply added successfully"
                : "Comment added successfully"
        )
    );
});


//===================== likeComment ===============================//

const likeComment = asyncHandler(async (req, res) => {

    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        throw new ApiError(400, "Invalid comment ID");
    }

    const comment = await Comment.findById(commentId);

    if (!comment) {
        throw new ApiError(404, "Comment not found");
    }

    if (!await Video.exists({ _id: comment.video, isDeleted: { $ne: true } })) {
        throw new ApiError(404, "Comment not found");
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        comment.owner
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot like this comment"
        );
    }


    // Check if already liked
    const alreadyLiked = comment.likes.some(
        (userId) =>
            userId.toString() === req.user._id.toString()
    );

    if (alreadyLiked) {
        throw new ApiError(
            409,
            "Comment already liked"
        );
    }


    const updatedComment = await Comment.findByIdAndUpdate(
        commentId,
        {
            $addToSet: {
                likes: req.user._id
            }
        },
        {
            new: true
        }
    );

    if (!updatedComment) {
        throw new ApiError(
            500,
            "Failed to like comment"
        );
    }


    // ================== Notification ================== //

    // Don't notify if user likes their own comment
    if (
        comment.owner.toString() !==
        req.user._id.toString()
    ) {

        await Notification.create({
            recipient: comment.owner,
            actor: req.user._id,
            type: "like",

            title: "Comment Liked",

            message: `${req.user.username} liked your comment`,

            entityType: "comment",
            entityId: comment._id,

            data: {
                commentId: comment._id,
                videoId: comment.video,
                likerId: req.user._id,
                comment: comment.content
            }
        });
    }


    return res.status(200).json(
        new ApiResponse(
            200,
            {
                commentId: updatedComment._id,
                likeCount: updatedComment.likes.length,
                isLiked: true
            },
            "Comment liked successfully"
        )
    );
});


//=============== Unlike a comment ==========================//

const unlikeComment = asyncHandler(async (req, res) => {

    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        throw new ApiError(400, "Invalid comment ID");
    }

    const comment = await Comment.findById(commentId);

    if (!comment) {
        throw new ApiError(404, "Comment not found");
    }

    if (!await Video.exists({ _id: comment.video, isDeleted: { $ne: true } })) {
        throw new ApiError(404, "Comment not found");
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        comment.owner
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot unlike this comment"
        );
    }

    const updatedComment = await Comment.findByIdAndUpdate(
        commentId,
        {
            $pull: {
                likes: req.user._id
            }
        },
        {
            new: true
        }
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                commentId: updatedComment._id,
                likeCount: updatedComment.likes.length,
                isLiked: false
            },
            "Comment unliked successfully"
        )
    );
});


//=============== Get comment like count ==========================//

const getCommentLikeCount = asyncHandler(async (req, res) => {

    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        throw new ApiError(400, "Invalid comment ID");
    }

    const comment = await Comment
        .findById(commentId)
        .select("likes video owner");

    if (!comment) {
        throw new ApiError(404, "Comment not found");
    }

    if (!await Video.exists({ _id: comment.video, isDeleted: { $ne: true } })) {
        throw new ApiError(404, "Comment not found");
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        comment.owner
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot view likes of this comment"
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                commentId: comment._id,
                likeCount: comment.likes.length
            },
            "Comment like count fetched successfully"
        )
    );
});


//===================== getVideoComments =====================//

const getVideoComments = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findOne({
        _id: videoId,
        isPublished: true
    });

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        video.owner
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot view comments of this video"
        );
    }

    // Fetch ALL comments and replies, regardless of nesting depth.
    const allComments = await Comment.find({
        video: videoId
    })
        .populate(
            "owner",
            "username fullName avatar isVerified"
        )
        .sort({ createdAt: -1 })
        .lean();

    // Create a lookup map and prepare every node.
    const commentMap = new Map();

    for (const comment of allComments) {
        const id = String(comment._id);

        commentMap.set(id, {
            ...comment,
            replies: [],
            likeCount: Array.isArray(comment.likes)
                ? comment.likes.length
                : 0
        });
    }

    // Attach every comment to its direct parent.
    // This works at any depth: comment -> reply -> reply -> ...
    const rootComments = [];

    for (const comment of allComments) {
        const id = String(comment._id);
        const node = commentMap.get(id);

        const parentId = comment.parentComment
            ? String(comment.parentComment)
            : null;

        if (!parentId) {
            rootComments.push(node);
            continue;
        }

        const parent = commentMap.get(parentId);

        if (parent) {
            parent.replies.push(node);
        } else {
            // Avoid hiding a comment if its parent no longer exists.
            rootComments.push(node);
        }
    }

    // Sort replies newest first at every nesting level.
    function sortTree(nodes) {
        nodes.sort(
            (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
        );

        for (const node of nodes) {
            sortTree(node.replies);
        }

        return nodes;
    }

    sortTree(rootComments);

    return res.status(200).json(
        new ApiResponse(
            200,
            rootComments,
            "Video comments and nested replies fetched successfully"
        )
    );
});

//===================== getCommentById =============================//

const getCommentById = asyncHandler(async (req, res) => {

    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        throw new ApiError(400, "Invalid comment ID");
    }

    const comment = await Comment.findById(commentId)
        .populate(
            "owner",
            "username fullName avatar"
        );

    if (!comment) {
        throw new ApiError(
            404,
            "Comment not found"
        );
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        comment.owner._id
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot view this comment"
        );
    }

    const video = await Video.findOne({
        _id: comment.video,
        isPublished: true
    });

    if (!video) {
        throw new ApiError(
            404,
            "Comment not found"
        );
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                comment,
                "Comment fetched successfully"
            )
        );
});


//===================== updateComment ==============================//

const updateComment = asyncHandler(async (req, res) => {

    const { commentId } = req.params;
    const { content } = req.body;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        throw new ApiError(
            400,
            "Invalid comment ID"
        );
    }

    if (!content?.trim()) {
        throw new ApiError(
            400,
            "Comment content is required"
        );
    }

    const comment = await Comment.findById(
        commentId
    );

    if (!comment) {
        throw new ApiError(
            404,
            "Comment not found"
        );
    }

    if (
        comment.owner.toString() !==
        req.user._id.toString()
    ) {
        throw new ApiError(
            403,
            "You are not allowed to update this comment"
        );
    }

    const blocked = await isBlockedBetweenUsers(
        req.user._id,
        comment.owner
    );

    if (blocked) {
        throw new ApiError(
            403,
            "You cannot update this comment"
        );
    }

    comment.content = content.trim();

    await comment.save();

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                comment,
                "Comment updated successfully"
            )
        );
});



//==================== deleteComment ===============================//

const deleteComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;

    // Validate comment ID
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        throw new ApiError(400, "Invalid comment ID");
    }

    // Find the comment that needs to be deleted
    const comment = await Comment.findById(commentId);

    if (!comment) {
        throw new ApiError(404, "Comment not found");
    }

    // Only the comment owner can delete the comment.
    // Their deletion will also remove all nested descendants.
    if (!comment.owner.equals(req.user._id)) {
        throw new ApiError(
            403,
            "You are not allowed to delete this comment"
        );
    }

    // Collect the comment and all descendants recursively.
    const idsToDelete = [comment._id];
    const visitedIds = new Set([
        comment._id.toString()
    ]);

    // Start with the selected comment as the parent.
    let parentIds = [comment._id];

    while (parentIds.length > 0) {
        // Find direct replies to the current parent level.
        const children = await Comment.find({
            video: comment.video,
            parentComment: {
                $in: parentIds
            }
        })
            .select("_id")
            .lean();

        const nextParentIds = [];

        for (const child of children) {
            const childId = child._id.toString();

            // Defensive check to prevent duplicate processing.
            if (visitedIds.has(childId)) {
                continue;
            }

            visitedIds.add(childId);
            idsToDelete.push(child._id);
            nextParentIds.push(child._id);
        }

        // Process the next nesting level.
        parentIds = nextParentIds;
    }

    // Delete the selected comment and all its descendants.
    const deleteResult = await Comment.deleteMany({
        _id: {
            $in: idsToDelete
        },
        video: comment.video
    });

    if (deleteResult.deletedCount !== idsToDelete.length) {
        throw new ApiError(
            500,
            "Some comments or replies could not be deleted"
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                deletedCommentId: commentId,
                deletedCount: deleteResult.deletedCount
            },
            "Comment and all nested replies deleted successfully"
        )
    );
});


export {
    addComment,
    likeComment,
    unlikeComment,
    getCommentLikeCount,
    getVideoComments,
    getCommentById,
    updateComment,
    deleteComment
};
