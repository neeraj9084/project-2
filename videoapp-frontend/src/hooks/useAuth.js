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

  const logout = useCallback(async () => {
    authStore.setLoading(true);

    try {
      await logoutUser();
    } finally {
      authStore.clearAuth();
    }
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    const user = await getCurrentUser();

    authStore.setUser(user);

    return user;
  }, []);

  const refreshAuth = useCallback(async () => {
    const data = await refreshAccessToken();

    if (!data?.accessToken) {
      throw new Error("Access token refresh failed");
    }

    authStore.setAccessToken(data.accessToken);

    return data.accessToken;
  }, []);

  const initializeAuth = useCallback(async () => {
    if (authStore.getState().initialized) {
      return authStore.getState();
    }

    if (initializationPromise) {
      return initializationPromise;
    }

    initializationPromise = (async () => {
      authStore.setLoading(true);

      try {
        const currentToken = authStore.getState().accessToken;

        if (currentToken) {
          try {
            await fetchCurrentUser();
            authStore.setInitialized(true);

            return authStore.getState();
          } catch {
            // Existing access token may have expired.
          }
        }

        try {
          await refreshAuth();
          await fetchCurrentUser();

          authStore.setInitialized(true);

          return authStore.getState();
        } catch {
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

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    initializeAuth();
  }, [initializeAuth]);

  return {
    user: auth.user,
    accessToken: auth.accessToken,
    isAuthenticated: auth.isAuthenticated,
    loading: auth.loading,
    initialized: auth.initialized,

    login,
    logout,
    fetchCurrentUser,
    refreshAuth,
    initializeAuth,
  };
}

export default useAuth;