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

  const iconButtonClass = `
    group relative flex h-10 w-10 shrink-0
    items-center justify-center overflow-hidden
    rounded-2xl
    border border-transparent
    text-white/65
    transition-all duration-200
    hover:border-white/[0.09]
    hover:bg-white/[0.045]
    hover:text-white
    active:scale-95
    focus-visible:outline-none
    focus-visible:ring-2
    focus-visible:ring-violet-400/50
  `;

  return (
    <header
      aria-label="Mobile navigation"
      className="
        sticky top-0 z-50
        border-b border-white/[0.07]
        bg-[#090910]/75
        backdrop-blur-2xl
        backdrop-saturate-150
        supports-[backdrop-filter]:bg-[#090910]/65
      "
    >
      {/* Subtle glass reflection */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0
          bg-gradient-to-b
          from-white/[0.035]
          via-transparent
          to-violet-500/[0.025]
        "
      />

      <div
        className="
          relative grid h-14
          grid-cols-[1fr_minmax(0,auto)_1fr]
          items-center gap-2
          px-3
        "
      >
        {/* Left */}
        <div className="flex min-w-0 justify-start">
          {showBackButton && (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Go back"
              className={iconButtonClass}
            >
              <ArrowLeft
                size={21}
                strokeWidth={1.7}
                className="relative transition-transform duration-200 group-hover:-translate-x-0.5"
              />
            </button>
          )}
        </div>

        {/* Center */}
        <h1
          title={title}
          className="
            max-w-[190px] truncate px-2
            text-center text-[15px]
            font-semibold tracking-[-0.02em]
            text-white/95
          "
        >
          {title}
        </h1>

        {/* Right */}
        <div className="flex min-w-0 justify-end">
          {showMenu && (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="More options"
              className={iconButtonClass}
            >
              <MoreVertical
                size={21}
                strokeWidth={1.7}
                className="relative"
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