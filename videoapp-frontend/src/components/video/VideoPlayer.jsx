import { useState } from "react";
import { AlertCircle, Play } from "lucide-react";

export default function VideoPlayer({
  src,
  poster,
  onPlay,
  onError,
  className = "",
}) {
  const [hasError, setHasError] = useState(false);

  const videoUrl = typeof src === "string" ? src.trim() : "";
  const posterUrl = typeof poster === "string" ? poster.trim() : "";

  const handleError = (event) => {
    setHasError(true);
    onError?.(event);
  };

  if (!videoUrl || hasError) {
    return (
      <div
        className={`flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl bg-black text-white ${className}`}
        role="status"
      >
        <AlertCircle size={32} className="text-gray-400" />

        <p className="text-sm text-gray-300">
          {videoUrl ? "Unable to play this video." : "Video URL unavailable."}
        </p>

        {videoUrl && (
          <button
            type="button"
            onClick={() => setHasError(false)}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-200"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-xl bg-black ${className}`}
    >
      <video
        key={videoUrl}
        src={videoUrl}
        poster={posterUrl || undefined}
        controls
        playsInline
        preload="metadata"
        onPlay={onPlay}
        onError={handleError}
        className="block h-full w-full bg-black object-contain"
      >
        Your browser does not support video playback.
      </video>
    </div>
  );
}