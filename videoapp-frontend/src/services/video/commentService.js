import api from "../../lib/axios";

// ==================== Helpers ====================

function validateId(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }

  return encodeURIComponent(value.trim());
}

// ==================== Get Video Comments ====================

export function getVideoComments(videoId) {
  const id = validateId(videoId, "Video ID");

  return api.get(`/comments/video/${id}`);
}

// ==================== Add Comment / Reply ====================

export function addVideoComment(
  videoId,
  content,
  parentComment = null
) {
  const id = validateId(videoId, "Video ID");

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Comment cannot be empty.");
  }

  const trimmedContent = content.trim();

  if (trimmedContent.length > 1000) {
    throw new Error("Comment cannot exceed 1000 characters.");
  }

  const payload = {
    content: trimmedContent,
  };

  if (parentComment !== null && parentComment !== undefined) {
    payload.parentComment = validateId(
      parentComment,
      "Parent comment ID"
    );
  }

  return api.post(`/comments/video/${id}`, payload);
}

// ==================== Reply To Any Comment / Reply ====================

export function replyToComment(
  videoId,
  parentCommentId,
  content
) {
  const parentId = validateId(
    parentCommentId,
    "Parent comment ID"
  );

  return addVideoComment(videoId, content, parentId);
}

// ==================== Like Comment ====================

export function likeVideoComment(commentId) {
  const id = validateId(commentId, "Comment ID");

  return api.post(`/comments/${id}/like`);
}

// ==================== Unlike Comment ====================

export function unlikeVideoComment(commentId) {
  const id = validateId(commentId, "Comment ID");

  return api.delete(`/comments/${id}/like`);
}

// ==================== Get Comment Like Count ====================

export function getCommentLikeCount(commentId) {
  const id = validateId(commentId, "Comment ID");

  return api.get(`/comments/${id}/likes`);
}

// ==================== Get Single Comment ====================

export function getCommentById(commentId) {
  const id = validateId(commentId, "Comment ID");

  return api.get(`/comments/${id}`);
}

// ==================== Update Comment ====================

export function updateVideoComment(commentId, content) {
  const id = validateId(commentId, "Comment ID");

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Comment cannot be empty.");
  }

  const trimmedContent = content.trim();

  if (trimmedContent.length > 1000) {
    throw new Error("Comment cannot exceed 1000 characters.");
  }

  return api.patch(`/comments/${id}`, {
    content: trimmedContent,
  });
}

// ==================== Delete Comment ====================

export function deleteVideoComment(commentId) {
  const id = validateId(commentId, "Comment ID");

  return api.delete(`/comments/${id}`);
}

// ==================== Default Export ====================

const commentService = {
  getVideoComments,
  addVideoComment,
  replyToComment,
  likeVideoComment,
  unlikeVideoComment,
  getCommentLikeCount,
  getCommentById,
  updateVideoComment,
  deleteVideoComment,
};

export default commentService;