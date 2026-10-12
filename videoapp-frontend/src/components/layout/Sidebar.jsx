import { NavLink } from "react-router-dom";
import PropTypes from "prop-types";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
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

import SidebarSection from "./SidebarSection";

const DEFAULT_USER = {
  fullName: "Neeraj Saini",
  username: "neeraj@11",
  avatar: "",
};

const NAVIGATION_SECTIONS = [
  {
    id: "main",
    label: "Main",
    items: [
      {
        label: "Home",
        path: "/home",
        icon: Home,
      },
      {
        label: "Explore",
        path: "/explore",
        icon: Compass,
      },
      {
        label: "Subscriptions",
        path: "/subscriptions",
        icon: Radio,
      },
    ],
  },
  {
    id: "library",
    label: "Library",
    items: [
      {
        label: "History",
        path: "/history",
        icon: Clock3,
      },
      {
        label: "Your Videos",
        path: "/my-videos",
        icon: Film,
      },
      {
        label: "Liked Videos",
        path: "/liked",
        icon: Heart,
      },
      {
        label: "Playlists",
        path: "/playlists",
        icon: FolderKanban,
      },
    ],
  },
  {
    id: "social",
    label: "Social",
    items: [
      {
        label: "Messages",
        path: "/messages",
        icon: MessageCircle,
      },
      {
        label: "Notifications",
        path: "/notifications",
        icon: Bell,
      },
      {
        label: "Create Moment",
        path: "/moments/create",
        icon: PlusSquare,
      },
    ],
  },
];

function Sidebar({
  user = DEFAULT_USER,
  collapsed = false,
  onCollapseChange,
  unreadNotifications = 0,
  unreadMessages = 0,
}) {
  const displayName =
    user?.fullName || DEFAULT_USER.fullName;

  const username =
    user?.username || DEFAULT_USER.username;

  const avatar =
    user?.avatar || "";

  const handleCollapse = () => {
    onCollapseChange?.(!collapsed);
  };

  return (
    <aside
      aria-label="Sidebar navigation"
      className="
        group
        relative
        hidden
        h-full
        w-full
        border-r
        border-white/[0.08]
        bg-[#090c10]
        md:block
      "
    >
      {/* Collapse Button */}
      <button
        type="button"
        onClick={handleCollapse}
        aria-label={
          collapsed
            ? "Expand sidebar"
            : "Collapse sidebar"
        }
        className="
          absolute
          right-2
          top-3
          z-30

          flex
          h-8
          w-8
          items-center
          justify-center

          rounded-full
          border
          border-white/[0.08]
          bg-[#12171d]
          text-white/45

          opacity-0
          pointer-events-none

          shadow-lg
          shadow-black/30

          transition-all
          duration-200

          group-hover:pointer-events-auto
          group-hover:opacity-100

          focus:pointer-events-auto
          focus:opacity-100

          hover:border-[#766cff]/40
          hover:bg-[#766cff]/10
          hover:text-white

          focus:outline-none
          focus:ring-2
          focus:ring-[#766cff]/50
        "
      >
        {collapsed ? (
          <ChevronRight
            size={16}
            strokeWidth={2}
          />
        ) : (
          <ChevronLeft
            size={16}
            strokeWidth={2}
          />
        )}
      </button>

      <div className="flex h-full flex-col">
        {/* Navigation */}
        <div
          className="
            min-h-0
            flex-1
            overflow-y-auto

            px-3
            pb-5
            pt-14

            [scrollbar-width:none]
            [&::-webkit-scrollbar]:hidden
          "
        >
          {NAVIGATION_SECTIONS.map((section) => (
            <SidebarSection
              key={section.id}
              section={section}
              collapsed={collapsed}
              unreadNotifications={
                unreadNotifications
              }
              unreadMessages={unreadMessages}
            />
          ))}
        </div>

        {/* User Footer */}
        <div
          className="
            shrink-0
            border-t
            border-white/[0.08]
            p-3
          "
        >
          <NavLink
            to={`/profile/${encodeURIComponent(username)}`}
            aria-label={`Open ${displayName} profile`}
            title={
              collapsed
                ? `@${username}`
                : undefined
            }
            className={`
              flex
              w-full
              items-center
              rounded-xl
              transition

              hover:bg-white/[0.04]

              focus:outline-none
              focus:ring-2
              focus:ring-[#766cff]/50

              ${
                collapsed
                  ? "justify-center py-2"
                  : "gap-3 px-2.5 py-2.5"
              }
            `}
          >
            {avatar ? (
              <img
                src={avatar}
                alt={`${displayName} avatar`}
                className="
                  h-9
                  w-9
                  shrink-0
                  rounded-full
                  border
                  border-white/[0.10]
                  object-cover
                "
              />
            ) : (
              <div
                className="
                  flex
                  h-9
                  w-9
                  shrink-0
                  items-center
                  justify-center

                  rounded-full
                  border
                  border-white/[0.10]
                  bg-[#12171d]
                "
              >
                <UserRound
                  size={17}
                  strokeWidth={1.8}
                  className="text-white/55"
                />
              </div>
            )}

            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-white">
                  {displayName}
                </p>

                <p className="truncate text-[12px] text-[#727b88]">
                  @{username}
                </p>
              </div>
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
  }),
  collapsed: PropTypes.bool,
  onCollapseChange: PropTypes.func,
  unreadNotifications: PropTypes.number,
  unreadMessages: PropTypes.number,
};

export default Sidebar;