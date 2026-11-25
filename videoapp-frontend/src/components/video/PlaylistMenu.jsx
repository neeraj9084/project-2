
import { useId } from "react";
import { Bookmark, Check, LoaderCircle } from "lucide-react";

// ==================== Helpers ====================

function getId(value) {
  return value?._id || value?.id || "";
}

// ==================== Playlist Menu ====================

export default function PlaylistMenu({
  isOpen = false,
  playlists = [],
  loading = false,
  savingPlaylistId = "",
  onToggle,
  onSelect,
}) {
  const menuId = useId();

  const safePlaylists = Array.isArray(playlists)
    ? playlists
    : [];

  return (
    <div className="relative">
      {/* Save Button */}
      <button
        type="button"
        aria-label="Save video to playlist"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={onToggle}
        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition ${
          isOpen
            ? "bg-violet-100 text-violet-700"
            : "bg-gray-100 text-gray-800 hover:bg-gray-200"
        }`}
      >
        <Bookmark size={17} />
        Save
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="Save to playlist"
          className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white p-2 shadow-xl"
        >
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Save to playlist
          </p>

          {/* Loading State */}
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500">
              <LoaderCircle
                size={16}
                className="animate-spin"
              />
              Loading playlists...
            </div>
          ) : safePlaylists.length > 0 ? (
            <div className="max-h-64 overflow-y-auto">
              {safePlaylists.map((playlist) => {
                const playlistId = getId(playlist);
                const isSaving =
                  String(savingPlaylistId) ===
                  String(playlistId) &&
                  Boolean(savingPlaylistId);

                return (
                  <button
                    key={playlistId || playlist.name}
                    type="button"
                    role="menuitem"
                    disabled={!playlistId || isSaving}
                    onClick={() => onSelect?.(playlistId)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-gray-800 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0 truncate">
                      {playlist.name || "Untitled playlist"}
                    </span>

                    {isSaving ? (
                      <LoaderCircle
                        size={16}
                        className="shrink-0 animate-spin"
                      />
                    ) : (
                      <Check
                        size={16}
                        className="shrink-0 text-transparent"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="px-3 py-4 text-sm text-gray-500">
              No playlists found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
