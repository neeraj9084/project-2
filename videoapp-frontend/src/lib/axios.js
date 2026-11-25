import axios from "axios";

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    "http://localhost:8000/api/v1",
  withCredentials: true,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const url = config.url || "";

    const isLoginRequest = url.includes("/auth/login");
    const isRefreshRequest = url.includes("/auth/refresh-token");

    if (!isLoginRequest && !isRefreshRequest) {
      const token = localStorage.getItem("accessToken");

      config.headers = config.headers || {};

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      } else {
        delete config.headers.Authorization;
      }
    }

    console.log("API URL:", config.url);
    console.log(
      "Access token available:",
      Boolean(localStorage.getItem("accessToken"))
    );
    console.log(
      "Authorization header exists:",
      Boolean(config.headers?.Authorization)
    );

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("API request failed:", {
      status: error.response?.status,
      url: error.config?.url,
      message:
        error.response?.data?.message || error.message,
    });

    return Promise.reject(error);
  }
);

export default api;