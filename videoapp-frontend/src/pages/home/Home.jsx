
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import {
  Bell,
  MessageCircle,
  Plus,
  Search,
  Video,
} from "lucide-react";

import api from "../../lib/axios";
import { getAllVideos } from "../../services/video/videoApi";

import VideoGrid from "../../components/video/VideoGrid";

import { useMoments } from "../../hooks/useMoments";
import MomentsBar from "../../components/moment/MomentsBar";
import MomentViewer from "../../components/moment/MomentViewer";

// ==================== Response Helpers ====================

function unwrapResponse(response) {
  return response?.data?.data ?? response?.data ?? response;
}

function getItems(response, key = "videos") {
  const payload = unwrapResponse(response);

  if (Array.isArray(payload)) {
    return payload;
  }

  const candidates = [
    payload?.[key],
    payload?.docs,
    payload?.results,
    payload?.data?.[key],
    payload?.data?.docs,
  ];

  return candidates.find(Array.isArray) || [];
}

function getId(item) {
  return item?._id || item?.id || "";
}

function getOwner(item) {
  if (item?.owner && typeof item.owner === "object") {
    return item.owner;
  }

  if (item?.user && typeof item.user === "object") {
    return item.user;
  }

  return {};
}

function getUsername(user) {
  return String(user?.username || "").replace(/^@+/, "");
}

// ==================== Home Page ====================

export default function Home() {
  const navigate = useNavigate();

  const [videos, setVideos] = useState([]);
  const [user, setUser] = useState(null);

  const [loadingVideos, setLoadingVideos] = useState(true);
  const [videoError, setVideoError] = useState("");

  const [query, setQuery] = useState("");
  const [activeMomentGroup, setActiveMomentGroup] =
    useState(null);

  // ==================== Moments ====================

  const {
    moments,
    loading: loadingMoments,
    error: momentError,
    refresh: loadMoments,
    markAsViewed,
  } = useMoments({
    mode: "feed",
    viewerId: getId(user),
  });

  // ==================== Fetch Videos ====================

  const loadVideos = useCallback(async () => {
    setLoadingVideos(true);
    setVideoError("");

    try {
      const response = await getAllVideos({
        page: 1,
        limit: 40,
        sortBy: "createdAt",
        sortType: "desc",
      });

      const items = getItems(response, "videos");

      setVideos(
        items.filter(
          (video) =>
            video &&
            video.isPublished !== false &&
            getId(video)
        )
      );
    } catch (error) {
      console.error("Unable to load videos:", error);

      setVideoError(
        error?.response?.data?.message ||
          "Unable to load videos. Please try again."
      );
    } finally {
      setLoadingVideos(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // ==================== Fetch Current User ====================

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const response = await api.get("/users/current-user");
        const payload = unwrapResponse(response);

        const currentUser = payload?.user || payload;

        if (!cancelled) {
          setUser(currentUser || null);
        }
      } catch (error) {
        if (!cancelled) {
          setUser(null);

          console.error(
            "Unable to load current user:",
            error?.response?.data?.message || error.message
          );
        }
      }
    }

    loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  // ==================== Search Videos ====================

  const visibleVideos = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) {
      return videos;
    }

    return videos.filter((video) => {
      const owner = getOwner(video);

      const searchableValues = [
        video.title,
        video.description,
        owner.fullName,
        owner.username,
      ];

      return searchableValues.some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(search)
      );
    });
  }, [videos, query]);

  const handleSearch = (event) => {
    event.preventDefault();

    const search = query.trim();

    if (search) {
      navigate(`/search?q=${encodeURIComponent(search)}`);
    }
  };

  // ==================== Profile Navigation ====================

const openProfile = useCallback(
  (owner) => {
    const ownerId =
      typeof owner === "object"
        ? owner?._id || owner?.id
        : owner;

    if (!ownerId) return;

    const currentUserId = user?._id || user?.id;

    if (
      currentUserId &&
      String(ownerId) === String(currentUserId)
    ) {
      navigate("/profile");
      return;
    }

    navigate(`/profile/${encodeURIComponent(ownerId)}`);
  },
  [navigate, user]
);
  // ==================== Moments Viewer ====================

  const openMomentViewer = useCallback(
    (groupMoments, groupOwner, initialIndex = 0) => {
      if (
        !Array.isArray(groupMoments) ||
        groupMoments.length === 0
      ) {
        return;
      }

      setActiveMomentGroup({
        moments: groupMoments,
        owner: groupOwner,
        initialIndex,
      });
    },
    []
  );

  const closeMomentViewer = useCallback(() => {
    setActiveMomentGroup(null);
  }, []);

  // ==================== Home UI ====================

  return (
    <div className="min-h-full bg-[#08090d] text-white">
      <div className="mx-auto w-full max-w-[1900px] px-3 pb-10 pt-4 sm:px-5 lg:px-6">

        {/* Search and Home Actions */}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <form
            role="search"
            onSubmit={handleSearch}
            className="w-full max-w-[340px] flex-1"
          >
            <div className="group flex h-10 items-center gap-2.5 rounded-full border border-white/[0.09] bg-white/[0.035] px-3.5 transition focus-within:border-violet-400/40">
              <Search
                size={17}
                className="shrink-0 text-white/40"
              />

              <input
                type="search"
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder="Search videos, creators..."
                aria-label="Search videos and creators"
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              />

              <button
                type="submit"
                aria-label="Search"
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 hover:bg-white/[0.06] hover:text-white"
              >
                <Search size={16} />
              </button>
            </div>
          </form>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => navigate("/notifications")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition hover:bg-white/[0.06] hover:text-white"
            >
              <Bell size={19} />
            </button>

            <button
              type="button"
              aria-label="Messages"
              onClick={() => navigate("/messages")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition hover:bg-white/[0.06] hover:text-white"
            >
              <MessageCircle size={19} />
            </button>

            <button
              type="button"
              onClick={() => navigate("/upload")}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-violet-300/25 bg-violet-500/15 px-3.5 text-xs font-semibold text-white transition hover:bg-violet-500/25 sm:px-4"
            >
              <Plus size={17} />
              <span>Create a post</span>
            </button>
          </div>
        </div>

        {/* Moments */}

        <MomentsBar
          user={user}
          moments={moments}
          loading={loadingMoments}
          error={momentError}
          onCreate={() => navigate("/moments/create")}
          onOpen={openMomentViewer}
          onRetry={loadMoments}
        />

        {/* Video Feed */}

        <section aria-label="Video feed" className="mt-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                Find Your Next Favorite
              </h2>

              <p className="mt-2 text-sm text-gray-400">
                Fresh drops, rising creators, and videos worth your time.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate("/explore")}
              className="shrink-0 rounded-full px-3 py-2 text-xs font-medium text-white/55 transition hover:bg-white/[0.05] hover:text-violet-300"
            >
              Explore
            </button>
          </div>

          {/* Loading */}

          {loadingVideos && (
            <VideoGrid
              videos={[]}
              currentUser={user}
              loading
              onProfile={openProfile}
            />
          )}

          {/* Error */}

          {!loadingVideos && videoError && (
            <div
              role="alert"
              className="rounded-2xl border border-red-400/15 px-5 py-10 text-center"
            >
              <p className="text-sm text-white/65">
                {videoError}
              </p>

              <button
                type="button"
                onClick={loadVideos}
                className="mt-3 rounded-full border border-white/10 px-4 py-2 text-xs hover:bg-white/[0.06]"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty State */}

          {!loadingVideos &&
            !videoError &&
            visibleVideos.length === 0 && (
              <div className="rounded-2xl border border-white/[0.08] px-5 py-12 text-center">
                <Video className="mx-auto h-9 w-9 text-white/30" />

                <h3 className="mt-3 text-sm font-semibold text-white/85">
                  {query
                    ? "No matching videos"
                    : "No videos yet"}
                </h3>

                <p className="mt-2 text-xs text-white/45">
                  {query
                    ? "Try a different search."
                    : "Published videos will appear here."}
                </p>
              </div>
            )}

          {/* Backend Videos */}

          {!loadingVideos &&
            !videoError &&
            visibleVideos.length > 0 && (
              <VideoGrid
                videos={visibleVideos}
                currentUser={user}
                onProfile={openProfile}
              />
            )}
        </section>
      </div>

      {/* Moment Viewer */}

      {activeMomentGroup && (
        <MomentViewer
          key={`${getId(activeMomentGroup.owner) || "owner"}-${
            getId(
              activeMomentGroup.moments[
                activeMomentGroup.initialIndex
              ]
            )
          }`}
          moments={activeMomentGroup.moments}
          owner={activeMomentGroup.owner}
          initialIndex={activeMomentGroup.initialIndex}
          onClose={closeMomentViewer}
          onViewed={markAsViewed}
        />
      )}
    </div>
  );
}
