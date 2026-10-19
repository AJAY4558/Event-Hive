import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/client';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const res = await api.post('/auth/login', { email, password });
          const { user, accessToken } = res.data;
          localStorage.setItem('eventhive_access_token', accessToken);
          set({ user, accessToken, isAuthenticated: true, isLoading: false });
        } catch (err) {
          set({ isLoading: false, error: err.message });
          throw err;
        }
      },

      register: async (name, email, password, role = 'customer') => {
        set({ isLoading: true, error: null });
        try {
          const res = await api.post('/auth/register', { name, email, password, role });
          const { user, accessToken } = res.data;
          localStorage.setItem('eventhive_access_token', accessToken);
          set({ user, accessToken, isAuthenticated: true, isLoading: false });
        } catch (err) {
          set({ isLoading: false, error: err.message });
          throw err;
        }
      },

      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch {
          // Best-effort — clear local state regardless
        }
        localStorage.removeItem('eventhive_access_token');
        set({ user: null, accessToken: null, isAuthenticated: false, error: null });
      },

      refreshToken: async () => {
        try {
          const res = await api.post('/auth/refresh');
          const { accessToken } = res.data;
          localStorage.setItem('eventhive_access_token', accessToken);
          set({ accessToken, isAuthenticated: true });
          return true;
        } catch {
          localStorage.removeItem('eventhive_access_token');
          set({ user: null, accessToken: null, isAuthenticated: false });
          return false;
        }
      },

      fetchMe: async () => {
        const { accessToken } = get();
        if (!accessToken) return;
        try {
          const res = await api.get('/auth/me');
          set({ user: res.data.user, isAuthenticated: true });
        } catch {
          const refreshed = await get().refreshToken();
          if (refreshed) {
            const res = await api.get('/auth/me');
            set({ user: res.data.user, isAuthenticated: true });
          }
        }
      },

      clearError: () => set({ error: null }),
      setAccessToken: (token) => {
        localStorage.setItem('eventhive_access_token', token);
        set({ accessToken: token, isAuthenticated: true });
      },
    }),
    {
      name: 'eventhive-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
