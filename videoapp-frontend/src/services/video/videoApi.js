import api from "../../lib/axios";

export const getMyVideos = async () => {
  const response = await api.get("/videos/my-videos");
  return response.data.data;
};