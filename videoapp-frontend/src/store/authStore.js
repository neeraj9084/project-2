import { useSyncExternalStore } from "react";

const ACCESS_TOKEN_KEY = "accessToken";

const getStoredToken = () => {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
};

let state = {
  user: null,
  accessToken: getStoredToken(),
  isAuthenticated: Boolean(getStoredToken()),
  loading: false,
  initialized: false,
};

const listeners = new Set();

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

const updateState = (updates) => {
  state = {
    ...state,
    ...updates,
  };

  emitChange();
};

export const authStore = {
  // -----------------------------
  // READ CURRENT STATE
  // -----------------------------
  getState: () => state,

  // -----------------------------
  // SUBSCRIBE TO STATE CHANGES
  // -----------------------------
  subscribe: (listener) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },

  // -----------------------------
  // LOGIN / SET AUTH
  // -----------------------------
  setAuth: ({ user, accessToken }) => {
    if (accessToken) {
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    }

    updateState({
      user: user ?? null,
      accessToken: accessToken ?? null,
      isAuthenticated: Boolean(accessToken),
      loading: false,
      initialized: true,
    });
  },

  // -----------------------------
  // UPDATE USER
  // -----------------------------
  setUser: (user) => {
    updateState({
      user: user ?? null,
    });
  },

  // -----------------------------
  // UPDATE ACCESS TOKEN
  // -----------------------------
  setAccessToken: (accessToken) => {
    if (accessToken) {
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    }

    updateState({
      accessToken: accessToken ?? null,
      isAuthenticated: Boolean(accessToken),
    });
  },

  // -----------------------------
  // LOADING STATE
  // -----------------------------
  setLoading: (loading) => {
    updateState({
      loading: Boolean(loading),
    });
  },

  // -----------------------------
  // INITIALIZATION
  // -----------------------------
  setInitialized: (initialized = true) => {
    updateState({
      initialized: Boolean(initialized),
    });
  },

  // -----------------------------
  // LOGOUT / CLEAR AUTH
  // -----------------------------
  clearAuth: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);

    updateState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      loading: false,
      initialized: true,
    });
  },

  logout: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);

    updateState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      loading: false,
      initialized: true,
    });
  },
};

// React hook
export const useAuthStore = () => {
  return useSyncExternalStore(
    authStore.subscribe,
    authStore.getState,
    authStore.getState
  );
};