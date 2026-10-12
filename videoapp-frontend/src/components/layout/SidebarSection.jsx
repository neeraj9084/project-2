import PropTypes from "prop-types";

import SidebarItem from "./SidebarItem";

function SidebarSection({
  section,
  collapsed,
  unreadNotifications,
  unreadMessages,
}) {
  return (
    <section className="mb-7 last:mb-0">
      {!collapsed && (
        <h2
          className="
            mb-3
            px-2

            text-[10px]
            font-semibold
            uppercase
            tracking-[0.20em]

            text-[#59616d]
          "
        >
          {section.label}
        </h2>
      )}

      <nav
        aria-label={`${section.label} navigation`}
        className="space-y-1"
      >
        {section.items.map((item) => (
          <SidebarItem
            key={item.path}
            item={item}
            collapsed={collapsed}
            unreadNotifications={
              unreadNotifications
            }
            unreadMessages={unreadMessages}
          />
        ))}
      </nav>
    </section>
  );
}

SidebarSection.propTypes = {
  section: PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    items: PropTypes.array.isRequired,
  }).isRequired,

  collapsed: PropTypes.bool.isRequired,

  unreadNotifications:
    PropTypes.number.isRequired,

  unreadMessages:
    PropTypes.number.isRequired,
};

export default SidebarSection;