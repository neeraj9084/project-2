import PropTypes from "prop-types";
import { ArrowLeft, MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";

function MobileHeader({
  title = "VideoApp",
  showBackButton = false,
  showMenu = false,
  onBack,
  onMenuClick,
}) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    navigate(-1);
  };

  return (
    <header
      className="
        sticky
        top-0
        z-50

        h-14
        border-b
        border-white/[0.08]

        bg-[#080c10]/95
        backdrop-blur-xl
      "
      aria-label="Mobile navigation"
    >
      <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center px-3">
        {/* Left */}
        <div className="flex justify-start">
          {showBackButton && (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Go back"
              className="
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-xl
                text-white/80

                transition
                hover:bg-white/[0.05]
                hover:text-white

                focus:outline-none
                focus:ring-2
                focus:ring-[#766cff]/50
              "
            >
              <ArrowLeft
                size={21}
                strokeWidth={1.8}
              />
            </button>
          )}
        </div>

        {/* Center */}
        <h1
          className="
            max-w-[190px]
            truncate
            px-3

            text-center
            text-[15px]
            font-semibold
            tracking-[-0.01em]
            text-white
          "
        >
          {title}
        </h1>

        {/* Right */}
        <div className="flex justify-end">
          {showMenu && (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="More options"
              className="
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-xl
                text-white/80

                transition
                hover:bg-white/[0.05]
                hover:text-white

                focus:outline-none
                focus:ring-2
                focus:ring-[#766cff]/50
              "
            >
              <MoreVertical
                size={21}
                strokeWidth={1.8}
              />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

MobileHeader.propTypes = {
  title: PropTypes.string,
  showBackButton: PropTypes.bool,
  showMenu: PropTypes.bool,
  onBack: PropTypes.func,
  onMenuClick: PropTypes.func,
};

export default MobileHeader;