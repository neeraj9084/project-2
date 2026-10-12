import PropTypes from "prop-types";
import {
  Film,
  Heart,
  LayoutGrid,
  PlaySquare,
} from "lucide-react";

const DEFAULT_TABS = [
  {
    id: "videos",
    label: "Videos",
    icon: Film,
  },
  {
    id: "liked",
    label: "Liked",
    icon: Heart,
  },
  {
    id: "moments",
    label: "Moments",
    icon: PlaySquare,
  },
  {
    id: "playlists",
    label: "Playlists",
    icon: LayoutGrid,
  },
];

function ProfileTabs({
  activeTab = "videos",
  onTabChange,
  tabs = DEFAULT_TABS,
}) {
  const handleTabChange = (tabId) => {
    if (tabId === activeTab) {
      return;
    }

    onTabChange?.(tabId);
  };

  return (
    <div className="w-full border-b border-white/[0.08]">
      <div
        className="
          flex
          items-center
          gap-6
          overflow-x-auto
          px-0

          [scrollbar-width:none]
          [&::-webkit-scrollbar]:hidden

          sm:gap-8
          md:gap-10
        "
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                handleTabChange(tab.id)
              }
              aria-selected={isActive}
              role="tab"
              className={`
                relative
                flex
                shrink-0
                items-center
                gap-2

                py-4

                text-[13px]
                font-medium

                transition-colors
                duration-200

                focus:outline-none
                focus-visible:ring-2
                focus-visible:ring-[#766cff]/50
                focus-visible:ring-offset-2
                focus-visible:ring-offset-[#070a0e]

                ${
                  isActive
                    ? "text-white"
                    : "text-[#737c89] hover:text-[#cdd2da]"
                }
              `}
            >
              <Icon
                size={16}
                strokeWidth={
                  isActive ? 2 : 1.8
                }
                aria-hidden="true"
              />

              <span>{tab.label}</span>

              {isActive && (
                <span
                  aria-hidden="true"
                  className="
                    absolute
                    bottom-0
                    left-0
                    right-0

                    h-[2px]

                    rounded-full
                    bg-[#766cff]
                  "
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

ProfileTabs.propTypes = {
  activeTab: PropTypes.oneOf([
    "videos",
    "liked",
    "moments",
    "playlists",
  ]),
  onTabChange: PropTypes.func,
  tabs: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      icon: PropTypes.elementType.isRequired,
    })
  ),
};

export default ProfileTabs;