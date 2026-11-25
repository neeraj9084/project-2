import PropTypes from "prop-types";
import { NavLink } from "react-router-dom";

function formatCount(count) {
  const value = Number(count) || 0;

  if (value <= 0) return "";
  if (value > 99) return "99+";

  return String(value);
}

function SidebarItem({
  item,
  collapsed = false,
  unreadNotifications = 0,
  unreadMessages = 0,
}) {
  const Icon = item?.icon;

  if (!Icon || !item?.path || !item?.label) {
    return null;
  }

  const badgeCount =
    item.path === "/notifications"
      ? unreadNotifications
      : item.path === "/messages"
        ? unreadMessages
        : 0;

  const badgeText = formatCount(badgeCount);

  return (
    <NavLink
      to={item.path}
      end={item.path === "/home"}
      title={collapsed ? item.label : undefined}
      aria-label={
        badgeCount > 0
          ? `${item.label}, ${badgeText} unread`
          : item.label
      }
      className={({ isActive }) =>
        `
          group/item relative flex h-10 w-full min-w-0
          items-center overflow-hidden rounded-xl border
          transition-all duration-200 ease-out

          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-violet-400/60

          ${
            collapsed
              ? "justify-center px-0"
              : "gap-2 px-2"
          }

          ${
            isActive
              ? "border-violet-300/15 bg-gradient-to-r from-violet-400/[0.15] to-white/[0.025] text-white"
              : "border-transparent text-white/55 hover:border-white/[0.07] hover:bg-white/[0.045] hover:text-white/90"
          }
        `
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              aria-hidden="true"
              className="
                absolute bottom-2 left-0 top-2
                w-[2px] rounded-r-full
                bg-violet-400
                shadow-[0_0_8px_rgba(167,139,250,0.5)]
              "
            />
          )}

          {/* Icon */}
          <span
            className={`
              relative flex h-8 w-8 shrink-0
              items-center justify-center rounded-lg
              transition-colors duration-200
              ${
                isActive
                  ? "text-violet-200"
                  : "text-current group-hover/item:text-white"
              }
            `}
          >
            <Icon
              size={19}
              strokeWidth={isActive ? 1.9 : 1.7}
              aria-hidden="true"
            />

            {collapsed && badgeCount > 0 && (
              <span
                aria-hidden="true"
                className="
                  absolute right-0 top-0
                  h-2 w-2 rounded-full
                  bg-violet-400
                  ring-2 ring-[#101019]
                "
              />
            )}
          </span>

          {/* Label and badge */}
          {!collapsed && (
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate whitespace-nowrap text-xs font-medium">
                {item.label}
              </span>

              {badgeCount > 0 && (
                <span
                  className="
                    inline-flex shrink-0 items-center justify-center
                    rounded-full border border-violet-300/15
                    bg-violet-400/[0.12]
                    px-1.5 py-0.5
                    text-[10px] font-semibold leading-none
                    text-violet-200
                  "
                >
                  {badgeText}
                </span>
              )}
            </span>
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

  collapsed: PropTypes.bool,
  unreadNotifications: PropTypes.number,
  unreadMessages: PropTypes.number,
};

export default SidebarItem;