import { useCallback, useEffect, useRef } from "react";

import {
  loginUser,
  logoutUser,
  refreshAccessToken,
} from "../services/auth/authApi";

import { getCurrentUser } from "../services/user/userApi";

import { authStore, useAuthStore } from "../store/authStore";

let initializationPromise = null;

function useAuth() {
  const auth = useAuthStore();
  const initializedRef = useRef(false);

  // ----------------------------------
  // LOGIN
  // ----------------------------------
  const login = useCallback(async (loginData) => {
    authStore.setLoading(true);

    try {
      const data = await loginUser(loginData);

      if (!data?.accessToken || !data?.user) {
        throw new Error("Invalid login response");
      }

      authStore.setAuth({
        user: data.user,
        accessToken: data.accessToken,
      });

      return data;
    } catch (error) {
      authStore.setLoading(false);
      throw error;
    }
  }, []);

  // ----------------------------------
  // LOGOUT
  // ----------------------------------
  const logout = useCallback(async () => {
    authStore.setLoading(true);

    try {
      await logoutUser();
    } finally {
      // Backend fail hone par bhi local auth clear hoga
      authStore.clearAuth();
    }
  }, []);

  // ----------------------------------
  // GET CURRENT USER
  // ----------------------------------
  const fetchCurrentUser = useCallback(async () => {
    const user = await getCurrentUser();

    authStore.setUser(user);

    return user;
  }, []);

  // ----------------------------------
  // REFRESH ACCESS TOKEN
  // ----------------------------------
  const refreshAuth = useCallback(async () => {
    const data = await refreshAccessToken();

    if (!data?.accessToken) {
      throw new Error("Access token refresh failed");
    }

    authStore.setAccessToken(data.accessToken);

    return data.accessToken;
  }, []);

  // ----------------------------------
  // INITIALIZE AUTH
  // ----------------------------------
  const initializeAuth = useCallback(async () => {
    if (authStore.getState().initialized) {
      return authStore.getState();
    }

    // Prevent duplicate requests
    if (initializationPromise) {
      return initializationPromise;
    }

    initializationPromise = (async () => {
      authStore.setLoading(true);

      try {
        const currentToken = authStore.getState().accessToken;

        // --------------------------------
        // 1. Existing access token
        // --------------------------------
        if (currentToken) {
          try {
            await fetchCurrentUser();

            authStore.setInitialized(true);

            return authStore.getState();
          } catch (error) {
            // Token may have expired.
          }
        }

        // --------------------------------
        // 2. Try refresh token cookie
        // --------------------------------
        try {
          await refreshAuth();
          await fetchCurrentUser();

          authStore.setInitialized(true);

          return authStore.getState();
        } catch (refreshError) {
          // No valid session
          authStore.clearAuth();

          return authStore.getState();
        }
      } finally {
        initializationPromise = null;
        authStore.setLoading(false);
        authStore.setInitialized(true);
      }
    })();

    return initializationPromise;
  }, [fetchCurrentUser, refreshAuth]);

  // ----------------------------------
  // INITIAL AUTH CHECK
  // ----------------------------------
  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;

    initializeAuth();
  }, [initializeAuth]);

  return {
    // State
    user: auth.user,
    accessToken: auth.accessToken,
    isAuthenticated: auth.isAuthenticated,
    loading: auth.loading,
    initialized: auth.initialized,

    // Actions
    login,
    logout,
    fetchCurrentUser,
    refreshAuth,
    initializeAuth,
  };
}

export default useAuth;