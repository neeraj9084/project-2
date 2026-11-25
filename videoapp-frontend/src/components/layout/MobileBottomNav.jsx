import PropTypes from "prop-types";
import { NavLink, useNavigate } from "react-router-dom";

import {
  Bell,
  Home,
  Plus,
  Search,
  UserRound,
} from "lucide-react";

const NAV_ITEMS = [
  {
    id: "home",
    label: "Home",
    path: "/home",
    icon: Home,
  },
  {
    id: "search",
    label: "Search",
    path: "/search",
    icon: Search,
  },
  {
    id: "notifications",
    label: "Notifications",
    path: "/notifications",
    icon: Bell,
  },
  {
    id: "profile",
    label: "Profile",
    path: "/profile",
    icon: UserRound,
  },
];

function MobileBottomNav({
  profilePath = "/profile",
  notificationCount = 0,
}) {
  const navigate = useNavigate();

  return (
    <nav
      aria-label="Mobile navigation"
      className="
        fixed inset-x-0 bottom-0 z-50 md:hidden
        border-t border-white/[0.09]
        bg-[#090910]/75
        backdrop-blur-2xl
        backdrop-saturate-150
        shadow-[0_-8px_35px_rgba(0,0,0,0.20)]
        pb-[env(safe-area-inset-bottom)]
      "
    >
      {/* Subtle liquid-glass reflection */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0
          bg-gradient-to-b
          from-white/[0.045]
          via-transparent
          to-violet-500/[0.035]
        "
      />

      <div
        className="
          relative mx-auto flex h-[68px] max-w-md
          items-center justify-around px-2
        "
      >
        <MobileNavItem item={NAV_ITEMS[0]} />

        <MobileNavItem item={NAV_ITEMS[1]} />

        {/* Create button */}
        <button
          type="button"
          onClick={() => navigate("/upload")}
          aria-label="Create or upload video"
          className="
            group relative flex h-12 w-12 shrink-0
            items-center justify-center
            overflow-hidden rounded-[18px]
            border border-violet-300/25
            bg-violet-400/[0.10]
            text-violet-100
            shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]
            backdrop-blur-2xl
            transition-all duration-300
            hover:border-violet-200/40
            hover:bg-violet-400/[0.17]
            hover:shadow-[0_0_22px_rgba(139,92,246,0.20)]
            active:scale-95
            focus-visible:outline-none
            focus-visible:ring-2
            focus-visible:ring-violet-400/60
          "
        >
          <span
            aria-hidden="true"
            className="
              pointer-events-none absolute inset-0
              bg-gradient-to-br
              from-white/[0.16]
              via-transparent
              to-violet-400/[0.10]
              opacity-80
            "
          />

          <Plus
            size={25}
            strokeWidth={1.7}
            className="
              relative transition-transform duration-300
              group-hover:rotate-90
            "
          />
        </button>

        <MobileNavItem
          item={NAV_ITEMS[2]}
          notificationCount={notificationCount}
        />

        <MobileNavItem
          item={{
            ...NAV_ITEMS[3],
            path: profilePath,
          }}
        />
      </div>
    </nav>
  );
}

function MobileNavItem({
  item,
  notificationCount = 0,
}) {
  const Icon = item.icon;
  const hasNotifications =
    item.id === "notifications" && notificationCount > 0;

  const badgeText =
    notificationCount > 99 ? "99+" : notificationCount;

  return (
    <NavLink
      to={item.path}
      end={item.id === "home"}
      aria-label={
        hasNotifications
          ? `${item.label}, ${badgeText} notifications`
          : item.label
      }
      className="group/nav flex min-w-[58px] flex-col items-center justify-center gap-1"
    >
      {({ isActive }) => (
        <>
          {/* Translucent icon bubble */}
          <span
            className={`
              relative flex h-9 w-11 items-center justify-center
              overflow-hidden rounded-2xl border
              transition-all duration-300 ease-out
              ${
                isActive
                  ? `
                    border-white/[0.13]
                    bg-white/[0.075]
                    text-violet-200
                    shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_14px_rgba(139,92,246,0.08)]
                    backdrop-blur-xl
                  `
                  : `
                    border-transparent
                    bg-transparent
                    text-white/45
                    group-hover/nav:border-white/[0.07]
                    group-hover/nav:bg-white/[0.035]
                    group-hover/nav:text-white/85
                  `
              }
            `}
          >
            {isActive && (
              <span
                aria-hidden="true"
                className="
                  pointer-events-none absolute inset-0
                  bg-gradient-to-br
                  from-white/[0.10]
                  via-transparent
                  to-violet-400/[0.06]
                "
              />
            )}

            <Icon
              size={20}
              strokeWidth={isActive ? 2 : 1.7}
              aria-hidden="true"
              className="relative z-10 transition-transform duration-200 group-active/nav:scale-90"
            />

            {hasNotifications && (
              <span
                className="
                  absolute right-0.5 top-0.5 z-20
                  flex h-4 min-w-4 items-center justify-center
                  rounded-full border border-[#090910]
                  bg-violet-400 px-1
                  text-[8px] font-bold leading-none text-white
                "
              >
                {badgeText}
              </span>
            )}
          </span>

          {/* Navigation label */}
          <span
            className={`
              text-[10px] leading-3 transition-colors duration-200
              ${
                isActive
                  ? "font-semibold text-white/90"
                  : "font-medium text-white/40 group-hover/nav:text-white/70"
              }
            `}
          >
            {item.label}
          </span>

          {/* Active indicator */}
          {isActive ? (
            <span
              aria-hidden="true"
              className="
                absolute bottom-[3px]
                h-[2px] w-4 rounded-full
                bg-violet-300/90
                shadow-[0_0_8px_rgba(167,139,250,0.45)]
              "
            />
          ) : null}
        </>
      )}
    </NavLink>
  );
}

MobileBottomNav.propTypes = {
  profilePath: PropTypes.string,
  notificationCount: PropTypes.number,
};

MobileNavItem.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    path: PropTypes.string.isRequired,
    icon: PropTypes.elementType.isRequired,
  }).isRequired,
  notificationCount: PropTypes.number,
};

export default MobileBottomNav;