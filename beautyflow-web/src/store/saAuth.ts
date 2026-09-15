import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SAAdmin {
  id: string;
  nombre: string;
  email: string;
}

interface SAAuthState {
  accessToken: string | null;
  admin: SAAdmin | null;
  isAuthenticated: boolean;
  setSession: (accessToken: string, admin: SAAdmin) => void;
  logout: () => void;
}

export const useSAAuthStore = create<SAAuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      admin: null,
      isAuthenticated: false,
      setSession: (accessToken, admin) => set({ accessToken, admin, isAuthenticated: true }),
      logout: () => set({ accessToken: null, admin: null, isAuthenticated: false }),
    }),
    {
      name: 'bf-sa-auth',
      partialize: (s) => ({
        accessToken: s.accessToken,
        admin: s.admin,
        isAuthenticated: s.isAuthenticated,
      }),
    },
  ),
);
