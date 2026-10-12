import { Camera } from "lucide-react";
import PropTypes from "prop-types";

const DEFAULT_COVER =
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1800&q=85";

function ProfileCover({
  image = DEFAULT_COVER,
  editable = false,
  onEdit,
}) {
  const handleEdit = () => {
    if (typeof onEdit === "function") {
      onEdit();
    }
  };

  return (
    <div className="relative w-full">
      {/* Cover */}
      <div
        className="
          relative
          w-full
          overflow-hidden
          bg-[#0b0f14]

          h-[180px]
          sm:h-[220px]
          md:h-[250px]
          lg:h-[260px]

          md:rounded-b-[14px]
        "
      >
        <img
          src={image || DEFAULT_COVER}
          alt="Profile cover"
          className="
            h-full
            w-full
            object-cover
            object-center
          "
        />

        {/* Dark overlay */}
        <div
          className="
            pointer-events-none
            absolute
            inset-0
            bg-gradient-to-b
            from-black/5
            via-black/0
            to-black/25
          "
        />

        {/* Edit Cover */}
        {editable && (
          <button
            type="button"
            onClick={handleEdit}
            aria-label="Edit cover photo"
            className="
              absolute
              right-4
              top-4

              flex
              h-10
              items-center
              gap-2

              rounded-xl

              border
              border-white/[0.12]

              bg-[#171920]/85
              px-3.5

              text-[12px]
              font-medium
              text-white

              backdrop-blur-md

              shadow-lg
              shadow-black/20

              transition

              hover:bg-[#20242d]
              hover:border-white/[0.18]

              focus:outline-none
              focus:ring-2
              focus:ring-[#766cff]/60

              md:right-5
              md:top-4
            "
          >
            <Camera
              size={16}
              strokeWidth={1.9}
            />

            <span className="hidden sm:inline">
              Edit Cover
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

ProfileCover.propTypes = {
  image: PropTypes.string,
  editable: PropTypes.bool,
  onEdit: PropTypes.func,
};

export default ProfileCover;