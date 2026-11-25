
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

// ==================== Get Video Details ====================

export function getVideoById(videoId) {
  const id = validateVideoId(videoId);

  return api.get(`/videos/${id}`);
}

// ==================== Get Videos / Recommendations ====================

export function getVideos(params = {}) {
  return api.get("/videos", {
    params: {
      page: 1,
      limit: 20,
      ...params,
    },
  });
}

// ==================== Record Video View ====================

export function recordVideoView(videoId) {
  const id = validateVideoId(videoId);

  return api.patch(`/videos/${id}/views`);
}

// ==================== Default Export ====================

const videoService = {
  getVideoById,
  getVideos,
  recordVideoView,
};

export default videoService;
