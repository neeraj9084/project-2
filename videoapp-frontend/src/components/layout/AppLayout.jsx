import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import MainContent from "./MainContent";
import MobileHeader from "./MobileHeader";
import MobileBottomNav from "./MobileBottomNav";

function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const location = useLocation();

  const isProfilePage = location.pathname === "/profile";

  const handleSidebarToggle = () => {
    setSidebarCollapsed((current) => !current);
  };

  return (
    <div className="min-h-screen bg-[#040608] text-white">
      {/* ================= DESKTOP ================= */}
      <div className="hidden h-screen p-[4px] md:block">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#070a0e]">
          <div className="shrink-0">
            <Navbar onMenuClick={handleSidebarToggle} />
          </div>

          <div className="flex min-h-0 flex-1">
            <div
              className={`shrink-0 transition-[width] duration-300 ease-in-out ${
                sidebarCollapsed ? "w-[72px]" : "w-[198px]"
              }`}
            >
              <Sidebar
                collapsed={sidebarCollapsed}
                onCollapseChange={setSidebarCollapsed}
              />
            </div>

            <MainContent>
              <Outlet />
            </MainContent>
          </div>
        </div>
      </div>

      {/* ================= MOBILE ================= */}
      <div className="min-h-screen md:hidden">
        {!isProfilePage && <MobileHeader title="VideoApp" />}

        <main className="min-h-screen overflow-x-hidden bg-[#05070a] pb-[76px]">
          <Outlet />
        </main>

        <MobileBottomNav />
      </div>
    </div>
  );
}

export default AppLayout;