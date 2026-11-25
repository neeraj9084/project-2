import { CheckCircle2, UserRound } from "lucide-react";

export default function VideoHeader({
  video,
  onCreatorClick,
  children,
}) {
  const owner =
    video?.owner && typeof video.owner === "object"
      ? video.owner
      : {};

  const title = video?.title || "Untitled video";
  const fullName =
    owner.fullName || owner.username || "Creator";

  const username = String(owner.username || "").replace(
    /^@+/,
    ""
  );

  const avatar = owner.avatar || owner.avatarUrl;

  return (
    <section className="mt-4">
      {/* Video title */}
      <h1 className="break-words text-xl font-bold leading-snug tracking-tight text-[#0f0f0f] sm:text-2xl">
        {title}
      </h1>

      {/* Creator details and action buttons */}
      <div className="mt-4 flex flex-col gap-4 border-b border-gray-200 pb-5 md:flex-row md:items-center md:justify-between">
        {/* Creator profile */}
        <button
          type="button"
          onClick={onCreatorClick}
          disabled={!onCreatorClick}
          aria-label={`View ${fullName}'s profile`}
          className="flex min-w-0 items-center gap-3 text-left disabled:cursor-default"
        >
          {/* Avatar */}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200">
            {avatar ? (
              <img
                src={avatar}
                alt={fullName}
                loading="lazy"
                className="h-full w-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <UserRound
                size={22}
                className="text-gray-500"
              />
            )}
          </div>

          {/* Name and username */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-gray-900">
                {fullName}
              </span>

              {owner.isVerified && (
                <CheckCircle2
                  size={14}
                  aria-label="Verified creator"
                  className="shrink-0 text-blue-600"
                />
              )}
            </div>

            <p className="mt-1 truncate text-xs text-gray-500">
              {username ? `@${username}` : "Creator"}
            </p>
          </div>
        </button>

        {/* Like, share, save and other actions */}
        {children && (
          <div className="flex flex-wrap items-center gap-2">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}