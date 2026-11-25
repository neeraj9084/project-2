
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { getVideoById } from "../services/video/videoService";

// ==================== Helpers ====================

function unwrap(response) {
  return response?.data?.data ?? response?.data ?? null;
}

function getId(value) {
  return value?._id || value?.id || "";
}

// ==================== Custom Hook ====================

export default function useVideoDetails(videoId) {
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function fetchVideo() {
      if (!videoId) {
        setVideo(null);
        setError("Video ID is missing.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      setVideo(null);

      try {
        const response = await getVideoById(videoId);
        const payload = unwrap(response);
        const result = payload?.video || payload;

        if (!getId(result)) {
          throw new Error(
            "Video details were not returned by the API."
          );
        }

        if (active) {
          setVideo(result);
        }
      } catch (err) {
        if (!active) return;

        setVideo(null);
        setError(
          err.response?.data?.message ||
            err.message ||
            "Unable to load this video."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchVideo();

    return () => {
      active = false;
    };
  }, [videoId, reloadKey]);

  // ==================== Refetch Video ====================

  const refetch = useCallback(() => {
    setReloadKey((previous) => previous + 1);
  }, []);

  return {
    video,
    setVideo,
    loading,
    error,
    refetch,
  };
}
