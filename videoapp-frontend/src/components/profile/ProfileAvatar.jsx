
import PropTypes from "prop-types";
import { Camera, UserRound, LoaderCircle } from "lucide-react";

function ProfileAvatar({
  image = "",
  name = "User",
  editable = false,
  onEdit,
  onAvatarClick,
  hasMoments = false,
  avatarButtonDisabled = false,
  loading = false,
}) {
  return (
    <div className="relative w-fit">
      {/* Profile avatar */}
      <button
        type="button"
        onClick={onAvatarClick}
        disabled={
          avatarButtonDisabled ||
          typeof onAvatarClick !== "function"
        }
        aria-label={
          hasMoments
            ? `View ${name}'s Moments`
            : `${name} profile photo`
        }
        className={`block rounded-full p-[3px] transition ${
          hasMoments
            ? "bg-gradient-to-tr from-amber-400 via-pink-500 to-violet-600"
            : "bg-transparent"
        }`}
      >
        <span className="relative block h-[116px] w-[116px] overflow-hidden rounded-full border-[3px] border-[#f5f7fb] bg-[#11161c] sm:h-[124px] sm:w-[124px] md:h-[134px] md:w-[134px]">
          {image ? (
            <img
              src={image}
              alt={`${name} profile`}
              draggable="false"
              className="h-full w-full object-cover object-center"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-[#151a20]">
              <UserRound
                size={42}
                strokeWidth={1.6}
                className="text-white/35"
                aria-hidden="true"
              />
            </span>
          )}
        </span>
      </button>

      {/* Edit avatar button */}
      {editable && (
        <button
          type="button"
          onClick={onEdit}
          disabled={loading}
          aria-label="Change profile photo"
          title="Change profile photo"
          className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-[#f5f7fb] bg-white text-gray-800 shadow-md transition-all duration-200 hover:bg-gray-100 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <LoaderCircle
              size={16}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Camera
              size={16}
              strokeWidth={1.9}
              aria-hidden="true"
            />
          )}
        </button>
      )}
    </div>
  );
}

ProfileAvatar.propTypes = {
  image: PropTypes.string,
  name: PropTypes.string,
  editable: PropTypes.bool,
  onEdit: PropTypes.func,
  onAvatarClick: PropTypes.func,
  hasMoments: PropTypes.bool,
  avatarButtonDisabled: PropTypes.bool,
  loading: PropTypes.bool,
};

export default ProfileAvatar;
