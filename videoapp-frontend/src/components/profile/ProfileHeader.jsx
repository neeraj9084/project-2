import PropTypes from "prop-types";
import ProfileCover from "./ProfileCover";
import ProfileAvatar from "./ProfileAvatar";
import ProfileActions from "./ProfileActions";
import ProfileInfo from "./ProfileInfo";
import ProfileStats from "./ProfileStats";

function ProfileHeader({
  profile,
  isOwnProfile = false,
  onEditProfile,
  onEditCover,
  onEditAvatar,
  onMenuClick,
}) {
  const fullName = profile?.fullName || "";

  // Remove leading @ characters; ProfileInfo should display the username as-is.
  const username = String(profile?.username || "").replace(/^@+/, "");

  const bio = profile?.bio || "";
  const avatar = profile?.avatar || "";
  const coverImage = profile?.coverImage || "";
  const location = profile?.location || "";
  const website = profile?.website || "";

  const createdAt = profile?.createdAt || profile?.joinedDate;

  const joinedDate = createdAt
    ? `Joined ${new Date(createdAt).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })}`
    : "";

  const videosCount = profile?.videosCount ?? 0;
  const followersCount = profile?.followersCount ?? 0;
  const followingCount = profile?.followingCount ?? 0;

  return (
    <section className="w-full bg-[#070a0e]">
      {/* Profile Cover */}
      <div className="relative px-0">
        <ProfileCover
          image={coverImage}
          editable={isOwnProfile}
          onEdit={onEditCover}
        />
      </div>

      {/* Avatar and Profile Actions */}
      <div className="relative px-4 md:px-7 lg:px-8">
        <div className="relative flex flex-col md:min-h-[132px]">
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

        {/* Profile Information — no verification tick */}
        <div className="mt-3 md:mt-[-2px]">
          <ProfileInfo
            fullName={fullName}
            username={username}
            bio={bio}
            location={location}
            website={website}
            joinedDate={joinedDate}
          />
        </div>

        {/* Profile Stats */}
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
    joinedDate: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.instanceOf(Date),
    ]),
    createdAt: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.instanceOf(Date),
    ]),
    videosCount: PropTypes.number,
    followersCount: PropTypes.number,
    followingCount: PropTypes.number,
  }),

  isOwnProfile: PropTypes.bool,
  onEditProfile: PropTypes.func,
  onEditCover: PropTypes.func,
  onEditAvatar: PropTypes.func,
  onMenuClick: PropTypes.func,
};

export default ProfileHeader;