
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  UserRound,
  X,
  Music2,
  Play,
  Pause,
  Volume2,
  VolumeX,
} from "lucide-react";

import {
  getMomentById,
  viewMoment,
} from "../../services/moment/momentApi";

const MOMENT_DURATION_MS = 15000;

function getId(value) {
  return String(value?._id || value?.id || "");
}

function getName(user) {
  return user?.fullName || user?.username || "User";
}

function getAvatar(user) {
  return user?.avatar || user?.avatarUrl || "";
}

function formatTime(date) {
  if (!date) return "";

  const timestamp = new Date(date).getTime();

  if (!Number.isFinite(timestamp)) return "";

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60000)
  );

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

export default function MomentViewer({
  moments = [],
  owner,
  initialIndex = 0,
  onClose,
  onViewed,
}) {
  const [index, setIndex] = useState(() =>
    Math.min(
      Math.max(initialIndex, 0),
      Math.max(moments.length - 1, 0)
    )
  );

  const [progress, setProgress] = useState(0);
  const [serverMoment, setServerMoment] = useState(null);

  const [videoMuted, setVideoMuted] = useState(true);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicError, setMusicError] = useState("");

  const videoRef = useRef(null);
  const audioRef = useRef(null);

  const currentMoment = moments[index] || null;
  const momentId = getId(currentMoment);

  const activeMoment =
    serverMoment && getId(serverMoment) === momentId
      ? { ...currentMoment, ...serverMoment }
      : currentMoment;

  const currentOwner =
    activeMoment?.owner &&
    typeof activeMoment.owner === "object"
      ? activeMoment.owner
      : owner || {};

  // Your Moment schema stores selected track details in music.
  const music = activeMoment?.music || null;
  const musicUrl =
    typeof music?.previewUrl === "string"
      ? music.previewUrl.trim()
      : "";

  const hasMusic =
    Boolean(musicUrl) && /^https?:\/\//i.test(musicUrl);

  const goNext = useCallback(() => {
    if (index < moments.length - 1) {
      setIndex((previous) => previous + 1);
    } else {
      onClose?.();
    }
  }, [index, moments.length, onClose]);

  const goPrevious = useCallback(() => {
    setIndex((previous) => Math.max(0, previous - 1));
  }, []);

  const stopMusic = useCallback(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    setMusicPlaying(false);
  }, []);

  // Load the latest Moment and record its view.
  useEffect(() => {
    if (!momentId) return undefined;

    let cancelled = false;

    setServerMoment(null);

    setVideoMuted(true);
    setMusicPlaying(false);
    setMusicError("");
    setProgress(0);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }

    onViewed?.(momentId);

    getMomentById(momentId)
      .then((moment) => {
        if (!cancelled) {
          setServerMoment(moment);
        }
      })
      .catch((error) => {
        console.error("Unable to fetch Moment details:", error);
      });

    viewMoment(momentId).catch((error) => {
      console.error("Unable to record Moment view:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [momentId, onViewed]);

  // Keep the audio source synchronized with the selected Moment.
  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return undefined;

    audio.pause();
    setMusicPlaying(false);
    setMusicError("");

    if (hasMusic) {
      audio.src = musicUrl;
      audio.load();
    } else {
      audio.removeAttribute("src");
      audio.load();
    }

    return () => {
      audio.pause();
    };
  }, [momentId, musicUrl, hasMusic]);

  // Advance the story automatically.
  useEffect(() => {
    if (!currentMoment) return undefined;

    const startedAt = Date.now();

    const intervalId = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;

      setProgress(
        Math.min((elapsed / MOMENT_DURATION_MS) * 100, 100)
      );
    }, 50);

    const timeoutId = window.setTimeout(
      goNext,
      MOMENT_DURATION_MS
    );

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [currentMoment, goNext]);

  // Keyboard navigation.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrevious();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, goNext, goPrevious]);

  const toggleMusic = async () => {
    const audio = audioRef.current;

    if (!audio || !hasMusic) {
      setMusicError(
        "Is Moment ke liye playable music preview available nahi hai."
      );
      return;
    }

    if (!audio.paused) {
      audio.pause();
      setMusicPlaying(false);
      return;
    }

    try {
      setMusicError("");

      await audio.play();

      setMusicPlaying(true);
    } catch (error) {
      console.error("Moment music playback failed:", error);

      setMusicPlaying(false);
      setMusicError(
        "Song play nahi hua. Preview URL unavailable, expired ya unsupported ho sakta hai."
      );
    }
  };

  const toggleVideoSound = () => {
    const video = videoRef.current;

    if (!video) return;

    const nextMuted = !videoMuted;

    video.muted = nextMuted;
    setVideoMuted(nextMuted);
  };

  if (!activeMoment) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Moment viewer"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close Moment"
        onClick={onClose}
        className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-6 sm:top-6"
      >
        <X size={21} />
      </button>

      <div
        className="relative flex h-[min(88dvh,760px)] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101117]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Story progress */}
        <div className="absolute left-3 right-3 top-3 z-30 flex gap-1">
          {moments.map((moment, itemIndex) => (
            <span
              key={getId(moment) || itemIndex}
              className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
            >
              <span
                className="block h-full bg-white transition-[width] duration-75"
                style={{
                  width:
                    itemIndex < index
                      ? "100%"
                      : itemIndex === index
                        ? `${progress}%`
                        : "0%",
                }}
              />
            </span>
          ))}
        </div>

        {/* Owner details */}
        <div className="absolute left-3 right-3 top-7 z-30 flex items-center gap-2">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white/10">
            {getAvatar(currentOwner) ? (
              <img
                src={getAvatar(currentOwner)}
                alt={getName(currentOwner)}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-white/70">
                <UserRound size={18} />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">
              {getName(currentOwner)}
            </p>
            <p className="text-[10px] text-white/65">
              {formatTime(activeMoment.createdAt)}
            </p>
          </div>
        </div>

        {/* Media */}
        {activeMoment.mediaType === "video" ? (
          <video
            ref={videoRef}
            key={momentId}
            src={activeMoment.mediaUrl}
            autoPlay
            muted={videoMuted}
            playsInline
            onVolumeChange={(event) => {
              setVideoMuted(event.currentTarget.muted);
            }}
            className="h-full w-full bg-black object-contain"
          />
        ) : (
          <img
            key={momentId}
            src={activeMoment.mediaUrl}
            alt={activeMoment.caption || "Moment"}
            className="h-full w-full bg-black object-contain"
          />
        )}

        {/* Selected music label */}
        {music?.title && (
          <div className="absolute left-3 right-14 top-16 z-20 flex items-center gap-2 rounded-xl bg-black/60 p-2 backdrop-blur">
            {music.image ? (
              <img
                src={music.image}
                alt=""
                className="h-9 w-9 shrink-0 rounded-md object-cover"
              />
            ) : (
              <Music2 size={20} className="shrink-0" />
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">
                {music.title}
              </p>
              <p className="truncate text-[10px] text-white/70">
                {music.artist || "Unknown artist"}
              </p>
            </div>
          </div>
        )}

        {/* Audio and video sound controls */}
        <div className="absolute right-3 top-28 z-30 flex flex-col gap-2">
          {activeMoment.mediaType === "video" && (
            <button
              type="button"
              onClick={toggleVideoSound}
              aria-label={
                videoMuted ? "Turn video sound on" : "Mute video sound"
              }
              title={videoMuted ? "Video sound on" : "Mute video"}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur hover:bg-black/85"
            >
              {videoMuted ? (
                <VolumeX size={20} />
              ) : (
                <Volume2 size={20} />
              )}
            </button>
          )}

          {music?.title && (
            <button
              type="button"
              onClick={toggleMusic}
              disabled={!hasMusic}
              aria-label={musicPlaying ? "Pause song" : "Play song"}
              title={hasMusic ? "Play or pause song" : "Preview unavailable"}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {musicPlaying ? (
                <Pause size={20} />
              ) : (
                <Play size={20} />
              )}
            </button>
          )}
        </div>

        {/* Actual selected-song audio */}
       <audio
  ref={audioRef}
  preload="none"
  onPlay={() => setMusicPlaying(true)}
  onPause={() => setMusicPlaying(false)}
  onEnded={() => setMusicPlaying(false)}
 onError={(event) => {
    const audio = event.currentTarget;

    console.error("Music playback failed:", {
        src: audio.currentSrc,
        code: audio.error?.code,
        message: audio.error?.message,
        networkState: audio.networkState,
        readyState: audio.readyState,
    });

    setMusicPlaying(false);
    setMusicError(
        "Music preview unavailable. Please try another track later."
    );
}}

/>
        {/* Caption */}
        {activeMoment.caption && (
          <p className="absolute bottom-0 z-10 w-full bg-gradient-to-t from-black/90 to-transparent px-4 pb-5 pt-12 text-sm text-white">
            {activeMoment.caption}
          </p>
        )}

        {musicError && (
          <p
            role="status"
            className="absolute bottom-14 left-3 right-3 z-30 rounded-lg bg-black/85 p-2 text-xs text-red-300"
          >
            {musicError}
          </p>
        )}

        {/* Navigation */}
        <button
          type="button"
          aria-label="Previous Moment"
          disabled={index === 0}
          onClick={() => {
            stopMusic();
            goPrevious();
          }}
          className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/75 disabled:opacity-25"
        >
          <ChevronLeft size={22} />
        </button>

        <button
          type="button"
          aria-label="Next Moment"
          onClick={() => {
            stopMusic();
            goNext();
          }}
          className="absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/75"
        >
          <ChevronRight size={22} />
        </button>
      </div>
    </div>
  );
}
