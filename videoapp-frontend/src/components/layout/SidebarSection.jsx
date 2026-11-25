import PropTypes from "prop-types";
import SidebarItem from "./SidebarItem";

function SidebarSection({
  section,
  collapsed = false,
  unreadNotifications = 0,
  unreadMessages = 0,
}) {
  const items = Array.isArray(section?.items)
    ? section.items
    : [];

  if (items.length === 0) {
    return null;
  }

  return (
    <section
      aria-label={section.label || section.id || "Navigation"}
      className="mb-3 last:mb-0"
    >
      {/* No MAIN, LIBRARY or SOCIAL headings */}
      <div className="space-y-1">
        {items.map((item) => {
          if (!item?.path || !item?.label || !item?.icon) {
            return null;
          }

          return (
            <SidebarItem
              key={item.path}
              item={item}
              collapsed={collapsed}
              unreadNotifications={unreadNotifications}
              unreadMessages={unreadMessages}
            />
          );
        })}
      </div>
    </section>
  );
}

SidebarSection.propTypes = {
  section: PropTypes.shape({
    id: PropTypes.string,
    label: PropTypes.string,
    items: PropTypes.arrayOf(
      PropTypes.shape({
        label: PropTypes.string.isRequired,
        path: PropTypes.string.isRequired,
        icon: PropTypes.elementType.isRequired,
      })
    ),
  }).isRequired,

  collapsed: PropTypes.bool,
  unreadNotifications: PropTypes.number,
  unreadMessages: PropTypes.number,
};

export default SidebarSection;