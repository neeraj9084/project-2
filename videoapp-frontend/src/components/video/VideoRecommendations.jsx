import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";

// ==================== Helpers ====================

function getId(video) {
  return video?._id || video?.id || "";
}

function getOwner(video) {
  return video?.owner && typeof video.owner === "object"
    ? video.owner
    : {};
}

function formatNumber(value) {
  return (Number(value) || 0).toLocaleString("en-IN");
}

function formatDuration(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      remaining
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getImageUrl(value) {
  if (typeof value !== "string") return "";

  return value.trim();
}

// ==================== Recommendation Card ====================

function RecommendationCard({ video, compact, onSelect }) {
  const owner = getOwner(video);

  const thumbnail = getImageUrl(
    video.thumbnail ||
      video.thumbnailUrl ||
      video.thumbnailURL
  );

  const creatorName =
    owner.fullName || owner.username || "Creator";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group min-w-0 text-left ${
        compact ? "flex gap-3" : "block w-full"
      }`}
    >
      {/* Thumbnail */}
      <div
        className={`relative overflow-hidden rounded-xl bg-gray-200 ${
          compact
            ? "aspect-video w-[43%] shrink-0"
            : "aspect-video w-full"
        }`}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={video.title || "Video thumbnail"}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            <Play size={22} />
          </div>
        )}

        {/* Video Duration */}
        {video.duration != null && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/85 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>

      {/* Video Details */}
      <div
        className={
          compact ? "min-w-0 flex-1 py-0.5" : "mt-2"
        }
      >
        <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-gray-900 transition group-hover:text-violet-700">
          {video.title || "Untitled video"}
        </h3>

        <p className="mt-1.5 truncate text-xs text-gray-500">
          {creatorName}
        </p>

        <p className="mt-1 text-xs text-gray-500">
          {formatNumber(video.views)} views
          {video.createdAt && ` · ${formatDate(video.createdAt)}`}
        </p>
      </div>
    </button>
  );
}

// ==================== Video Recommendations ====================

export default function VideoRecommendations({
  videos = [],
  title = "Up next",
  subtitle = "Recommended videos",
  compact = false,
  emptyMessage = "No published videos available.",
  hideWhenEmpty = false,
}) {
  const navigate = useNavigate();

  const safeVideos = Array.isArray(videos)
    ? videos.filter(
        (video) =>
          getId(video) && video.isPublished !== false
      )
    : [];

  if (hideWhenEmpty && safeVideos.length === 0) {
    return null;
  }

  return (
    <section className={compact ? "" : "mt-9"}>
      {/* Section Heading */}
      {compact ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">{title}</h2>

          {subtitle && (
            <span className="text-xs text-gray-500">
              {subtitle}
            </span>
          )}
        </div>
      ) : (
        <div className="mb-4">
          <h2 className="text-lg font-bold">{title}</h2>

          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">
              {subtitle}
            </p>
          )}
        </div>
      )}

      {/* Recommendation List */}
      {safeVideos.length > 0 ? (
        <div
          className={
            compact
              ? "space-y-4"
              : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {safeVideos.map((video) => (
            <RecommendationCard
              key={getId(video)}
              video={video}
              compact={compact}
              onSelect={() =>
                navigate(`/video/${encodeURIComponent(getId(video))}`)
              }
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}