
import { NavLink, useLocation } from "react-router-dom";
import PropTypes from "prop-types";

import {
  Bell,
  Clock3,
  Compass,
  Film,
  FolderKanban,
  Heart,
  Home,
  MessageCircle,
  PlusSquare,
  Radio,
  UserRound,
} from "lucide-react";

const DEFAULT_USER = {
  fullName: "Neeraj Saini",
  username: "neeraj@11",
  avatar: "",
};

const ITEMS = [
  { label: "Home", path: "/home", icon: Home },
  { label: "Explore", path: "/explore", icon: Compass },
  { label: "Subscriptions", path: "/subscriptions", icon: Radio },
  { label: "History", path: "/history", icon: Clock3 },
  { label: "Your Videos", path: "/my-videos", icon: Film },
  { label: "Liked Videos", path: "/liked", icon: Heart },
  { label: "Playlists", path: "/playlists", icon: FolderKanban },
  { label: "Messages", path: "/messages", icon: MessageCircle },
  { label: "Notifications", path: "/notifications", icon: Bell },
  { label: "Create Moment", path: "/moments/create", icon: PlusSquare },
];

const bubbleStyle = {
  background:
    "radial-gradient(circle at 30% 20%, #fff 0%, #fbcfe8 28%, #f472b6 70%, #f9a8d4 100%)",
  border: "1px solid rgba(249,168,212,.8)",
  boxShadow:
    "inset 0 2px 5px rgba(255,255,255,.85), 0 0 14px rgba(244,114,182,.2)",
};

function Sidebar({
  user = DEFAULT_USER,
  collapsed = true,
  hovered = false,
  onHoverChange,
  unreadNotifications = 0,
  unreadMessages = 0,
}) {
  const { pathname } = useLocation();

  const compact = collapsed && !hovered;

  const displayName = user?.fullName || DEFAULT_USER.fullName;

  const username = String(
    user?.username || DEFAULT_USER.username
  ).replace(/^@+/, "");

  const avatar = user?.avatar || user?.avatarUrl || "";

  const isActive = (path) => {
    if (path === "/home") {
      return pathname === "/" || pathname === "/home";
    }

    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const getUnreadCount = (label) => {
    if (label === "Notifications") return unreadNotifications;
    if (label === "Messages") return unreadMessages;
    return 0;
  };

  return (
    <aside
      aria-label="Sidebar navigation"
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      className="
        relative h-full w-full min-w-0 overflow-hidden
        border-r border-white/[0.07]
        bg-[#11101b]/85
        text-slate-200
        backdrop-blur-3xl
      "
    >
      {/* Transparent glass reflection */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0
          bg-gradient-to-b
          from-white/[0.025]
          via-transparent
          to-pink-400/[0.025]
        "
      />

      <div className="relative flex h-full min-w-0 flex-col">
        {/* Navigation */}
        <nav
          aria-label="Main navigation"
          className="
            flex min-h-0 flex-1 flex-col items-center
            gap-2 overflow-x-hidden overflow-y-auto
            px-2 py-4
            [scrollbar-width:none]
            [&::-webkit-scrollbar]:hidden
          "
        >
          {ITEMS.map(({ label, path, icon: Icon }) => {
            const active = isActive(path);
            const count = getUnreadCount(label);

            return (
              <NavLink
                key={path}
                to={path}
                end={path === "/home"}
                title={compact ? label : undefined}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className="
                  group/item flex min-h-12 w-full shrink-0
                  items-center rounded-xl
                  border border-transparent
                  px-1.5
                  text-slate-300 no-underline
                  transition-colors duration-200
                  hover:bg-white/[0.025]
                  focus-visible:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-pink-300/70
                "
              >
                {/* Icon and water-bubble effect */}
                <span
                  className={`
                    flex h-11 w-11 shrink-0
                    items-center justify-center
                    rounded-full border border-transparent
                    transition-all duration-200
                    ${compact ? "mx-auto" : "mr-3"}
                    ${
                      active
                        ? "scale-100"
                        : "group-hover/item:bg-white/[0.035]"
                    }
                  `}
                  style={active ? bubbleStyle : undefined}
                >
                  <Icon
                    size={21}
                    strokeWidth={1.8}
                    className={
                      active
                        ? "text-[#be185d]"
                        : "text-[#d8d5e5] transition-colors duration-200 group-hover/item:text-pink-200"
                    }
                  />
                </span>

                {/* Label: black only while hovering */}
                {!compact && (
                  <span
                    className={`
                      min-w-0 flex-1 truncate
                      text-[13px] font-medium
                      transition-colors duration-150
                      ${
                        active
                          ? "text-white"
                          : "text-[#e5e2ef]"
                      }
                      group-hover/item:!text-black
                    `}
                  >
                    {label}
                  </span>
                )}

                {/* Unread count */}
                {!compact && count > 0 && (
                  <span className="
                    mr-2 rounded-full
                    bg-pink-300/10 px-2 py-0.5
                    text-[10px] font-semibold text-pink-200
                  ">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Current user's profile */}
        <div className="relative shrink-0 border-t border-white/[0.08] p-2">
          <NavLink
            to="/profile"
            end
            title={compact ? `${displayName} (@${username})` : undefined}
            aria-label="My profile"
            className="
              group/profile flex min-h-12 w-full min-w-0
              items-center rounded-xl
              border border-transparent px-1.5
              transition-colors duration-200
              hover:bg-white/[0.025]
              focus-visible:outline-none
              focus-visible:ring-2
              focus-visible:ring-pink-300/70
            "
          >
            {({ isActive: profileActive }) => (
              <>
                <span
                  className={`
                    flex h-11 w-11 shrink-0
                    items-center justify-center
                    rounded-full border border-transparent
                    ${compact ? "mx-auto" : "mr-3"}
                  `}
                  style={profileActive ? bubbleStyle : undefined}
                >
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={displayName}
                      loading="lazy"
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <UserRound
                      size={21}
                      strokeWidth={1.8}
                      className={
                        profileActive
                          ? "text-pink-800"
                          : "text-slate-300"
                      }
                    />
                  )}
                </span>

                {!compact && (
                  <span className="min-w-0 flex-1">
                    <span
                      className="
                        block truncate text-xs font-medium
                        text-slate-100
                        transition-colors duration-150
                        group-hover/profile:!text-black
                      "
                    >
                      {displayName}
                    </span>

                    <span
                      className="
                        mt-0.5 block truncate text-[11px]
                        text-slate-400
                        transition-colors duration-150
                        group-hover/profile:!text-black
                      "
                    >
                      @{username}
                    </span>
                  </span>
                )}
              </>
            )}
          </NavLink>
        </div>
      </div>
    </aside>
  );
}

Sidebar.propTypes = {
  user: PropTypes.shape({
    fullName: PropTypes.string,
    username: PropTypes.string,
    avatar: PropTypes.string,
    avatarUrl: PropTypes.string,
  }),
  collapsed: PropTypes.bool,
  hovered: PropTypes.bool,
  onHoverChange: PropTypes.func,
  unreadNotifications: PropTypes.number,
  unreadMessages: PropTypes.number,
};

export default Sidebar;
