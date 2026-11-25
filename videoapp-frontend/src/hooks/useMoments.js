import { useCallback, useEffect, useRef, useState } from "react";

import {
  getMoments,
  getMyMoments,
  getUserMoments,
} from "../services/moment/momentApi";

function getMomentArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.moments)) return payload.moments;
  if (Array.isArray(payload?.data?.moments)) {
    return payload.data.moments;
  }

  return [];
}

function getViewedStorageKey(viewerId) {
  return `videoapp:viewed-moments:${viewerId}`;
}

function readViewedIds(viewerId) {
  if (!viewerId || typeof window === "undefined") {
    return new Set();
  }

  try {
    const key = getViewedStorageKey(viewerId);
    const saved = JSON.parse(
      window.localStorage.getItem(key) || "[]"
    );
    const now = Date.now();

    const active = Array.isArray(saved)
      ? saved.filter((item) => {
          const expiry = new Date(item.expiresAt).getTime();

          return item.id && Number.isFinite(expiry) && expiry > now;
        })
      : [];

    window.localStorage.setItem(key, JSON.stringify(active));

    return new Set(active.map((item) => String(item.id)));
  } catch {
    return new Set();
  }
}

function saveViewedMoment(viewerId, moment) {
  if (!viewerId || !moment?._id || typeof window === "undefined") {
    return;
  }

  try {
    const key = getViewedStorageKey(viewerId);
    const saved = JSON.parse(
      window.localStorage.getItem(key) || "[]"
    );

    const entries = Array.isArray(saved) ? saved : [];
    const expiry =
      moment.expiresAt ||
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const updated = [
      ...entries.filter(
        (item) => String(item.id) !== String(moment._id)
      ),
      { id: String(moment._id), expiresAt: expiry },
    ];

    window.localStorage.setItem(key, JSON.stringify(updated));
  } catch (error) {
    console.warn("Unable to save viewed Moment:", error);
  }
}

function keepActiveMoments(moments, viewedIds) {
  const now = Date.now();

  return moments
    .filter((moment) => {
      if (!moment?._id || !moment?.mediaUrl || !moment?.expiresAt) {
        return false;
      }

      const expiry = new Date(moment.expiresAt).getTime();

      return Number.isFinite(expiry) && expiry > now;
    })
    .map((moment) => ({
      ...moment,
      isViewed:
        moment.isViewed === true ||
        viewedIds.has(String(moment._id)),
    }));
}

export function useMoments({
  mode = "feed",
  userId = "",
  viewerId = "",
} = {}) {
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const momentsRef = useRef(moments);
  momentsRef.current = moments;

  const refresh = useCallback(async () => {
    if (mode === "user" && !userId) {
      setMoments([]);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      let response;

      if (mode === "mine") {
        response = await getMyMoments();
      } else if (mode === "user") {
        response = await getUserMoments(userId);
      } else {
        response = await getMoments({ page: 1, limit: 50 });
      }

      const viewedIds = readViewedIds(viewerId);
      const list = getMomentArray(response);

      setMoments(keepActiveMoments(list, viewedIds));
    } catch (err) {
      console.error("Unable to load Moments:", err);
      setMoments([]);
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load Moments. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [mode, userId, viewerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const markAsViewed = useCallback(
    (momentId) => {
      if (!momentId) return;

      const id = String(momentId);

      const moment = momentsRef.current.find(
        (item) => String(item._id) === id
      );

      if (moment) {
        saveViewedMoment(viewerId, moment);
      }

      setMoments((previous) =>
        previous.map((item) =>
          String(item._id) === id
            ? { ...item, isViewed: true }
            : item
        )
      );
    },
    [viewerId]
  );

  const removeMomentLocally = useCallback((momentId) => {
    const id = String(momentId);

    setMoments((previous) =>
      previous.filter((item) => String(item._id) !== id)
    );
  }, []);

  return {
    moments,
    loading,
    error,
    refresh,
    markAsViewed,
    removeMomentLocally,
  };
}

export default useMoments;