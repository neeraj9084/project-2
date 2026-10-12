import PropTypes from "prop-types";
import { NavLink } from "react-router-dom";

function SidebarItem({
  item,
  collapsed,
  unreadNotifications,
  unreadMessages,
}) {
  const Icon = item.icon;

  let badgeCount = 0;

  if (item.path === "/notifications") {
    badgeCount = unreadNotifications;
  }

  if (item.path === "/messages") {
    badgeCount = unreadMessages;
  }

  return (
    <NavLink
      to={item.path}
      end={item.path === "/home"}
      title={
        collapsed
          ? item.label
          : undefined
      }
      className={({ isActive }) => `
        group/item
        relative
        flex
        items-center

        rounded-[12px]

        transition-all
        duration-200

        focus:outline-none
        focus:ring-2
        focus:ring-[#766cff]/50

        ${
          collapsed
            ? "justify-center py-3"
            : "gap-3 px-2.5 py-3"
        }

        ${
          isActive
            ? "bg-[#1a142b] text-white"
            : "text-[#737b87] hover:bg-white/[0.035] hover:text-white"
        }
      `}
    >
      {({ isActive }) => (
        <>
          {/* Active indicator */}
          {isActive && !collapsed && (
            <span
              aria-hidden="true"
              className="
                absolute
                left-0
                top-1/2
                h-7
                w-[2px]
                -translate-y-1/2
                rounded-full
                bg-[#766cff]
              "
            />
          )}

          {/* Icon */}
          <span className="relative flex shrink-0 items-center justify-center">
            <Icon
              size={20}
              strokeWidth={
                isActive ? 2 : 1.8
              }
            />

            {collapsed &&
              badgeCount > 0 && (
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
                  "
                >
                  {badgeCount > 99
                    ? "99+"
                    : badgeCount}
                </span>
              )}
          </span>

          {/* Label */}
          {!collapsed && (
            <>
              <span
                className="
                  min-w-0
                  flex-1
                  truncate
                  text-[13px]
                  font-medium
                "
              >
                {item.label}
              </span>

              {badgeCount > 0 && (
                <span
                  className="
                    flex
                    min-h-5
                    min-w-5

                    items-center
                    justify-center

                    rounded-full
                    bg-[#ff3850]

                    px-1.5

                    text-[9px]
                    font-bold
                    leading-none
                    text-white
                  "
                >
                  {badgeCount > 99
                    ? "99+"
                    : badgeCount}
                </span>
              )}
            </>
          )}
        </>
      )}
    </NavLink>
  );
}

SidebarItem.propTypes = {
  item: PropTypes.shape({
    label: PropTypes.string.isRequired,
    path: PropTypes.string.isRequired,
    icon: PropTypes.elementType.isRequired,
  }).isRequired,

  collapsed: PropTypes.bool.isRequired,

  unreadNotifications:
    PropTypes.number.isRequired,

  unreadMessages:
    PropTypes.number.isRequired,
};

export default SidebarItem;