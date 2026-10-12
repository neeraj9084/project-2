import api from "../../lib/axios";

export const getCurrentUser = async () => {
  const response = await api.get("/users/current-user");

  return response.data.data.user;
};

export const updateAccountDetails = async (userData) => {
  const response = await api.patch("/users/update-account", userData);
  return response.data.data;
};

export const updateAvatar = async (file) => {
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await api.patch("/users/update-avatar", formData);
  return response.data.data;
};

export const updateCoverImage = async (file) => {
  const formData = new FormData();
  formData.append("coverImage", file);

  const response = await api.patch("/users/update-cover-image", formData);
  return response.data.data;
};

export const changeUsername = async (username) => {
  const response = await api.patch("/users/change-username", { username });
  return response.data.data;
};