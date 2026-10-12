import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import AppLayout from "../components/layout/AppLayout";

import Profile from "../pages/profile/Profile";

function Home() {
  return (
    <section className="min-h-screen bg-[#08090d] p-6 text-white">
      <h1 className="text-3xl font-bold">
        Home
      </h1>

      <p className="mt-2 text-white/50">
        VideoApp frontend is working 🚀
      </p>
    </section>
  );
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Root */}
        <Route
          path="/"
          element={
            <Navigate
              to="/home"
              replace
            />
          }
        />

        {/* Main Application Layout */}
        <Route element={<AppLayout />}>

          {/* Home */}
          <Route
            path="/home"
            element={<Home />}
          />

          {/* Profile */}
          <Route
            path="/profile/:username"
            element={<Profile />}
          />

        </Route>

        {/* Unknown Route */}
        <Route
          path="*"
          element={
            <Navigate
              to="/home"
              replace
            />
          }
        />

      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;