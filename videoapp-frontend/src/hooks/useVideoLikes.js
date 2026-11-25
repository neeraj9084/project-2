
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getVideoLikeCount,
  getMyLikedVideos,
  likeVideo,
  unlikeVideo,
} from "../services/video/likeService";

// ==================== Helpers ====================

function unwrap(response) {
  return response?.data?.data ?? response?.data ?? null;
}

function getId(value) {
  return value?._id || value?.id || "";
}

function getList(payload) {
  if (Array.isArray(payload)) return payload;

  const options = [
    payload?.videos,
    payload?.likedVideos,
    payload?.likes,
    payload?.docs,
    payload?.results,
    payload?.data?.videos,
    payload?.data?.likedVideos,
    payload?.data?.likes,
    payload?.data?.docs,
  ];

  return options.find(Array.isArray) || [];
}

function getLikedVideoId(item) {
  const video = item?.video ?? item?.videoId ?? item;
  return typeof video === "object" ? getId(video) : video;
}

function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

// ==================== useVideoLikes Hook ====================

export default function useVideoLikes(videoId) {
  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likesLoading, setLikesLoading] = useState(true);
  const [likeError, setLikeError] = useState("");

  const currentVideoIdRef = useRef(videoId);
  const busyVideoIdsRef = useRef(new Set());

  // Keep the current ID available to asynchronous callbacks.
  currentVideoIdRef.current = videoId;

  // ==================== Load Like Count and Status ====================

  useEffect(() => {
    let active = true;

    setLikeCount(0);
    setIsLiked(false);
    setLikeError("");
    setLikesLoading(true);
    setLikeBusy(false);

    async function loadLikeState() {
      if (!videoId) {
        setLikeError("Video ID is missing.");
        setLikesLoading(false);
        return;
      }

      const results = await Promise.allSettled([
        getVideoLikeCount(videoId),
        getMyLikedVideos(),
      ]);

      if (!active) return;

      const [countResult, likedResult] = results;
      let loadError = "";

      // Load total like count.
      if (countResult.status === "fulfilled") {
        const data = unwrap(countResult.value);

        const count = Number(
          data?.likeCount ?? data?.count ?? 0
        );

        setLikeCount(
          Number.isFinite(count) ? Math.max(0, count) : 0
        );
      } else {
        loadError = getErrorMessage(
          countResult.reason,
          "Unable to load like count."
        );

        console.error(
          "Unable to load like count:",
          loadError
        );
      }

      // Check whether the current user liked this video.
      if (likedResult.status === "fulfilled") {
        const likedVideos = getList(
          unwrap(likedResult.value)
        );

        const liked = likedVideos.some((item) => {
          const likedId = getLikedVideoId(item);

          return String(likedId || "") === String(videoId);
        });

        setIsLiked(liked);
      } else {
        const status = likedResult.reason?.response?.status;

        // A user who is not authenticated cannot have a
        // confirmed liked status in this request.
        setIsLiked(false);

        if (status !== 401 && status !== 403) {
          loadError ||= getErrorMessage(
            likedResult.reason,
            "Unable to load liked videos."
          );
        }

        console.error(
          "Unable to load liked videos:",
          likedResult.reason?.response?.data?.message ||
            likedResult.reason?.message
        );
      }

      setLikeError(loadError);
      setLikesLoading(false);
    }

    loadLikeState();

    return () => {
      active = false;
    };
  }, [videoId]);

  // ==================== Like / Unlike ====================

  const handleLike = useCallback(async () => {
    if (!videoId) {
      setLikeError("Video ID is missing.");
      return;
    }

    const id = String(videoId);

    // Prevent rapid duplicate requests for this video.
    if (busyVideoIdsRef.current.has(id)) return;

    busyVideoIdsRef.current.add(id);

    const wasLiked = isLiked;
    const previousCount = likeCount;

    setLikeBusy(true);
    setLikeError("");

    // Optimistic update.
    setIsLiked(!wasLiked);
    setLikeCount(
      Math.max(0, previousCount + (wasLiked ? -1 : 1))
    );

    try {
      if (wasLiked) {
        await unlikeVideo(id);
      } else {
        await likeVideo(id);
      }
    } catch (error) {
      // Roll back only if the user is still viewing this video.
      if (
        String(currentVideoIdRef.current || "") === id
      ) {
        setIsLiked(wasLiked);
        setLikeCount(previousCount);

        setLikeError(
          getErrorMessage(error, "Unable to update like.")
        );
      }

      console.error("Like request failed:", {
        videoId: id,
        status: error?.response?.status,
        message:
          error?.response?.data?.message || error?.message,
      });
    } finally {
      busyVideoIdsRef.current.delete(id);

      if (String(currentVideoIdRef.current || "") === id) {
        setLikeBusy(false);
      }
    }
  }, [videoId, isLiked, likeCount]);

  return {
    likeCount,
    isLiked,
    likeBusy,
    likesLoading,
    likeError,
    handleLike,
  };
}
