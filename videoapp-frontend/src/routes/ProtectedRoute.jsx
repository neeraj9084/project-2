import { Navigate, Outlet, useLocation } from "react-router-dom";

import useAuth from "../hooks/useAuth";

function ProtectedRoute() {
  const {
    isAuthenticated,
    loading,
    initialized,
  } = useAuth();

  const location = useLocation();

  // Auth state abhi check ho rahi hai
  if (!initialized || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#040608] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#7567ff]" />

          <p className="text-sm text-white/60">
            Checking authentication...
          </p>
        </div>
      </div>
    );
  }

  // User authenticated nahi hai
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  // User authenticated hai
  return <Outlet />;
}

export default ProtectedRoute;