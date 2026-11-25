
import api from "../../lib/axios";

// ==================== Helpers ====================

function validateId(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }

  return encodeURIComponent(value.trim());
}

// ==================== Get Playlists ====================

export function getPlaylists() {
  return api.get("/playlists");
}

// ==================== Get Playlist By ID ====================

export function getPlaylistById(playlistId) {
  const id = validateId(playlistId, "Playlist ID");

  return api.get(`/playlists/${id}`);
}

// ==================== Create Playlist ====================

export function createPlaylist({
  name,
  description = "",
  isPublic = false,
} = {}) {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Playlist name is required.");
  }

  return api.post("/playlists", {
    name: name.trim(),
    description:
      typeof description === "string"
        ? description.trim()
        : "",
    isPublic: Boolean(isPublic),
  });
}

// ==================== Add Video To Playlist ====================

export function addVideoToPlaylist(playlistId, videoId) {
  const playlist = validateId(playlistId, "Playlist ID");
  const video = validateId(videoId, "Video ID");

  return api.post(`/playlists/${playlist}/videos/${video}`);
}

// ==================== Default Export ====================

const playlistService = {
  getPlaylists,
  getPlaylistById,
  createPlaylist,
  addVideoToPlaylist,
};

export default playlistService;
