
/**
 * Format video-related values for display.
 * Shared by VideoDetails, VideoCard and VideoRecommendations.
 */

// ==================== Full Number ====================

export function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "0";

  return number.toLocaleString("en-IN");
}

// ==================== Compact View Count ====================

export function formatViews(value) {
  const count = Number(value);

  if (!Number.isFinite(count) || count <= 0) {
    return "0";
  }

  if (count >= 1_000_000) {
    return `${(count / 1_000_000)
      .toFixed(1)
      .replace(/\.0$/, "")}M`;
  }

  if (count >= 1_000) {
    return `${(count / 1_000)
      .toFixed(1)
      .replace(/\.0$/, "")}K`;
  }

  return String(Math.floor(count));
}

// ==================== Video Duration ====================

export function formatDuration(value) {
  const duration = Number(value);

  if (!Number.isFinite(duration) || duration < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(duration);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// ==================== Upload Date ====================

export function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ==================== Clean URL ====================

export function cleanUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

// ==================== Default Export ====================

const videoFormatters = {
  formatNumber,
  formatViews,
  formatDuration,
  formatDate,
  cleanUrl,
};

export default videoFormatters;
