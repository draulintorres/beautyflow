import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PortalAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  nombre: string | null;
  setTokens: (a: string, r: string) => void;
  setNombre: (n: string) => void;
  logout: () => void;
}

export const usePortalAuth = create<PortalAuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      nombre: null,
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setNombre: (nombre) => set({ nombre }),
      logout: () => set({ accessToken: null, refreshToken: null, nombre: null }),
    }),
    { name: 'bf-portal-auth' }
  )
);
