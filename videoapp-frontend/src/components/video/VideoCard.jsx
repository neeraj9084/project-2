
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock3, UserRound } from "lucide-react";

import {
  formatViews,
  formatDuration,
  formatDate,
  cleanUrl,
} from "../../utils/videoFormatters";

function getId(item) {
  return item?._id || item?.id || "";
}

function getOwner(video) {
  if (video?.owner && typeof video.owner === "object") {
    return video.owner;
  }

  if (video?.user && typeof video.user === "object") {
    return video.user;
  }

  return {};
}

export default function VideoCard({ video, onProfile }) {
  const navigate = useNavigate();

  const [avatarError, setAvatarError] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);

  if (!video) return null;

  const videoId = getId(video);
  const owner = getOwner(video);
  const ownerId = getId(owner);

  const name = owner.fullName || owner.username || "Creator";
  const username = String(owner.username || "").replace(/^@+/, "");

  const avatar = cleanUrl(owner.avatar || owner.avatarUrl);

  const thumbnail = cleanUrl(
    video.thumbnail ||
      video.thumbnailUrl ||
      video.thumbnailURL
  );

  const createdDate = formatDate(video.createdAt);

  const openVideo = () => {
    if (!videoId) return;

    navigate(`/video/${encodeURIComponent(videoId)}`);
  };

  const openProfile = () => {
    if (!ownerId) {
      console.error("Creator ID missing:", {
        videoId,
        owner,
        video,
      });
      return;
    }

    if (typeof onProfile === "function") {
      onProfile(ownerId);
      return;
    }

    navigate(`/profile/${encodeURIComponent(ownerId)}`);
  };

  return (
    <article className="group min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101117] transition-colors hover:border-white/[0.16]">
      {/* Creator Information */}
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={openProfile}
          aria-label={`Open ${name}'s profile`}
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#252630] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          {avatar && !avatarError ? (
            <img
              src={avatar}
              alt={name}
              loading="lazy"
              onError={() => setAvatarError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <UserRound
              size={19}
              className="text-gray-400"
            />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={openProfile}
            className="block max-w-full truncate text-left text-sm font-semibold text-white hover:text-violet-300"
          >
            {name}
          </button>

          <p className="mt-1 truncate text-xs text-gray-400">
            {username || "Creator"}
            {createdDate && ` · ${createdDate}`}
          </p>
        </div>
      </div>

      {/* Video Thumbnail */}
      <button
        type="button"
        onClick={openVideo}
        disabled={!videoId}
        aria-label={`Watch ${video.title || "video"}`}
        className="relative block aspect-video w-full overflow-hidden bg-[#08090d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400 disabled:cursor-not-allowed"
      >
        {thumbnail && !thumbnailError ? (
          <img
            src={thumbnail}
            alt={video.title || "Video thumbnail"}
            loading="lazy"
            onError={() => setThumbnailError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm text-gray-500">
            No thumbnail available
          </span>
        )}

        {video.duration != null && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/85 px-2 py-1 text-xs font-semibold text-white">
            {formatDuration(video.duration)}
          </span>
        )}
      </button>

      {/* Video Details */}
      <div className="p-3">
        <p className="flex items-center gap-1 text-xs font-medium text-gray-400">
          <Clock3 size={13} />
          <span>{formatViews(video.views)} views</span>
        </p>

        <button
          type="button"
          onClick={openVideo}
          disabled={!videoId}
          className="mt-2 block w-full break-words text-left text-sm font-semibold leading-5 text-white transition-colors hover:text-violet-300 disabled:cursor-default"
        >
          {video.title || "Untitled video"}
        </button>

        {video.description && (
          <p className="mt-1 line-clamp-2 break-words text-sm leading-5 text-gray-400">
            {video.description}
          </p>
        )}
      </div>
    </article>
  );
}
