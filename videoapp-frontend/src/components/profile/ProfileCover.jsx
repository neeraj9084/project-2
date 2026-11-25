import { Camera, ImagePlus, LoaderCircle } from "lucide-react";

export default function ProfileCover({
  image = "",
  editable = false,
  loading = false,
  onEdit,
}) {
  return (
    <div className="group relative isolate aspect-[3/1] min-h-[150px] w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-sm sm:min-h-[190px] sm:rounded-3xl">
      {/* Cover Image */}
      {image ? (
        <img
          src={image}
          alt="Profile cover"
          draggable="false"
          className="absolute inset-0 h-full w-full select-none object-cover object-center"
        />
      ) : (
        <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-violet-50 via-white to-orange-50">
          <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/80 blur-2xl" />

          <div className="absolute -bottom-24 left-1/4 h-56 w-56 rounded-full bg-violet-100/60 blur-3xl" />

          <div className="relative flex h-full items-center justify-center text-gray-400">
            <ImagePlus size={38} strokeWidth={1.5} />
          </div>
        </div>
      )}

      {/* Subtle image overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/[0.04] via-transparent to-black/[0.06]" />

      {/* Edit Cover Button */}
      {editable && (
        <button
          type="button"
          onClick={onEdit}
          disabled={loading}
          aria-label={loading ? "Uploading cover image" : "Edit cover image"}
          title={loading ? "Uploading cover image" : "Edit cover"}
          className="absolute right-3 top-3 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-semibold !text-gray-800 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:bg-gray-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 sm:right-4 sm:top-4"
          style={{
            color: "#1f2937",
            backgroundColor: "#ffffff",
          }}
        >
          {loading ? (
            <LoaderCircle
              size={17}
              strokeWidth={2}
              className="shrink-0 animate-spin !text-gray-800"
              style={{ color: "#1f2937" }}
              aria-hidden="true"
            />
          ) : (
            <Camera
              size={17}
              strokeWidth={1.9}
              className="shrink-0 !text-gray-800"
              style={{ color: "#1f2937" }}
              aria-hidden="true"
            />
          )}

          <span
            className="whitespace-nowrap !text-gray-800"
            style={{ color: "#1f2937" }}
          >
            {loading ? "Uploading..." : "Edit cover"}
          </span>
        </button>
      )}
    </div>
  );
}