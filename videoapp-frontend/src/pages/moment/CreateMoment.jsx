
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  ArrowLeft,
  Camera,
  ImagePlus,
  Music2,
  Search,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Type,
  Sticker,
  Sparkles,
  AtSign,
  Download,
  MoreHorizontal,
  Send,
  LoaderCircle,
  Check,
} from "lucide-react";
import api from "../../lib/axios.js";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

function extractSongs(response) {
  const payload = response?.data?.data ?? response?.data;

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  return [];
}

function getSongId(song) {
  return String(song?.trackId || song?.id || song?.title || "");
}

export default function CreateMoment() {
  const navigate = useNavigate();

  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const previewUrlRef = useRef("");

  const [media, setMedia] = useState(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [storyText, setStoryText] = useState("");

  const [videoMuted, setVideoMuted] = useState(false);

  const [selectedMusic, setSelectedMusic] = useState(null);
  const [musicSearch, setMusicSearch] = useState("");
  const [songs, setSongs] = useState([]);
  const [musicOpen, setMusicOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [playingId, setPlayingId] = useState("");

  const [textOpen, setTextOpen] = useState(false);
  const [textDraft, setTextDraft] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isVideo = media?.type?.startsWith("video/");

  // Release local media preview URLs.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  // Search songs using your existing JioSaavn backend API.
  useEffect(() => {
    const query = musicSearch.trim();

    if (!musicOpen || query.length < 2) {
      setSongs([]);
      setSearching(false);
      return undefined;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        setError("");

        const response = await api.get("/music/search", {
          params: { q: query },
        });

        if (!cancelled) {
          setSongs(extractSongs(response));
        }
      } catch (err) {
        if (!cancelled) {
          setSongs([]);
          setError(
            err.response?.data?.message ||
              "Music search failed. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [musicSearch, musicOpen]);

  const stopMusicPreview = () => {
    const audio = audioRef.current;

    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    setPlayingId("");
  };

  const handleMediaChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Please select a supported photo or video.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("File size must be less than 100 MB.");
      return;
    }

    stopMusicPreview();

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const url = URL.createObjectURL(file);

    previewUrlRef.current = url;
    setMediaUrl(url);
    setMedia(file);
    setVideoMuted(false);
    setError("");
  };

  const handleRemoveMedia = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    previewUrlRef.current = "";

    setMedia(null);
    setMediaUrl("");
    setSelectedMusic(null);
    setCaption("");
    setStoryText("");
    setVideoMuted(false);
    setError("");

    stopMusicPreview();
  };

  const openMusic = () => {
    if (!media) {
      setError("Pehle photo ya video select karo.");
      return;
    }

    setError("");
    setMusicOpen(true);
    setTextOpen(false);
  };

  const handleToggleSongPreview = async (song) => {
    const audio = audioRef.current;
    const id = getSongId(song);
    const previewUrl = song?.previewUrl;

    if (!audio) return;

    if (playingId === id && !audio.paused) {
      audio.pause();
      setPlayingId("");
      return;
    }

    if (
      typeof previewUrl !== "string" ||
      !/^https?:\/\//i.test(previewUrl)
    ) {
      setError(
        "Is song ka playable preview URL available nahi hai. Doosra song try karo."
      );
      return;
    }

    try {
      audio.pause();
      audio.src = previewUrl;
      audio.load();
      audio.currentTime = 0;

      await audio.play();

      setPlayingId(id);
      setError("");
    } catch {
      setPlayingId("");

      setError(
        "Song preview play nahi hua. API ka preview URL unavailable, expired ya unsupported ho sakta hai."
      );
    }
  };

  const handleSelectSong = (song) => {
    if (!media) {
      setError("Pehle photo ya video select karo.");
      setMusicOpen(false);
      return;
    }

    stopMusicPreview();
    setSelectedMusic(song);
    setMusicOpen(false);
    setError("");
  };

  const handleRemoveSong = () => {
    stopMusicPreview();
    setSelectedMusic(null);
    setError("");
  };

  const handleAddText = () => {
    if (!media) {
      setError("Pehle photo ya video select karo.");
      return;
    }

    setTextDraft(storyText);
    setTextOpen(true);
    setMusicOpen(false);
  };

  const handlePublish = async (event) => {
    event.preventDefault();

    if (!media) {
      setError("Pehle photo ya video select karo.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      stopMusicPreview();

      const formData = new FormData();

      formData.append("media", media);
      formData.append(
        "caption",
        [caption.trim(), storyText.trim()].filter(Boolean).join(" ")
      );

      if (selectedMusic) {
        formData.append(
          "music",
          JSON.stringify({
            provider: selectedMusic.provider || "jiosaavn",
            trackId: selectedMusic.trackId || "",
            title: selectedMusic.title || "",
            artist: selectedMusic.artist || "",
            image: selectedMusic.image || "",
            previewUrl: selectedMusic.previewUrl || "",
            officialUrl: selectedMusic.officialUrl || "",
            durationSeconds:
              Number(selectedMusic.durationSeconds) || 0,
            language: selectedMusic.language || "",
            explicit: Boolean(selectedMusic.explicit),
          })
        );
      }

      await api.post("/moments", formData);

      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Moment publish nahi hua. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="Go back"
          >
            <ArrowLeft size={23} />
          </button>

          <h1 className="text-lg font-semibold">Create Moment</h1>

          <button
            type="button"
            onClick={handleRemoveMedia}
            disabled={!media}
            className="rounded-full p-2 text-neutral-300 hover:bg-white/10 disabled:opacity-30"
            aria-label="Remove media"
          >
            <X size={22} />
          </button>
        </header>

        <form
          onSubmit={handlePublish}
          className="flex flex-1 flex-col items-center"
        >
          {/* Story canvas: same 9:16 design on desktop and mobile */}
          <section className="relative my-4 aspect-[9/16] w-[calc(100%-24px)] max-w-[390px] overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl">
            {mediaUrl ? (
              <>
                {isVideo ? (
                  <video
                    ref={videoRef}
                    key={mediaUrl}
                    src={mediaUrl}
                    controls
                    playsInline
                    muted={videoMuted}
                    onVolumeChange={(event) =>
                      setVideoMuted(event.currentTarget.muted)
                    }
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : (
                  <img
                    src={mediaUrl}
                    alt="Moment preview"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                )}

                {/* Top overlay */}
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black/55 to-transparent" />

                <button
                  type="button"
                  onClick={handleRemoveMedia}
                  className="absolute left-3 top-3 z-20 rounded-full bg-black/50 p-2.5 backdrop-blur"
                  aria-label="Remove selected media"
                >
                  <X size={22} />
                </button>

                {/* Selected song chip */}
                {selectedMusic && (
                  <div className="absolute left-14 right-16 top-3 z-20 flex min-w-0 items-center gap-2 rounded-full bg-black/55 px-3 py-2 backdrop-blur">
                    {selectedMusic.image && (
                      <img
                        src={selectedMusic.image}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-md object-cover"
                      />
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">
                        {selectedMusic.title}
                      </p>
                      <p className="truncate text-[10px] text-white/70">
                        {selectedMusic.artist}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleRemoveSong}
                      className="shrink-0 rounded-full p-1 hover:bg-white/15"
                      aria-label="Remove music"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                {/* Story text overlay */}
                {storyText && (
                  <div className="pointer-events-none absolute inset-x-12 top-1/2 z-10 -translate-y-1/2 text-center">
                    <span className="whitespace-pre-wrap break-words rounded-lg bg-black/30 px-2 py-1 text-2xl font-bold drop-shadow-lg">
                      {storyText}
                    </span>
                  </div>
                )}

                {/* Right editing toolbar */}
                <div className="absolute right-2 top-20 z-20 flex flex-col items-end gap-3">
                  <button
                    type="button"
                    onClick={handleAddText}
                    className="flex items-center gap-2"
                  >
                    <span className="text-xs font-semibold drop-shadow-md">
                      Text
                    </span>
                    <span className="rounded-full bg-black/55 p-3 backdrop-blur">
                      <Type size={22} />
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setError("Sticker editor abhi configured nahi hai.");
                    }}
                    className="flex items-center gap-2"
                  >
                    <span className="text-xs font-semibold drop-shadow-md">
                      Stickers
                    </span>
                    <span className="rounded-full bg-black/55 p-3 backdrop-blur">
                      <Sticker size={22} />
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={openMusic}
                    className="flex items-center gap-2"
                  >
                    <span className="text-xs font-semibold drop-shadow-md">
                      Audio
                    </span>
                    <span className="rounded-full bg-black/55 p-3 backdrop-blur">
                      <Music2 size={22} />
                    </span>
                  </button>

                  {isVideo && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextMuted = !videoMuted;
                        setVideoMuted(nextMuted);

                        if (videoRef.current) {
                          videoRef.current.muted = nextMuted;
                        }
                      }}
                      className="flex items-center gap-2"
                      aria-label={
                        videoMuted ? "Unmute video" : "Mute video"
                      }
                    >
                      <span className="text-xs font-semibold drop-shadow-md">
                        {videoMuted ? "Sound off" : "Sound"}
                      </span>
                      <span className="rounded-full bg-black/55 p-3 backdrop-blur">
                        {videoMuted ? (
                          <VolumeX size={22} />
                        ) : (
                          <Volume2 size={22} />
                        )}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setError("Effects editor abhi configured nahi hai.")
                    }
                    className="flex items-center gap-2"
                  >
                    <span className="text-xs font-semibold drop-shadow-md">
                      Effects
                    </span>
                    <span className="rounded-full bg-black/55 p-3 backdrop-blur">
                      <Sparkles size={22} />
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setError("Mention editor abhi configured nahi hai.")
                    }
                    className="flex items-center gap-2"
                  >
                    <span className="text-xs font-semibold drop-shadow-md">
                      Mention
                    </span>
                    <span className="rounded-full bg-black/55 p-3 backdrop-blur">
                      <AtSign size={22} />
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!mediaUrl) return;

                      const link = document.createElement("a");
                      link.href = mediaUrl;
                      link.download = media?.name || "moment-media";
                      link.click();
                    }}
                    className="flex items-center gap-2"
                  >
                    <span className="text-xs font-semibold drop-shadow-md">
                      Download
                    </span>
                    <span className="rounded-full bg-black/55 p-3 backdrop-blur">
                      <Download size={22} />
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setError("More editing options coming soon.")
                    }
                    className="flex items-center gap-2"
                  >
                    <span className="text-xs font-semibold drop-shadow-md">
                      More
                    </span>
                    <span className="rounded-full bg-black/55 p-3 backdrop-blur">
                      <MoreHorizontal size={22} />
                    </span>
                  </button>
                </div>

                {/* Caption overlay */}
                <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-4 pt-16">
                  <textarea
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Add a caption..."
                    className="w-full resize-none bg-transparent text-sm font-medium outline-none placeholder:text-white/85"
                  />
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-6 text-center">
                <ImagePlus size={48} className="text-neutral-300" />

                <div>
                  <h2 className="text-lg font-semibold">
                    Add to Moment
                  </h2>
                  <p className="mt-2 text-sm text-neutral-400">
                    Choose a photo or video from your device.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="rounded-lg bg-violet-600 px-5 py-3 text-sm font-semibold hover:bg-violet-500"
                >
                  Choose media
                </button>
              </div>
            )}
          </section>

          {/* Device picker buttons */}
          <div className="grid w-[calc(100%-24px)] max-w-[390px] grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-neutral-900 px-3 py-3 text-sm font-medium hover:bg-neutral-800"
            >
              <Camera size={19} />
              Camera
            </button>

            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-neutral-900 px-3 py-3 text-sm font-medium hover:bg-neutral-800"
            >
              <ImagePlus size={19} />
              Gallery / Files
            </button>
          </div>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            onChange={handleMediaChange}
            className="hidden"
          />

          <input
            ref={galleryRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            onChange={handleMediaChange}
            className="hidden"
          />

          {/* Music preview audio element */}
          <audio
            ref={audioRef}
            preload="none"
            onEnded={() => setPlayingId("")}
            onPause={() => setPlayingId("")}
            onError={() => {
              setPlayingId("");
            }}
          />

          {/* Music search modal */}
          {musicOpen && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4">
              <section className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-neutral-950 sm:rounded-2xl">
                <header className="flex items-center justify-between border-b border-white/10 p-4">
                  <div>
                    <h2 className="font-semibold">Add music</h2>
                    <p className="mt-1 text-xs text-neutral-400">
                      Search songs from JioSaavn
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setMusicOpen(false);
                      stopMusicPreview();
                    }}
                    className="rounded-full p-2 hover:bg-white/10"
                    aria-label="Close music search"
                  >
                    <X size={22} />
                  </button>
                </header>

                <div className="border-b border-white/10 p-3">
                  <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black px-3">
                    <Search size={19} className="text-neutral-400" />

                    <input
                      autoFocus
                      value={musicSearch}
                      onChange={(event) =>
                        setMusicSearch(event.target.value)
                      }
                      maxLength={100}
                      placeholder="Search song or singer..."
                      className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-neutral-500"
                    />

                    {musicSearch && (
                      <button
                        type="button"
                        onClick={() => setMusicSearch("")}
                        aria-label="Clear search"
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {searching && (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-400">
                      <LoaderCircle size={18} className="animate-spin" />
                      Searching songs...
                    </div>
                  )}

                  {!searching &&
                    musicSearch.trim().length >= 2 &&
                    songs.length === 0 && (
                      <p className="py-8 text-center text-sm text-neutral-400">
                        No songs found.
                      </p>
                    )}

                  {musicSearch.trim().length < 2 && (
                    <p className="py-8 text-center text-sm text-neutral-400">
                      Enter at least 2 characters to search.
                    </p>
                  )}

                  {songs.map((song, index) => {
                    const id = getSongId(song);
                    const selected = getSongId(selectedMusic) === id;
                    const playing = playingId === id;

                    return (
                      <div
                        key={id || index}
                        className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5"
                      >
                        {song.image ? (
                          <img
                            src={song.image}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10">
                            <Music2 size={20} />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {song.title}
                          </p>
                          <p className="truncate text-xs text-neutral-400">
                            {song.artist}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleSongPreview(song)}
                          className="rounded-full p-2 hover:bg-white/10"
                          aria-label={playing ? "Pause preview" : "Play preview"}
                        >
                          {playing ? (
                            <Pause size={20} />
                          ) : (
                            <Play size={20} />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectSong(song)}
                          className="rounded-full bg-violet-600 p-2 hover:bg-violet-500"
                          aria-label="Select song"
                        >
                          {selected ? (
                            <Check size={20} />
                          ) : (
                            <Music2 size={20} />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {selectedMusic && (
                  <footer className="flex items-center gap-3 border-t border-white/10 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-neutral-400">
                        Selected song
                      </p>
                      <p className="truncate text-sm font-medium">
                        {selectedMusic.title}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        handleRemoveSong();
                      }}
                      className="rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-white/10"
                    >
                      Remove
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMusicOpen(false);
                        stopMusicPreview();
                      }}
                      className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500"
                    >
                      Done
                    </button>
                  </footer>
                )}
              </section>
            </div>
          )}

          {/* Text editor */}
          {textOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
              <section className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-4">
                <header className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold">Add story text</h2>

                  <button
                    type="button"
                    onClick={() => setTextOpen(false)}
                    aria-label="Close text editor"
                  >
                    <X size={22} />
                  </button>
                </header>

                <textarea
                  autoFocus
                  value={textDraft}
                  onChange={(event) => setTextDraft(event.target.value)}
                  maxLength={150}
                  rows={3}
                  placeholder="Type something..."
                  className="w-full rounded-xl border border-white/15 bg-black p-3 outline-none focus:border-violet-500"
                />

                <button
                  type="button"
                  onClick={() => {
                    setStoryText(textDraft.trim());
                    setTextOpen(false);
                  }}
                  className="mt-3 w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500"
                >
                  Done
                </button>
              </section>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div
              role="alert"
              className="mx-3 my-3 w-[calc(100%-24px)] max-w-[390px] rounded-xl border border-red-500/30 bg-red-950/50 p-3 text-sm text-red-300"
            >
              {error}
            </div>
          )}

          {/* Share button */}
          <footer className="sticky bottom-0 mt-auto w-full border-t border-white/10 bg-black/95 p-3 backdrop-blur">
            <div className="mx-auto max-w-[390px]">
              <button
                type="submit"
                disabled={!media || loading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 py-3.5 font-semibold transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <LoaderCircle size={20} className="animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Send size={19} />
                    Share Moment
                  </>
                )}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </main>
  );
}
