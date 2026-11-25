
import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Sidebar from "./Sidebar";
import MainContent from "./MainContent";
import MobileHeader from "./MobileHeader";
import MobileBottomNav from "./MobileBottomNav";

function AppLayout() {
  const [sidebarHovered, setSidebarHovered] = useState(false);

  const location = useLocation();
  const isProfilePage = location.pathname === "/profile";

  const sidebarWidth = sidebarHovered
    ? "w-[248px]"
    : "w-[76px]";

  return (
    <div className="min-h-screen bg-[#f8fafc] text-gray-900">
      {/* Desktop layout — no top navbar */}
      <div className="hidden h-screen p-1 lg:block">
        <div className="flex h-full min-h-0 overflow-hidden rounded-2xl border border-gray-200 bg-white">

          {/* Sidebar expands on hover */}
          <div
            className={`
              relative z-20 h-full shrink-0
              transition-[width] duration-300
              ease-[cubic-bezier(0.22,1,0.36,1)]
              ${sidebarWidth}
            `}
          >
            <Sidebar
              user={undefined}
              collapsed={true}
              hovered={sidebarHovered}
              onHoverChange={setSidebarHovered}
            />
          </div>

          {/* Main content */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f8fafc]">
            <MainContent>
              <Outlet />
            </MainContent>
          </div>
        </div>
      </div>

      {/* Mobile and tablet — no desktop sidebar */}
      <div className="min-h-screen bg-[#f8fafc] lg:hidden">
        {!isProfilePage && (
          <MobileHeader title="VideoApp" />
        )}

        <main className="min-h-screen overflow-x-hidden bg-[#f8fafc] pb-[76px]">
          <Outlet />
        </main>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default AppLayout;
