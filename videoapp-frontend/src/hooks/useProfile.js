import { useCallback, useEffect, useState } from "react";

import {
  getCurrentUser,
  updateAccountDetails,
  updateAvatar,
  updateCoverImage,
} from "../services/user/userApi";

function useProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await getCurrentUser();

      const userData = response?.data;

      setProfile(userData || null);
    } catch (err) {
      setError(
        err?.userMessage ||
          err?.response?.data?.message ||
          "Failed to load profile"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const saveAccountDetails = useCallback(
    async (payload) => {
      const response =
        await updateAccountDetails(payload);

      const updatedUser = response?.data;

      setProfile(updatedUser);

      return updatedUser;
    },
    []
  );

  const changeAvatar = useCallback(
    async (file) => {
      const response =
        await updateAvatar(file);

      const updatedUser = response?.data;

      setProfile(updatedUser);

      return updatedUser;
    },
    []
  );

  const changeCover = useCallback(
    async (file) => {
      const response =
        await updateCoverImage(file);

      const updatedUser = response?.data;

      setProfile(updatedUser);

      return updatedUser;
    },
    []
  );

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    loading,
    error,
    refetchProfile: fetchProfile,
    saveAccountDetails,
    changeAvatar,
    changeCover,
  };
}

export default useProfile;