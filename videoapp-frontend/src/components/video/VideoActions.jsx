import { Heart, Send } from "lucide-react";

import PlaylistMenu from "./PlaylistMenu";

// ==================== Action Button ====================

function ActionButton({
  children,
  label,
  active = false,
  toggle = false,
  disabled = false,
  onClick,
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={toggle ? active : undefined}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition ${
        active
          ? "bg-violet-100 text-violet-700"
          : "bg-gray-100 text-gray-800 hover:bg-gray-200"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

// ==================== Video Actions ====================

export default function VideoActions({
  isLiked = false,
  likeCount = 0,
  likeBusy = false,
  onLike,
  onShare,

  showPlaylists = false,
  playlistsLoading = false,
  playlists = [],
  savingPlaylistId = "",

  onTogglePlaylists,
  onSaveVideo,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Like */}
      <ActionButton
        label={isLiked ? "Unlike video" : "Like video"}
        active={isLiked}
        toggle
        disabled={likeBusy}
        onClick={onLike}
      >
        <Heart
          size={18}
          fill={isLiked ? "currentColor" : "none"}
        />

        <span>
          {Number(likeCount || 0).toLocaleString("en-IN")}
        </span>
      </ActionButton>

      {/* Share */}
      <ActionButton
        label="Share video"
        onClick={onShare}
      >
        <Send size={17} />
        Share
      </ActionButton>

      {/* Save to Playlist */}
      <PlaylistMenu
        isOpen={showPlaylists}
        playlists={playlists}
        loading={playlistsLoading}
        savingPlaylistId={savingPlaylistId}
        onToggle={onTogglePlaylists}
        onSelect={onSaveVideo}
      />
    </div>
  );
}