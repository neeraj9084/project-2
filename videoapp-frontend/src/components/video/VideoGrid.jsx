import VideoCard from "./VideoCard";

export default function VideoGrid({
  videos = [],
  currentUser = null,
  onProfile,
  loading = false,
}) {
  const safeVideos = Array.isArray(videos)
    ? videos.filter(Boolean)
    : [];

  // ==================== Loading State ====================

  if (loading) {
    return (
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={`video-skeleton-${index}`}
            className="animate-pulse overflow-hidden rounded-2xl border border-white/10 bg-[#101117] p-3"
          >
            <div className="mb-3 h-10 w-10 rounded-full bg-white/10" />

            <div className="aspect-video rounded-xl bg-white/10" />

            <div className="mt-3 h-3 w-2/3 rounded bg-white/10" />

            <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
          </div>
        ))}
      </div>
    );
  }

  // ==================== Empty State ====================

  if (safeVideos.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 px-5 py-12 text-center text-sm text-gray-400">
        No published videos found.
      </div>
    );
  }

  // ==================== Videos Grid ====================

  return (
    <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {safeVideos.map((video, index) => {
        const videoId =
          video._id || video.id || `video-${index}`;

        return (
          <VideoCard
            key={videoId}
            video={video}
            currentUser={currentUser}
            onProfile={onProfile}
          />
        );
      })}
    </div>
  );
}