
import api from "../../lib/axios";

export const getAllVideos = async (params = {}) => {
  const response = await api.get("/videos", {
    params: {
      page: 1,
      limit: 40,
      sortBy: "createdAt",
      sortType: "desc",
      ...params,
    },
  });

  return response.data.data;
};

export const getMyVideos = async () => {
  const response = await api.get("/videos/my-videos");
  return response.data.data;
};

export const getMyLikedVideos = async () => {
  const response = await api.get("/likes/my-liked-videos");
  return response.data.data;
};

export const getVideoLikeCount = async (videoId) => {
  const response = await api.get(
    `/likes/video/${videoId}/count`
  );

  return response.data.data;
};

export const likeVideo = async (videoId) => {
  const response = await api.post(`/likes/video/${videoId}`);
  return response.data.data;
};

export const unlikeVideo = async (videoId) => {
  const response = await api.delete(`/likes/video/${videoId}`);
  return response.data.data;
};

export const getVideoComments = async (videoId) => {
  const response = await api.get(`/comments/video/${videoId}`);
  return response.data.data;
};

export const addVideoComment = async (videoId, content) => {
  const response = await api.post(
    `/comments/video/${videoId}`,
    { content }
  );

  return response.data.data;
};

export const shareVideo = async (videoId) => {
  const response = await api.post(`/shares/video/${videoId}`);
  return response.data.data;
};

export const getUserPlaylists = async () => {
  const response = await api.get("/playlists");
  return response.data.data;
};

export const addVideoToPlaylist = async (playlistId, videoId) => {
  const response = await api.post(
    `/playlists/${playlistId}/videos/${videoId}`
  );

  return response.data.data;
};
