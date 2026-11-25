
import api from "../../lib/axios";

// Get currently logged-in user
export const getCurrentUser = async () => {
    const response = await api.get("/users/current-user");

    return response.data.data.user;
};

// Get another user's public profile
export const getPublicProfile = async (userId) => {
    if (!userId) {
        throw new Error("User ID is required");
    }

    const response = await api.get(
        `/users/profile/${encodeURIComponent(userId)}`
    );

    return response.data.data;
};

// Update account details
export const updateAccountDetails = async (userData) => {
    if (!userData || typeof userData !== "object") {
        throw new Error("Valid user data is required");
    }

    const response = await api.patch(
        "/users/update-account",
        userData
    );

    return response.data.data;
};

// Update user avatar
export const updateAvatar = async (file) => {
    if (!file) {
        throw new Error("Avatar file is required");
    }

    const formData = new FormData();
    formData.append("avatar", file);

    const response = await api.patch(
        "/users/update-avatar",
        formData
    );

    return response.data.data;
};

// Update profile cover image
export const updateCoverImage = async (file) => {
    if (!file) {
        throw new Error("Cover image file is required");
    }

    const formData = new FormData();
    formData.append("coverImage", file);

    const response = await api.patch(
        "/users/update-cover-image",
        formData
    );

    return response.data.data;
};

// Change username
export const changeUsername = async (username) => {
    if (typeof username !== "string" || !username.trim()) {
        throw new Error("Username is required");
    }

    const response = await api.patch(
        "/users/change-username",
        {
            username: username.trim().toLowerCase(),
        }
    );

    return response.data.data;
};
