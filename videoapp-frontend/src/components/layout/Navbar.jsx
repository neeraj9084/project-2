import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  Bell,
  ChevronDown,
  Menu,
  Plus,
  Search,
  UserRound,
} from "lucide-react";

const DEFAULT_USER = {
  fullName: "Neeraj Saini",
  username: "neeraj@11",
  avatar: "",
};

function Navbar({
  user = DEFAULT_USER,
  notificationCount = 0,
  onMenuClick,
}) {
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  const displayName =
    user?.fullName || DEFAULT_USER.fullName;

  const username =
    user?.username || DEFAULT_USER.username;

  const avatar =
    user?.avatar || "";

  const handleSearchSubmit = (event) => {
    event.preventDefault();

    const query = searchQuery.trim();

    if (!query) return;

    navigate(
      `/search?q=${encodeURIComponent(query)}`
    );
  };

  const handleCreate = () => {
    navigate("/upload");
  };

  const handleNotifications = () => {
    navigate("/notifications");
  };

  const handleProfile = () => {
    if (!username) return;

    navigate(
      `/profile/${encodeURIComponent(username)}`
    );

    setProfileOpen(false);
  };

  return (
    <nav
      aria-label="Main navigation"
      className="
        sticky
        top-0
        z-50
        h-[72px]
        w-full
        border-b
        border-white/[0.07]
        bg-[#080c10]/95
        backdrop-blur-xl
      "
    >
      <div
        className="
          flex
          h-full
          w-full
          items-center
          px-5
          lg:px-6
        "
      >
        {/* =====================================
            LEFT SIDE
        ====================================== */}
        <div className="flex shrink-0 items-center gap-4">
          {/* Menu */}
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Toggle sidebar"
            className="
              flex
              h-10
              w-10
              items-center
              justify-center
              rounded-xl
              text-white/80
              transition
              hover:bg-white/[0.05]
              hover:text-white
              focus:outline-none
              focus:ring-2
              focus:ring-[#766cff]/50
            "
          >
            <Menu
              size={24}
              strokeWidth={1.8}
            />
          </button>

          {/* Logo */}
          <Link
            to="/home"
            aria-label="VideoApp home"
            className="
              flex
              shrink-0
              items-center
              gap-2
            "
          >
            <span
              className="
                flex
                h-[38px]
                w-[38px]
                items-center
                justify-center
                rounded-[11px]
                bg-gradient-to-br
                from-[#786dff]
                to-[#6268ff]
                shadow-[0_0_18px_rgba(112,103,255,0.18)]
              "
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px] fill-white"
                aria-hidden="true"
              >
                <path d="M8.5 5c-.7-.42-1.5.08-1.5.9v12.2c0 .82.8 1.32 1.5.9l10.2-6.1a1.02 1.02 0 0 0 0-1.8L8.5 5Z" />
              </svg>
            </span>

            <span
              className="
                text-[19px]
                font-semibold
                tracking-[-0.02em]
                text-white
              "
            >
              VideoApp
            </span>
          </Link>
        </div>

        {/* =====================================
            CENTER SEARCH
        ====================================== */}
        <div
  className="
    mx-auto
    hidden
    w-full
    max-w-[680px]
    px-5
    md:block
  "

        >
          <form
            onSubmit={handleSearchSubmit}
            role="search"
          >
            <div className="relative">
              <Search
                size={19}
                strokeWidth={1.8}
                className="
                  pointer-events-none
                  absolute
                  left-4
                  top-1/2
                  -translate-y-1/2
                  text-[#6f7885]
                "
              />

              <input
                type="search"
                value={searchQuery}
                onChange={(event) =>
                  setSearchQuery(event.target.value)
                }
                placeholder="Search videos, users..."
                aria-label="Search videos and users"
                className="
                  h-[52px]
                  w-full
                  rounded-full
                  border
                  border-[#26313b]
                  bg-[#10161c]
                  pl-11
                  pr-[62px]
                  text-[14px]
                  text-white
                  outline-none
                  placeholder:text-[#717a86]
                  transition
                  focus:border-[#33414e]
                  focus:ring-0
                "
              />

              {/* Search Button */}
              <button
                type="submit"
                aria-label="Search"
                className="
                  absolute
                  right-0
                  top-0
                  flex
                  h-[52px]
                  w-[64px]
                  items-center
                  justify-center
                  rounded-r-full
                  border-l
                  border-[#26313b]
                  text-white/80
                  transition
                  hover:bg-white/[0.04]
                  hover:text-white
                "
              >
                <Search
                  size={21}
                  strokeWidth={1.8}
                />
              </button>
            </div>
          </form>
        </div>

        {/* =====================================
            RIGHT SIDE
        ====================================== */}
        <div className="ml-auto flex shrink-0 items-center gap-3">
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
              focus:outline-none
              focus:ring-2
              focus:ring-[#8c83ff]/60
            "
          >
            <Plus
              size={25}
              strokeWidth={1.8}
            />
          </button>

          {/* Notification */}
          <button
            type="button"
            onClick={handleNotifications}
            aria-label="Notifications"
            className="
              relative
              flex
              h-10
              w-10
              items-center
              justify-center
              rounded-xl
              text-white/85
              transition
              hover:bg-white/[0.05]
              hover:text-white
              focus:outline-none
              focus:ring-2
              focus:ring-[#766cff]/50
            "
          >
            <Bell
              size={24}
              strokeWidth={1.8}
            />

            {notificationCount > 0 && (
              <span
                className="
                  absolute
                  right-0.5
                  top-0.5
                  flex
                  h-4
                  min-w-4
                  items-center
                  justify-center
                  rounded-full
                  bg-[#ff3850]
                  px-1
                  text-[8px]
                  font-bold
                  text-white
                  ring-2
                  ring-[#080c10]
                "
              >
                {notificationCount > 99
                  ? "99+"
                  : notificationCount}
              </span>
            )}
          </button>

          {/* Profile */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setProfileOpen(
                  (value) => !value
                )
              }
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
              className="
                flex
                items-center
                rounded-xl
                p-1
                transition
                hover:bg-white/[0.05]
                focus:outline-none
                focus:ring-2
                focus:ring-[#766cff]/50
              "
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt={`${displayName} avatar`}
                  className="
                    h-10
                    w-10
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
                    h-10
                    w-10
                    items-center
                    justify-center
                    rounded-full
                    border
                    border-white/[0.10]
                    bg-[#151b21]
                  "
                >
                  <UserRound
                    size={19}
                    strokeWidth={1.8}
                    className="text-white/70"
                  />
                </div>
              )}

              <ChevronDown
                size={16}
                strokeWidth={1.8}
                className={`
                  ml-1
                  hidden
                  text-white/45
                  transition
                  lg:block
                  ${
                    profileOpen
                      ? "rotate-180"
                      : ""
                  }
                `}
              />
            </button>

            {profileOpen && (
              <div
                className="
                  absolute
                  right-0
                  top-[50px]
                  w-56
                  overflow-hidden
                  rounded-2xl
                  border
                  border-white/[0.08]
                  bg-[#11161c]
                  p-2
                  shadow-2xl
                  shadow-black/50
                "
              >
                <button
                  type="button"
                  onClick={handleProfile}
                  className="
                    w-full
                    rounded-xl
                    px-3
                    py-2.5
                    text-left
                    text-sm
                    text-white/75
                    transition
                    hover:bg-white/[0.05]
                    hover:text-white
                  "
                >
                  Profile
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigate("/settings");
                    setProfileOpen(false);
                  }}
                  className="
                    w-full
                    rounded-xl
                    px-3
                    py-2.5
                    text-left
                    text-sm
                    text-white/75
                    transition
                    hover:bg-white/[0.05]
                    hover:text-white
                  "
                >
                  Settings
                </button>

                <div className="my-1 border-t border-white/[0.07]" />

                <button
                  type="button"
                  onClick={() =>
                    setProfileOpen(false)
                  }
                  className="
                    w-full
                    rounded-xl
                    px-3
                    py-2.5
                    text-left
                    text-sm
                    text-red-400
                    transition
                    hover:bg-red-500/[0.08]
                  "
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

Navbar.propTypes = {
  user: PropTypes.shape({
    fullName: PropTypes.string,
    username: PropTypes.string,
    avatar: PropTypes.string,
  }),
  notificationCount: PropTypes.number,
  onMenuClick: PropTypes.func,
};

export default Navbar;