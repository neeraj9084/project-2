
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/auth/Login.jsx";
import Register from "./pages/auth/Register.jsx";
import Profile from "./pages/profile/Profile.jsx";
import Home from "./pages/home/Home.jsx";

import AppLayout from "./components/layout/AppLayout.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import VideoDetails from "./pages/video/VideoDetails.jsx";
import CreateMoment from "./pages/moment/CreateMoment.jsx";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            {/* Home */}
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Home />} />

            {/* Own Profile */}
            <Route path="/profile" element={<Profile />} />

            {/* Other User's Public Profile */}
            <Route path="/profile/:userId" element={<Profile />} />

            {/* Video Details */}
            <Route
              path="/video/:videoId"
              element={<VideoDetails />}
            />

            {/* Create Moment */}
            <Route
              path="/moments/create"
              element={<CreateMoment />}
            />
          </Route>
        </Route>

        {/* Unknown Routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
