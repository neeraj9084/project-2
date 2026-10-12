import PropTypes from "prop-types";
import { Camera, UserRound } from "lucide-react";

const DEFAULT_AVATAR = "";

function ProfileAvatar({
  image = DEFAULT_AVATAR,
  name = "User",
  editable = false,
  onEdit,
}) {
  const handleEdit = () => {
    onEdit?.();
  };

  return (
    <div className="relative">
      {/* Avatar */}
      <div
        className="
          relative
          h-[116px]
          w-[116px]
          overflow-hidden
          rounded-full
          border-[3px]
          border-[#f5f7fb]
          bg-[#11161c]
          shadow-[0_4px_22px_rgba(0,0,0,0.35)]

          sm:h-[124px]
          sm:w-[124px]

          md:h-[134px]
          md:w-[134px]
        "
      >
        {image ? (
          <img
            src={image}
            alt={`${name} profile`}
            className="
              h-full
              w-full
              object-cover
              object-center
            "
          />
        ) : (
          <div
            className="
              flex
              h-full
              w-full
              items-center
              justify-center
              bg-[#151a20]
            "
          >
            <UserRound
              size={42}
              strokeWidth={1.6}
              className="text-white/35"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      {/* Camera */}
      {editable && (
        <button
          type="button"
          onClick={handleEdit}
          aria-label="Change profile photo"
          className="
            absolute
            bottom-1
            right-1

            flex
            h-9
            w-9
            items-center
            justify-center

            rounded-full

            border-[3px]
            border-[#070a0e]

            bg-[#151a20]
            text-white

            shadow-[0_4px_14px_rgba(0,0,0,0.35)]

            transition-all
            duration-200

            hover:scale-105
            hover:bg-[#20262e]

            focus:outline-none
            focus:ring-2
            focus:ring-[#766cff]/60
          "
        >
          <Camera
            size={16}
            strokeWidth={2}
            aria-hidden="true"
          />
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
};

export default ProfileAvatar;