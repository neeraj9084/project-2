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

  const handleCreate = () => {
    navigate("/upload");
  };

  return (
    <nav
      aria-label="Mobile navigation"
      className="
        fixed
        bottom-0
        left-0
        right-0
        z-50
        border-t
        border-white/[0.08]
        bg-[#090c10]/95
        backdrop-blur-xl
        md:hidden
      "
    >
      <div className="mx-auto flex h-[68px] max-w-md items-center justify-around px-2">
        {/* Home */}
        <MobileNavItem
          item={NAV_ITEMS[0]}
        />

        {/* Search */}
        <MobileNavItem
          item={NAV_ITEMS[1]}
        />

        {/* Create */}
        <button
          type="button"
          onClick={handleCreate}
          aria-label="Create"
          className="
            flex
            h-11
            w-11
            items-center
            justify-center

            rounded-full

            bg-[#776cff]
            text-white

            shadow-[0_0_20px_rgba(119,108,255,0.18)]

            transition

            hover:brightness-110
            active:scale-95

            focus:outline-none
            focus:ring-2
            focus:ring-[#8d85ff]/60
          "
        >
          <Plus
            size={25}
            strokeWidth={1.8}
          />
        </button>

        {/* Notifications */}
        <MobileNavItem
          item={NAV_ITEMS[2]}
          notificationCount={
            notificationCount
          }
        />

        {/* Profile */}
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

  return (
    <NavLink
      to={item.path}
      end={item.id === "home"}
      aria-label={item.label}
      className={({ isActive }) => `
        relative
        flex
        min-w-[58px]
        flex-col
        items-center
        justify-center
        gap-1
        rounded-xl
        px-2
        py-1.5

        transition

        focus:outline-none
        focus:ring-2
        focus:ring-[#766cff]/50

        ${
          isActive
            ? "text-[#8b82ff]"
            : "text-white/45 hover:text-white/80"
        }
      `}
    >
      {({ isActive }) => (
        <>
          <span className="relative">
            <Icon
              size={20}
              strokeWidth={
                isActive ? 2.2 : 1.8
              }
            />

            {item.id ===
              "notifications" &&
              notificationCount > 0 && (
                <span
                  className="
                    absolute
                    -right-2
                    -top-2

                    flex
                    min-h-4
                    min-w-4

                    items-center
                    justify-center

                    rounded-full
                    bg-[#ff3850]

                    px-1

                    text-[8px]
                    font-bold
                    leading-none
                    text-white

                    ring-2
                    ring-[#090c10]
                  "
                >
                  {notificationCount > 99
                    ? "99+"
                    : notificationCount}
                </span>
              )}
          </span>

          <span
            className={`
              text-[10px]
              font-medium
              ${
                isActive
                  ? "text-[#8b82ff]"
                  : "text-white/40"
              }
            `}
          >
            {item.label}
          </span>

          {isActive && (
            <span
              className="
                absolute
                bottom-0
                h-0.5
                w-5
                rounded-full
                bg-[#766cff]
              "
            />
          )}
        </>
      )}
    </NavLink>
  );
}

MobileBottomNav.propTypes = {
  profilePath: PropTypes.string,
  notificationCount: PropTypes.number,
};

export default MobileBottomNav;