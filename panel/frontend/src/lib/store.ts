"use client";

import { create } from "zustand";
import api from "./api";

interface AuthState {
  user: { userId: number; username: string } | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  login: async (username, password) => {
    const { data } = await api.post("/auth/login", { username, password });
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    const me = await api.get("/auth/me");
    set({ user: me.data, loading: false });
  },
  logout: () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    set({ user: null, loading: false });
    window.location.href = "/login";
  },
  checkAuth: async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      set({ user: null, loading: false });
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
}));
