import mongoose from "mongoose";

import { Comment } from "../models/comment.model.js"
import { Video } from "../models/video.model.js"

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { isBlockedBetweenUsers } from "../utils/isBlockedBetweenUsers.js";

//====================== addComment ===============================//

const addComment = asyncHandler(async(req, res) => {
 
    const { videoId }  =req.params;

    if(!mongoose.Types.ObjectId.isValid(videoId)){
      throw new ApiError(400, "Invalid video ID")
    }

    const video = await Video.findOne({
        _id: videoId,
        isPublished: true
    });

    if(!video) {
        throw new ApiError(404,"Video not found")
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

    const { content } = req.body;

    if(!content?.trim()) {
        throw new ApiError(400,"Comment content is required")
    }

    const comment = await Comment.create({
        video: videoId,
        content: content.trim(),
        owner: req.user._id
    })

    if(!comment) {
        throw new ApiError(500,"Failed to comment video")
    }

    return res 
    .status(201)
    .json(
        new ApiResponse(
            201,
            comment,
            "Comment added successfully"
        )
    )
})

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


//=============== Unlike a comment==========================//

const unlikeComment = asyncHandler(async (req, res) => {

    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        throw new ApiError(400, "Invalid comment ID");
    }

    const comment = await Comment.findById(commentId);

    if (!comment) {
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


//=============== Get comment like count==========================//!SECTION

const getCommentLikeCount = asyncHandler(async (req, res) => {

    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        throw new ApiError(400, "Invalid comment ID");
    }

    const comment = await Comment
        .findById(commentId)
        .select("likes");

    if (!comment) {
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

//=====================getVideoComments =====================//

const getVideoComments = asyncHandler(async(req, res) => {

      const { videoId } = req.params;

     if (!mongoose.Types.ObjectId.isValid(videoId)) {
    throw new ApiError(400, "Invalid video ID");
}

      const video = await Video.findOne({
        _id: videoId,
        isPublished: true
      });

      if(!video) {
        throw new ApiError(404, "Video not found")
      }
    
      const comments = await Comment.find({
        video: videoId
      })
      .populate("owner", "username fullName avatar")
      .sort({ createdAt: -1 });
       
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

      return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            comments,
            "Video comments fetched successfully"
        )
    );

})

//===================== getCommentById =============================//

const getCommentById = asyncHandler(async(req, res) => {

    const { commentId } = req.params;

    if(!mongoose.Types.ObjectId.isValid(commentId)){
        throw new ApiError(400, "Invalid comment ID")
    }

    const comment = await Comment.findById(commentId)
    .populate("owner","username fullName avatar")

    if(!comment){
        throw new ApiError(404,"Comment not found")
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
        throw new ApiError(404, "Comment not found");
    }

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            comment,
            "Comment fetched successfully"
        )
    )
})

//===================== updateComment ==============================//

const updateComment = asyncHandler(async(req, res) => {

    const { commentId } = req.params;
    const { content } = req.body;

    if(!mongoose.Types.ObjectId.isValid(commentId)){
        throw new ApiError(400, "Invalid comment ID")
    }

    if(!content?.trim()){
        throw new ApiError(400, "Comment content is required");
    }

    const comment = await Comment.findById(commentId)

    if(!comment) {
        throw new ApiError(404, "Comment not found")
    }

    if(comment.owner.toString() !== req.user._id.toString()){
        throw new ApiError(403, "You are not allowed to update this comment")
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
    )
})

//==================== deleteComment ===============================//

const deleteComment = asyncHandler(async(req, res) => {

     const { commentId } = req.params;

     if(!mongoose.Types.ObjectId.isValid(commentId)){
        throw new ApiError(400,"Invalid comment ID")
     }

     const comment = await Comment.findById(commentId)
     
     if(!comment) {
        throw new ApiError(404, "Comment not found")
     }

       if (!comment.owner.equals(req.user._id)) {
        throw new ApiError(
            403,
            "You are not allowed to delete this comment"
        );
    }

     await Comment.findByIdAndDelete(commentId);

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            null,
            "Comment deleted successfully"
        )
    );
})

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
