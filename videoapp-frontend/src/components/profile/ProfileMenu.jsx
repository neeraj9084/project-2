import { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import {
  Edit3,
  Flag,
  Link2,
  MoreHorizontal,
  Share2,
  UserRoundX,
} from "lucide-react";

function ProfileMenu({
  isOwnProfile = false,
  open = false,
  onClose,
  onEditProfile,
  onEditCover,
  onShare,
  onCopyProfileLink,
  onReport,
  onBlock,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleOutsideClick = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        onClose?.();
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    document.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );

      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [open, onClose]);

  const runAction = (callback) => {
    callback?.();
    onClose?.();
  };

  return (
    <div ref={menuRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        aria-label="More profile options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            onClose?.();
            return;
          }
        }}
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

          transition

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

      {/* Menu */}
      {open && (
        <div
          role="menu"
          aria-label="Profile options"
          className="
            absolute
            right-0
            top-[46px]
            z-50

            w-[210px]

            overflow-hidden
            rounded-2xl

            border
            border-white/[0.09]

            bg-[#11161c]

            p-1.5

            shadow-2xl
            shadow-black/50
          "
        >
          {isOwnProfile ? (
            <>
              <MenuItem
                icon={Edit3}
                label="Edit Profile"
                onClick={() =>
                  runAction(onEditProfile)
                }
              />

              <MenuItem
                icon={Edit3}
                label="Edit Cover"
                onClick={() =>
                  runAction(onEditCover)
                }
              />

              <MenuItem
                icon={Share2}
                label="Share Profile"
                onClick={() =>
                  runAction(onShare)
                }
              />

              <MenuItem
                icon={Link2}
                label="Copy Profile Link"
                onClick={() =>
                  runAction(onCopyProfileLink)
                }
              />
            </>
          ) : (
            <>
              <MenuItem
                icon={Share2}
                label="Share Profile"
                onClick={() =>
                  runAction(onShare)
                }
              />

              <MenuItem
                icon={Link2}
                label="Copy Profile Link"
                onClick={() =>
                  runAction(onCopyProfileLink)
                }
              />

              <div className="my-1 border-t border-white/[0.07]" />

              <MenuItem
                icon={Flag}
                label="Report Profile"
                danger
                onClick={() =>
                  runAction(onReport)
                }
              />

              <MenuItem
                icon={UserRoundX}
                label="Block User"
                danger
                onClick={() =>
                  runAction(onBlock)
                }
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  danger = false,
  onClick,
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`
        flex
        w-full
        items-center
        gap-3

        rounded-xl

        px-3
        py-2.5

        text-left
        text-[13px]
        font-medium

        transition

        focus:outline-none
        focus:ring-2
        focus:ring-[#766cff]/40

        ${
          danger
            ? "text-[#ff6b78] hover:bg-red-500/[0.08] hover:text-[#ff8290]"
            : "text-white/70 hover:bg-white/[0.05] hover:text-white"
        }
      `}
    >
      <Icon
        size={17}
        strokeWidth={1.8}
        className="shrink-0"
      />

      <span>{label}</span>
    </button>
  );
}

ProfileMenu.propTypes = {
  isOwnProfile: PropTypes.bool,
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onEditProfile: PropTypes.func,
  onEditCover: PropTypes.func,
  onShare: PropTypes.func,
  onCopyProfileLink: PropTypes.func,
  onReport: PropTypes.func,
  onBlock: PropTypes.func,
};

MenuItem.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  danger: PropTypes.bool,
  onClick: PropTypes.func,
};

export default ProfileMenu;