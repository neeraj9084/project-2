import PropTypes from "prop-types";
import {
  CalendarDays,
  Camera,
  Edit3,
  Link as LinkIcon,
  MapPin,
  MoreHorizontal,
  Verified,
} from "lucide-react";

import ProfileCover from "./ProfileCover";
import ProfileAvatar from "./ProfileAvatar";
import ProfileActions from "./ProfileActions";
import ProfileInfo from "./ProfileInfo";
import ProfileStats from "./ProfileStats";

const DEFAULT_PROFILE = {
  fullName: "Neeraj Saini",
  username: "neeraj@11",
  bio: "Backend Developer | MERN Stack Developer | Love to build and learn new things ❤️",
  avatar: "",
  coverImage: "",
  location: "India",
  website: "https://yourwebsite.com",
  joinedDate: "Joined Jan 2024",
  videosCount: 42,
  followersCount: 120,
  followingCount: 85,
  isVerified: true,
};

function ProfileHeader({
  profile = DEFAULT_PROFILE,
  isOwnProfile = true,
  onEditProfile,
  onEditCover,
  onEditAvatar,
  onMenuClick,
}) {
  const fullName =
    profile?.fullName || DEFAULT_PROFILE.fullName;

  const username =
    profile?.username || DEFAULT_PROFILE.username;

  const bio =
    profile?.bio || DEFAULT_PROFILE.bio;

  const avatar =
    profile?.avatar || DEFAULT_PROFILE.avatar;

  const coverImage =
    profile?.coverImage || DEFAULT_PROFILE.coverImage;

  const location =
    profile?.location || DEFAULT_PROFILE.location;

  const website =
    profile?.website || DEFAULT_PROFILE.website;

  const joinedDate =
    profile?.joinedDate || DEFAULT_PROFILE.joinedDate;

  const videosCount =
    profile?.videosCount ??
    DEFAULT_PROFILE.videosCount;

  const followersCount =
    profile?.followersCount ??
    DEFAULT_PROFILE.followersCount;

  const followingCount =
    profile?.followingCount ??
    DEFAULT_PROFILE.followingCount;

  const isVerified =
    profile?.isVerified ??
    DEFAULT_PROFILE.isVerified;

  return (
    <section className="w-full bg-[#070a0e]">
      {/* =====================================================
          COVER
      ====================================================== */}
      <div className="relative px-0 md:px-0">
        <ProfileCover
          image={coverImage}
          editable={isOwnProfile}
          onEdit={onEditCover}
        />

        {/* Mobile Cover Overlay */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0 md:hidden" />
      </div>

      {/* =====================================================
          PROFILE BODY
      ====================================================== */}
      <div className="relative px-4 md:px-7 lg:px-8">
        {/* ===================================================
            AVATAR + ACTIONS ROW
        ==================================================== */}
        <div className="relative flex flex-col md:min-h-[132px]">
          {/* Avatar */}
          <div className="-mt-[58px] w-fit md:-mt-[62px]">
            <ProfileAvatar
              image={avatar}
              name={fullName}
              editable={isOwnProfile}
              onEdit={onEditAvatar}
            />
          </div>

          {/* Desktop Actions */}
          <div className="absolute right-0 top-5 hidden items-center gap-3 md:flex">
            <ProfileActions
              isOwnProfile={isOwnProfile}
              onEdit={onEditProfile}
              onMenuClick={onMenuClick}
            />
          </div>

          {/* Mobile Actions */}
          <div className="mt-3 flex items-center gap-2 md:hidden">
            <ProfileActions
              isOwnProfile={isOwnProfile}
              onEdit={onEditProfile}
              onMenuClick={onMenuClick}
            />
          </div>
        </div>

        {/* ===================================================
            PROFILE INFORMATION
        ==================================================== */}
        <div className="mt-3 md:mt-[-2px]">
          <ProfileInfo
            fullName={fullName}
            username={username}
            bio={bio}
            isVerified={isVerified}
            location={location}
            website={website}
            joinedDate={joinedDate}
          />
        </div>

        {/* ===================================================
            STATS
        ==================================================== */}
        <div className="mt-7 md:mt-8">
          <ProfileStats
            videos={videosCount}
            followers={followersCount}
            following={followingCount}
          />
        </div>
      </div>
    </section>
  );
}

ProfileHeader.propTypes = {
  profile: PropTypes.shape({
    fullName: PropTypes.string,
    username: PropTypes.string,
    bio: PropTypes.string,
    avatar: PropTypes.string,
    coverImage: PropTypes.string,
    location: PropTypes.string,
    website: PropTypes.string,
    joinedDate: PropTypes.string,
    videosCount: PropTypes.number,
    followersCount: PropTypes.number,
    followingCount: PropTypes.number,
    isVerified: PropTypes.bool,
  }),

  isOwnProfile: PropTypes.bool,

  onEditProfile: PropTypes.func,
  onEditCover: PropTypes.func,
  onEditAvatar: PropTypes.func,
  onMenuClick: PropTypes.func,
};

export default ProfileHeader;