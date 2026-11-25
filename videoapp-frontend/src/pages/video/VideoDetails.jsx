import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import api from "../../lib/axios";

// Components
import VideoPlayer from "../../components/video/VideoPlayer";
import VideoHeader from "../../components/video/VideoHeader";
import VideoActions from "../../components/video/VideoActions";
import VideoDescription from "../../components/video/VideoDescription";
import VideoComments from "../../components/video/VideoComments";
import VideoRecommendations from "../../components/video/VideoRecommendations";

// Hooks
import useVideoDetails from "../../hooks/useVideoDetails";
import useVideoViews from "../../hooks/useVideoViews";
import useVideoLikes from "../../hooks/useVideoLikes";
import useVideoComments from "../../hooks/useVideoComments";

// Services
import { getVideos } from "../../services/video/videoService";
import {
  getPlaylists,
  addVideoToPlaylist,
} from "../../services/video/playlistService";

// Utilities
import { cleanUrl } from "../../utils/videoFormatters";

// ==================== Helpers ====================

function unwrap(response) {
  return response?.data?.data ?? response?.data ?? null;
}

function getId(value) {
  return String(value?._id || value?.id || "");
}

function getOwner(item) {
  return item?.owner && typeof item.owner === "object"
    ? item.owner
    : {};
}

function getList(payload) {
  if (Array.isArray(payload)) return payload;

  const options = [
    payload?.videos,
    payload?.playlists,
    payload?.docs,
    payload?.results,
    payload?.data?.videos,
    payload?.data?.playlists,
    payload?.data?.docs,
  ];

  return options.find(Array.isArray) || [];
}

// ==================== Video Details ====================

export default function VideoDetails() {
  const { videoId } = useParams();
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState(null);

  const [recommendations, setRecommendations] = useState([]);

  const [playlists, setPlaylists] = useState([]);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [savingPlaylistId, setSavingPlaylistId] = useState("");

  const [feedback, setFeedback] = useState("");

  // ==================== Video Details ====================

  const {
    video,
    setVideo,
    loading,
    error,
    refetch,
  } = useVideoDetails(videoId);

  // ==================== Video Views ====================

  const {
    recordView,
    viewError,
  } = useVideoViews(videoId, setVideo);

  // ==================== Video Likes ====================

  const {
    likeCount,
    isLiked,
    likeBusy,
    likeError,
    handleLike,
  } = useVideoLikes(videoId);

  // ==================== Comments and Nested Replies ====================

  const {
    comments,
    commentsLoading,
    commentsError,
    commentText,
    setCommentText,
    commentBusy,
    handleCommentSubmit,
    handleReplySubmit,
    handleCommentLike,
    handleCommentDeleted,
    handleCommentUpdated,
    loadComments,
  } = useVideoComments(videoId, currentUser);

  // ==================== Load Current User ====================

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      try {
        const response = await api.get("/users/current-user");
        const payload = unwrap(response);

        if (active) {
          setCurrentUser(payload?.user || payload || null);
        }
      } catch (err) {
        if (active) {
          setCurrentUser(null);
        }

        console.error(
          "Unable to load current user:",
          err.response?.data?.message || err.message
        );
      }
    }

    loadCurrentUser();

    return () => {
      active = false;
    };
  }, []);

  // ==================== Load Recommendations ====================

  useEffect(() => {
    let active = true;

    async function loadRecommendations() {
      if (!videoId) {
        setRecommendations([]);
        return;
      }

      try {
        const response = await getVideos({
          page: 1,
          limit: 20,
          sortBy: "createdAt",
          sortType: "desc",
        });

        const items = getList(unwrap(response));

        if (!active) return;

        setRecommendations(
          items.filter(
            (item) =>
              getId(item) &&
              getId(item) !== String(videoId) &&
              item.isPublished !== false
          )
        );
      } catch (err) {
        if (active) setRecommendations([]);

        console.error(
          "Unable to load recommendations:",
          err.response?.data?.message || err.message
        );
      }
    }

    loadRecommendations();

    return () => {
      active = false;
    };
  }, [videoId]);

  // ==================== Share Video ====================

  async function handleShare() {
    if (!videoId) return;

    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title: video?.title || "Video",
          url,
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setFeedback("Video link copied.");
      } else {
        setFeedback("Sharing is not supported in this browser.");
        return;
      }

      await api.post(
        `/shares/video/${encodeURIComponent(videoId)}`
      );
    } catch (err) {
      if (err.name === "AbortError") return;

      setFeedback(
        err.response?.data?.message ||
          "Unable to complete sharing."
      );
    }
  }

  // ==================== Playlist Menu ====================

  async function handlePlaylistMenu() {
    if (showPlaylists) {
      setShowPlaylists(false);
      return;
    }

    setShowPlaylists(true);
    setPlaylistsLoading(true);
    setFeedback("");

    try {
      const response = await getPlaylists();
      setPlaylists(getList(unwrap(response)));
    } catch (err) {
      setFeedback(
        err.response?.data?.message ||
          "Unable to load playlists."
      );
    } finally {
      setPlaylistsLoading(false);
    }
  }

  // ==================== Add Video to Playlist ====================

  async function handleSaveVideo(playlistId) {
    if (!playlistId || !videoId || savingPlaylistId) return;

    setSavingPlaylistId(String(playlistId));
    setFeedback("");

    try {
      await addVideoToPlaylist(playlistId, videoId);

      setShowPlaylists(false);
      setFeedback("Video added to playlist.");
    } catch (err) {
      setFeedback(
        err.response?.data?.message ||
          "Unable to save video."
      );
    } finally {
      setSavingPlaylistId("");
    }
  }

  // ==================== Loading State ====================

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900">
        <div className="mx-auto max-w-6xl">
          <div className="aspect-video animate-pulse rounded-2xl bg-gray-200" />
          <div className="mt-5 h-6 w-2/3 animate-pulse rounded bg-gray-200" />
          <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-gray-200" />
        </div>
      </main>
    );
  }

  // ==================== Error State ====================

  if (error || !video) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900">
        <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-6 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-black"
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <h1 className="text-xl font-semibold">
            Video unavailable
          </h1>

          <p className="mt-3 text-sm text-red-600">
            {error || "Unable to load this video."}
          </p>

          <button
            type="button"
            onClick={refetch}
            className="mt-5 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  // ==================== Derived Data ====================

  const videoUrl = cleanUrl(
    video.videoFile || video.videoUrl
  );

  const thumbnail = cleanUrl(
    video.thumbnail ||
      video.thumbnailUrl ||
      video.thumbnailURL
  );

  const owner = getOwner(video);

  const ownerName =
    owner.fullName || owner.username || "Creator";

  const ownerUsername = String(
    owner.username || ""
  ).replace(/^@+/, "");

  const currentUserId = getId(currentUser);
  const ownerId = getId(owner);

  const ownProfile =
    Boolean(currentUserId && ownerId) &&
    currentUserId === ownerId;

  const sameCreator = recommendations.filter((item) => {
    const itemOwner = getOwner(item);

    return (
      ownerId &&
      getId(itemOwner) === ownerId
    );
  });

  const otherRecommendations = recommendations.filter((item) => {
    const itemOwner = getOwner(item);

    return !(
      ownerId &&
      getId(itemOwner) === ownerId
    );
  });

  // ==================== Creator Profile ====================

  function handleCreatorClick() {
    if (!ownerUsername) return;

    navigate(
      ownProfile
        ? "/profile"
        : `/profile/${encodeURIComponent(ownerUsername)}`
    );
  }

  // ==================== UI ====================

  return (
    <main className="min-h-screen bg-[#f9f9f9] text-[#0f0f0f]">
      <div className="mx-auto w-full max-w-[1800px] px-3 pb-12 pt-4 sm:px-5 lg:px-8">

        {/* Header */}
        <header className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            <ArrowLeft size={17} />
            Back
          </button>

          <span className="text-xs font-medium text-gray-500">
            VideoApp · Watch
          </span>
        </header>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">

          {/* Main Content */}
          <div className="min-w-0">

            {/* Video Player */}
            <VideoPlayer
              src={videoUrl}
              poster={thumbnail}
              onPlay={recordView}
              onError={(event) => {
                console.error(
                  "Video playback failed:",
                  event.currentTarget.error
                );
              }}
            />

            {/* Video Header and Actions */}
            <VideoHeader
              video={video}
              onCreatorClick={handleCreatorClick}
            >
              <VideoActions
                isLiked={isLiked}
                likeCount={likeCount}
                likeBusy={likeBusy}
                onLike={handleLike}
                onShare={handleShare}
                showPlaylists={showPlaylists}
                playlistsLoading={playlistsLoading}
                playlists={playlists}
                savingPlaylistId={savingPlaylistId}
                onTogglePlaylists={handlePlaylistMenu}
                onSaveVideo={handleSaveVideo}
              />
            </VideoHeader>

            {/* Description */}
            <VideoDescription video={video} />

            {/* Feedback and Errors */}
            {(feedback || viewError || likeError) && (
              <div className="mt-3 space-y-1">
                {feedback && (
                  <p role="status" className="text-sm text-violet-700">
                    {feedback}
                  </p>
                )}

                {viewError && (
                  <p role="alert" className="text-sm text-red-600">
                    {viewError}
                  </p>
                )}

                {likeError && (
                  <p role="alert" className="text-sm text-red-600">
                    {likeError}
                  </p>
                )}
              </div>
            )}

            {/* More From This Creator */}
            <VideoRecommendations
              videos={sameCreator}
              title={`More from ${ownerName}`}
              subtitle="More videos from this creator"
              hideWhenEmpty
            />

            {/* Comments, Replies, Edit and Delete */}
            <VideoComments
              comments={comments}
              commentsLoading={commentsLoading}
              commentsError={commentsError}
              currentUser={currentUser}
              commentText={commentText}
              commentBusy={commentBusy}
              onCommentTextChange={setCommentText}
              onSubmitComment={handleCommentSubmit}
              onCancelComment={() => setCommentText("")}
              onRetry={loadComments}
              onReplySubmit={handleReplySubmit}
              onLikeComment={handleCommentLike}
              onCommentDeleted={handleCommentDeleted}
              onCommentUpdated={handleCommentUpdated}
            />
          </div>

          {/* Recommendations */}
          <aside className="min-w-0">
            <VideoRecommendations
              videos={otherRecommendations}
              title="Up next"
              subtitle="Recommended videos"
              compact
              emptyMessage="No other published videos available."
            />
          </aside>
        </div>
      </div>
    </main>
  );
}