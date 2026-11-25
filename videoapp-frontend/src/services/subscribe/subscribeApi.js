
import api from "../../lib/axios";

// Follow / Subscribe to a channel
export const followUser = async (channelId) => {
  if (!channelId) {
    throw new Error("Channel ID is required");
  }

  try {
    const response = await api.post(
      `/subscribes/channel/${channelId}`
    );

    return response.data.data;
  } catch (error) {
    console.error(
      "Failed to follow channel:",
      error.response?.data || error.message
    );
    throw error;
  }
};

// Unfollow / Unsubscribe from a channel
export const unfollowUser = async (channelId) => {
  if (!channelId) {
    throw new Error("Channel ID is required");
  }

  try {
    const response = await api.delete(
      `/subscribes/channel/${channelId}`
    );

    return response.data.data;
  } catch (error) {
    console.error(
      "Failed to unfollow channel:",
      error.response?.data || error.message
    );
    throw error;
  }
};

// Get channels that the current user follows
export const getMySubscriptions = async (params = {}) => {
  try {
    const response = await api.get(
      "/subscribes/my-subscriptions",
      { params }
    );

    return response.data.data;
  } catch (error) {
    console.error(
      "Failed to fetch my subscriptions:",
      error.response?.data || error.message
    );

    throw error;
  }
};

// Get followers / subscribers of a specific channel
export const getChannelFollowers = async (
  channelId,
  params = {}
) => {
  if (!channelId) {
    throw new Error("Channel ID is required");
  }

  try {
    const response = await api.get(
      `/subscribes/channel/${channelId}/subscribers`,
      { params }
    );

    return response.data.data;
  } catch (error) {
    console.error(
      "Failed to fetch channel followers:",
      error.response?.data || error.message
    );

    throw error;
  }
};
