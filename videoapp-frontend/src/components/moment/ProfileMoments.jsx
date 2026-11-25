import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye,
  Image as ImageIcon,
  LoaderCircle,
  Trash2,
  Video,
  X,
} from "lucide-react";

import { useMoments } from "../../hooks/useMoments";
import {
  deleteMoment,
  getMomentViewers,
} from "../../services/moment/momentApi";
import MomentViewer from "./MomentViewer";

function getId(item) {
  return String(item?._id || item?.id || "");
}

function getPayloadItems(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

export default function ProfileMoments({
  user,
  isOwnProfile = false,
  viewerId = "",
}) {
  const navigate = useNavigate();
  const userId = getId(user);

  const {
    moments,
    loading,
    error,
    refresh,
    markAsViewed,
    removeMomentLocally,
  } = useMoments({
    mode: isOwnProfile ? "mine" : "user",
    userId,
    viewerId,
  });

  const [selectedIndex, setSelectedIndex] = useState(null);
  const [viewersState, setViewersState] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const closeViewer = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  const openViewers = async (moment) => {
    setActionError("");

    setViewersState({
      moment,
      viewers: [],
      loading: true,
      error: "",
    });

    try {
      const response = await getMomentViewers(moment._id, {
        page: 1,
        limit: 100,
      });

      setViewersState({
        moment,
        viewers: getPayloadItems(response, "viewers"),
        loading: false,
        error: "",
      });
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        "Unable to load Moment viewers.";

      setViewersState({
        moment,
        viewers: [],
        loading: false,
        error: message,
      });
    }
  };

  const handleDelete = async (moment) => {
    const confirmed = window.confirm(
      "Delete this Moment? This cannot be undone."
    );

    if (!confirmed) return;

    setDeletingId(getId(moment));
    setActionError("");
    setActionMessage("");

    try {
      await deleteMoment(moment._id);

      removeMomentLocally(moment._id);
      setActionMessage("Moment deleted successfully.");

      setViewersState((previous) =>
        previous?.moment?._id === moment._id ? null : previous
      );

      setSelectedIndex(null);
    } catch (err) {
      setActionError(
        err?.response?.data?.message ||
          "Unable to delete Moment. Please try again."
      );
    } finally {
      setDeletingId("");
    }
  };

  return (
    <section className="text-white" aria-label="Profile Moments">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Moments</h2>
          <p className="mt-1 text-xs text-white/45">
            Active image and video Moments
          </p>
        </div>

        {isOwnProfile && (
          <button
            type="button"
            onClick={() => navigate("/moments/create")}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500"
          >
            + Add Moment
          </button>
        )}
      </div>

      {actionMessage && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
        >
          {actionMessage}
        </p>
      )}

      {actionError && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {actionError}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoaderCircle className="h-7 w-7 animate-spin text-violet-400" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-white/10 p-6 text-center">
          <p className="text-sm text-red-300">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-3 text-sm text-violet-300 hover:text-violet-200"
          >
            Try again
          </button>
        </div>
      ) : moments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-5 py-14 text-center">
          <ImageIcon className="mx-auto h-10 w-10 text-white/30" />
          <h3 className="mt-4 font-semibold">No active Moments</h3>
          <p className="mt-2 text-sm text-white/45">
            Moments appear here until they expire after 24 hours.
          </p>

          {isOwnProfile && (
            <button
              type="button"
              onClick={() => navigate("/moments/create")}
              className="mt-4 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium hover:bg-violet-500"
            >
              Create your first Moment
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {moments.map((moment, index) => (
            <article
              key={moment._id}
              className="overflow-hidden rounded-xl border border-white/10 bg-[#111218]"
            >
              <button
                type="button"
                onClick={() => setSelectedIndex(index)}
                className="group relative block aspect-[3/4] w-full overflow-hidden bg-black text-left"
                aria-label={`Open Moment ${index + 1}`}
              >
                {moment.mediaType === "video" ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#191922]">
                    <Video className="h-8 w-8 text-violet-300" />
                    <span className="text-xs text-white/60">
                      Video Moment
                    </span>
                  </div>
                ) : (
                  <img
                    src={moment.mediaUrl}
                    alt={moment.caption || "Moment"}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                )}

                {moment.caption && (
                  <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-8 text-xs text-white">
                    {moment.caption}
                  </span>
                )}
              </button>

              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <span className="inline-flex items-center gap-1 text-xs text-white/55">
                  <Eye size={14} />
                  {Number(moment.views) || 0}
                </span>

                {isOwnProfile && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="View viewers"
                      aria-label="View Moment viewers"
                      onClick={() => openViewers(moment)}
                      className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
                    >
                      <Eye size={16} />
                    </button>

                    <button
                      type="button"
                      title="Delete Moment"
                      aria-label="Delete Moment"
                      disabled={deletingId === getId(moment)}
                      onClick={() => handleDelete(moment)}
                      className="rounded-lg p-2 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {deletingId === getId(moment) ? (
                        <LoaderCircle size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedIndex !== null && moments[selectedIndex] && (
        <MomentViewer
          key={`${userId}-${moments[selectedIndex]._id}`}
          moments={moments}
          owner={user}
          initialIndex={selectedIndex}
          onClose={closeViewer}
          onViewed={markAsViewed}
        />
      )}

      {/* Viewers dialog */}
      {viewersState && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 p-4"
          onClick={() => setViewersState(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Moment viewers"
            className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#111218]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
              <div>
                <h3 className="font-semibold">Moment viewers</h3>
                <p className="mt-1 text-xs text-white/45">
                  {viewersState.moment.caption || "Your Moment"}
                </p>
              </div>

              <button
                type="button"
                aria-label="Close viewers"
                onClick={() => setViewersState(null)}
                className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </header>

            <div className="max-h-[60vh] overflow-y-auto p-4">
              {viewersState.loading ? (
                <div className="flex justify-center py-8">
                  <LoaderCircle className="animate-spin text-violet-400" />
                </div>
              ) : viewersState.error ? (
                <p className="text-sm text-red-300">
                  {viewersState.error}
                </p>
              ) : viewersState.viewers.length === 0 ? (
                <p className="py-8 text-center text-sm text-white/45">
                  No viewers yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {viewersState.viewers.map((item) => {
                    const viewer = item.viewer || {};

                    return (
                      <div
                        key={item._id}
                        className="flex items-center gap-3"
                      >
                        <div className="h-10 w-10 overflow-hidden rounded-full bg-white/10">
                          {viewer.avatar ? (
                            <img
                              src={viewer.avatar}
                              alt={viewer.fullName || viewer.username || "Viewer"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-white/50">
                              {String(
                                viewer.fullName || viewer.username || "U"
                              )
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {viewer.fullName || viewer.username || "User"}
                          </p>
                          <p className="truncate text-xs text-white/45">
                            {viewer.username
                              ? `@${viewer.username.replace(/^@+/, "")}`
                              : ""}
                          </p>
                        </div>

                        <span className="text-xs text-white/40">
                          {item.viewedAt
                            ? new Date(item.viewedAt).toLocaleTimeString(
                                "en-IN",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )
                            : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}