
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { recordVideoView } from "../services/video/videoService";

// ==================== Helpers ====================

function getId(value) {
  return value?._id || value?.id || "";
}

function getResponseVideo(response) {
  const payload = response?.data?.data ?? response?.data;
  return payload?.video ?? payload;
}

// ==================== useVideoViews Hook ====================

export default function useVideoViews(videoId, setVideo) {
  const recordedVideoIds = useRef(new Set());
  const inFlightVideoIds = useRef(new Set());

  const [viewError, setViewError] = useState("");

  useEffect(() => {
    setViewError("");
  }, [videoId]);

  const recordView = useCallback(async () => {
    if (!videoId) return;

    const id = String(videoId);

    // Avoid duplicate requests for the same video.
    if (
      recordedVideoIds.current.has(id) ||
      inFlightVideoIds.current.has(id)
    ) {
      return;
    }

    inFlightVideoIds.current.add(id);
    setViewError("");

    try {
      const response = await recordVideoView(id);

      const responseVideo = getResponseVideo(response);
      const serverViews = responseVideo?.views;

      // Mark as recorded only after a successful API response.
      recordedVideoIds.current.add(id);

      if (typeof setVideo === "function") {
        setVideo((previous) => {
          // Do not update a different video.
          if (!previous || String(getId(previous)) !== id) {
            return previous;
          }

          const hasServerCount =
            serverViews !== undefined &&
            serverViews !== null &&
            Number.isFinite(Number(serverViews));

          return {
            ...previous,
            views: hasServerCount
              ? Number(serverViews)
              : (Number(previous.views) || 0) + 1,
          };
        });
      }
    } catch (error) {
      setViewError(
        error.response?.data?.message ||
          "Unable to record video view."
      );

      console.error("Unable to record video view:", {
        videoId: id,
        status: error.response?.status,
        message:
          error.response?.data?.message || error.message,
      });
    } finally {
      inFlightVideoIds.current.delete(id);
    }
  }, [videoId, setVideo]);

  return {
    recordView,
    viewError,
  };
}
