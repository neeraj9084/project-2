import PropTypes from "prop-types";
import {
  CalendarDays,
  ExternalLink,
  MapPin,
} from "lucide-react";

function ProfileInfo({
  fullName = "",
  username = "",
  bio = "",
  location = "",
  website = "",
  joinedDate = "",
}) {
  const normalizedWebsite = website.trim();

  const websiteHref = normalizedWebsite
    ? /^https?:\/\//i.test(normalizedWebsite)
      ? normalizedWebsite
      : `https://${normalizedWebsite}`
    : "";

  // Display the username without adding an extra @.
  const displayUsername = String(username).replace(/^@+/, "");

  return (
    <div className="w-full">
      {/* Name — no verification badge */}
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 truncate text-[24px] font-bold tracking-[-0.025em] text-[#f5f7fb] md:text-[26px]">
          {fullName}
        </h1>
      </div>

      {/* Username — no extra @ prefix */}
      {displayUsername && (
        <p className="mt-1 text-[14px] font-medium text-[#7b8491]">
          {displayUsername}
        </p>
      )}

      {/* Bio */}
      {bio && (
        <p className="mt-4 max-w-2xl whitespace-pre-wrap text-[14px] leading-6 text-[#c0c6d0] md:text-[15px]">
          {bio}
        </p>
      )}

      {/* Meta Information */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* Location */}
        {location && (
          <div className="flex items-center gap-1.5 text-[13px] text-[#7c8592]">
            <MapPin
              size={15}
              strokeWidth={1.8}
              className="shrink-0 text-[#69727f]"
            />

            <span className="truncate">{location}</span>
          </div>
        )}

        {/* Website */}
        {websiteHref && (
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Visit ${normalizedWebsite}`}
            className="group flex max-w-[260px] items-center gap-1.5 text-[13px] font-medium text-[#8b82ff] transition hover:text-[#a59eff]"
          >
            <ExternalLink
              size={14}
              strokeWidth={1.8}
              className="shrink-0"
            />

            <span className="truncate underline-offset-4 group-hover:underline">
              {normalizedWebsite}
            </span>
          </a>
        )}

        {/* Joined Date */}
        {joinedDate && (
          <div className="flex items-center gap-1.5 text-[13px] text-[#7c8592]">
            <CalendarDays
              size={15}
              strokeWidth={1.8}
              className="shrink-0 text-[#69727f]"
            />

            <span>{joinedDate}</span>
          </div>
        )}
      </div>
    </div>
  );
}

ProfileInfo.propTypes = {
  fullName: PropTypes.string,
  username: PropTypes.string,
  bio: PropTypes.string,
  location: PropTypes.string,
  website: PropTypes.string,
  joinedDate: PropTypes.string,
};

export default ProfileInfo;