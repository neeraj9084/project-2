import PropTypes from "prop-types";
import {
  MessageCircle,
  MoreHorizontal,
  UserPlus,
} from "lucide-react";

function ProfileActions({
  isOwnProfile = true,
  isSubscribed = false,
  onEdit,
  onSubscribe,
  onMessage,
  onMenuClick,
}) {
  /* ==========================================
     OWN PROFILE
  =========================================== */
  if (isOwnProfile) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="
            inline-flex
            h-10
            items-center
            justify-center
            rounded-[11px]

            border
            border-white/[0.10]

            bg-[#12171d]

            px-4

            text-[13px]
            font-semibold
            text-white

            transition-all
            duration-200

            hover:border-white/[0.16]
            hover:bg-[#181e25]

            focus:outline-none
            focus:ring-2
            focus:ring-[#766cff]/50

            active:scale-[0.98]
          "
        >
          Edit Profile
        </button>

        <button
          type="button"
          onClick={onMenuClick}
          aria-label="More profile options"
          className="
            flex
            h-10
            w-10
            items-center
            justify-center

            rounded-[11px]

            border
            border-white/[0.10]

            bg-[#12171d]

            text-white/65

            transition-all
            duration-200

            hover:border-white/[0.16]
            hover:bg-[#181e25]
            hover:text-white

            focus:outline-none
            focus:ring-2
            focus:ring-[#766cff]/50
          "
        >
          <MoreHorizontal
            size={19}
            strokeWidth={1.8}
          />
        </button>
      </div>
    );
  }

  /* ==========================================
     OTHER USER PROFILE
  =========================================== */
  return (
    <div className="flex items-center gap-2">
      {/* Subscribe */}
      <button
        type="button"
        onClick={onSubscribe}
        className={`
          inline-flex
          h-10
          items-center
          justify-center
          gap-2

          rounded-[11px]

          px-4

          text-[13px]
          font-semibold

          transition-all
          duration-200

          focus:outline-none
          focus:ring-2
          focus:ring-[#766cff]/50

          active:scale-[0.98]

          ${
            isSubscribed
              ? "border border-white/[0.10] bg-[#12171d] text-white/85 hover:bg-[#181e25]"
              : "bg-[#766cff] text-white shadow-[0_0_18px_rgba(118,108,255,0.16)] hover:bg-[#8379ff]"
          }
        `}
      >
        {!isSubscribed && (
          <UserPlus
            size={16}
            strokeWidth={1.9}
          />
        )}

        <span>
          {isSubscribed
            ? "Subscribed"
            : "Subscribe"}
        </span>
      </button>

      {/* Message */}
      <button
        type="button"
        onClick={onMessage}
        aria-label="Message user"
        className="
          flex
          h-10
          items-center
          justify-center
          gap-2

          rounded-[11px]

          border
          border-white/[0.10]

          bg-[#12171d]

          px-3.5

          text-[13px]
          font-medium
          text-white/75

          transition-all
          duration-200

          hover:border-white/[0.16]
          hover:bg-[#181e25]
          hover:text-white

          focus:outline-none
          focus:ring-2
          focus:ring-[#766cff]/50
        "
      >
        <MessageCircle
          size={17}
          strokeWidth={1.8}
        />

        <span className="hidden sm:inline">
          Message
        </span>
      </button>

      {/* More */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="More profile options"
        className="
          flex
          h-10
          w-10
          items-center
          justify-center

          rounded-[11px]

          border
          border-white/[0.10]

          bg-[#12171d]

          text-white/65

          transition-all
          duration-200

          hover:border-white/[0.16]
          hover:bg-[#181e25]
          hover:text-white

          focus:outline-none
          focus:ring-2
          focus:ring-[#766cff]/50
        "
      >
        <MoreHorizontal
          size={19}
          strokeWidth={1.8}
        />
      </button>
    </div>
  );
}

ProfileActions.propTypes = {
  isOwnProfile: PropTypes.bool,
  isSubscribed: PropTypes.bool,
  onEdit: PropTypes.func,
  onSubscribe: PropTypes.func,
  onMessage: PropTypes.func,
  onMenuClick: PropTypes.func,
};

export default ProfileActions;