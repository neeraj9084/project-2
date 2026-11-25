
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

export default function VideoDescription({ video }) {
  if (!video) return null;

  const description =
    typeof video.description === "string"
      ? video.description.trim()
      : "";

  const uploadDate = formatDate(video.createdAt);

  const hasDuration =
    video.duration !== null &&
    video.duration !== undefined &&
    video.duration !== "";

  return (
    <section
      aria-label="Video description"
      className="mt-4 rounded-xl bg-[#eeeeee] p-4"
    >
      {/* Video metadata */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-gray-700">
        <span>
          {formatNumber(video.views)} views
        </span>

        {uploadDate && (
          <>
            <span aria-hidden="true">·</span>
            <time dateTime={video.createdAt}>
              {uploadDate}
            </time>
          </>
        )}

        {hasDuration && (
          <>
            <span aria-hidden="true">·</span>
            <span>{formatDuration(video.duration)}</span>
          </>
        )}
      </div>

      {/* Video description */}
      {description && (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">
          {description}
        </p>
      )}
    </section>
  );
}