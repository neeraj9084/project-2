import PropTypes from "prop-types";
import {
  CalendarDays,
  ExternalLink,
  MapPin,
  Verified,
} from "lucide-react";

function ProfileInfo({
  fullName = "Neeraj Saini",
  username = "neeraj@11",
  bio = "Backend Developer | MERN Stack Developer | Love to build and learn new things ❤️",
  isVerified = true,
  location = "India",
  website = "https://yourwebsite.com",
  joinedDate = "Joined Jan 2024",
}) {
  const normalizedWebsite = website?.trim();

  const websiteHref = normalizedWebsite
    ? /^https?:\/\//i.test(normalizedWebsite)
      ? normalizedWebsite
      : `https://${normalizedWebsite}`
    : "";

  return (
    <div className="w-full">
      {/* Name */}
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 truncate text-[24px] font-bold tracking-[-0.025em] text-[#f5f7fb] md:text-[26px]">
          {fullName}
        </h1>

        {isVerified && (
          <Verified
            size={20}
            strokeWidth={2.4}
            fill="currentColor"
            className="shrink-0 text-[#7c70ff]"
            aria-label="Verified account"
          />
        )}
      </div>

      {/* Username */}
      <p className="mt-1 text-[14px] font-medium text-[#7b8491]">
        @{username}
      </p>

      {/* Bio */}
      {bio && (
        <p className="mt-4 max-w-2xl text-[14px] leading-6 text-[#c0c6d0] md:text-[15px]">
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

            <span className="truncate">
              {location}
            </span>
          </div>
        )}

        {/* Website */}
        {websiteHref && (
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="
              group
              flex
              max-w-[260px]
              items-center
              gap-1.5
              text-[13px]
              font-medium
              text-[#8b82ff]
              transition
              hover:text-[#a59eff]
            "
            aria-label={`Visit ${normalizedWebsite}`}
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

        {/* Joined */}
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
  isVerified: PropTypes.bool,
  location: PropTypes.string,
  website: PropTypes.string,
  joinedDate: PropTypes.string,
};

export default ProfileInfo;