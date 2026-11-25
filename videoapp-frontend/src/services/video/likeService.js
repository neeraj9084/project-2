
import api from "../../lib/axios";

// ==================== Helpers ====================

function validateVideoId(videoId) {
  if (
    typeof videoId !== "string" ||
    !videoId.trim()
  ) {
    throw new Error("A valid video ID is required.");
  }

  return encodeURIComponent(videoId.trim());
}

// ==================== Get Video Like Count ====================

export function getVideoLikeCount(videoId) {
  const id = validateVideoId(videoId);

  return api.get(`/likes/video/${id}/count`);
}

// ==================== Get Current User's Liked Videos ====================

export function getMyLikedVideos() {
  return api.get("/likes/my-liked-videos");
}

// ==================== Like Video ====================

export function likeVideo(videoId) {
  const id = validateVideoId(videoId);

  return api.post(`/likes/video/${id}`);
}

// ==================== Unlike Video ====================

export function unlikeVideo(videoId) {
  const id = validateVideoId(videoId);

  return api.delete(`/likes/video/${id}`);
}

// ==================== Default Export ====================

const likeService = {
  getVideoLikeCount,
  getMyLikedVideos,
  likeVideo,
  unlikeVideo,
};

export default likeService;
