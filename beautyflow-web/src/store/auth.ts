import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  empresaId: string;
  empresaSlug: string;
  modulos?: string[];
  /** true = la contraseña se la asignó otra persona (dueño de empresa
   * nueva, o empleado con acceso recién creado) — ProtectedRoute bloquea
   * el resto de la app hasta que la cambie desde CambiarPasswordObligatorio. */
  debeChangePassword?: boolean;
}

export interface AuthEmpresa {
  id: string;
  nombre: string;
  slug: string;
  verticales?: string[];
  /** Candado de PIN para anular ventas (Parte B) — true = el modal de
   * "Anular venta" debe exigir el PIN además del motivo. */
  pinAnulacionActivo?: boolean;
  /** % de ITBIS de la empresa (0 si no es contribuyente DGII). Usado por
   * el POS para estimar el total antes de cobrar. */
  itbisPct?: number;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  empresa: AuthEmpresa | null;
  isAuthenticated: boolean;
  setSession: (payload: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
    empresa: AuthEmpresa;
    /** Dónde vive la sesión en este dispositivo:
     * 'session' → sobrevive una recarga (F5) pero se pierde al cerrar la
     *             pestaña/app (sessionStorage) — es el caso normal del
     *             login por contraseña, marque o no "Recordar mi correo"
     *             (ese checkbox ya NO decide esto, ver LoginPage.tsx).
     * 'local'   → persiste entre cierres/reaperturas hasta que expire el
     *             refresh token (7 días) o se cierre sesión manualmente
     *             (localStorage) — exclusivo del login biométrico.
     * Por defecto 'session', que es el comportamiento correcto para
     * cualquier llamada que no lo especifique (login por contraseña). */
    persist?: 'session' | 'local';
  }) => void;
  setUser: (user: AuthUser) => void;
  setEmpresa: (empresa: AuthEmpresa) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

const STORAGE_KEY = 'bf-auth';

// A qué storage escribir en la PRÓXIMA operación de persist — lo fija
// `setSession` explícitamente en cada login, y lo vuelve a fijar `getItem`
// al hidratar (para que un refresh de token posterior, vía `setTokens`,
// seguya escribiendo en el mismo lugar de donde se leyó la sesión activa).
let writeTarget: 'session' | 'local' = 'session';

/** Storage real: sessionStorage para el login por contraseña, localStorage
 * para el biométrico — ver `AuthState.setSession.persist`. Al leer, prioriza
 * sessionStorage (la sesión de ESTA pestaña) y si no hay nada ahí cae a
 * localStorage (una sesión biométrica de larga duración). */
const dynamicStorage: StateStorage = {
  getItem: (name) => {
    try {
      const enSession = sessionStorage.getItem(name);
      if (enSession !== null) {
        writeTarget = 'session';
        return enSession;
      }
      const enLocal = localStorage.getItem(name);
      if (enLocal !== null) {
        writeTarget = 'local';
        return enLocal;
      }
      return null;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      (writeTarget === 'local' ? localStorage : sessionStorage).setItem(name, value);
    } catch {
      /* Safari en modo privado con storage lleno, etc. — la sesión sigue
       * funcionando en memoria durante esta pestaña, solo no persiste. */
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
      sessionStorage.removeItem(name);
    } catch {
      /* noop */
    }
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      empresa: null,
      isAuthenticated: false,

      setSession: ({ accessToken, refreshToken, user, empresa, persist = 'session' }) => {
        writeTarget = persist;
        set({ accessToken, refreshToken, user, empresa, isAuthenticated: true });
      },

      setUser: (user) => set({ user }),

      setEmpresa: (empresa) => set({ empresa }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      logout: () => {
        try {
          localStorage.removeItem(STORAGE_KEY);
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* noop */
        }
        writeTarget = 'session';
        set({ accessToken: null, refreshToken: null, user: null, empresa: null, isAuthenticated: false });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => dynamicStorage),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
        empresa: s.empresa,
        isAuthenticated: s.isAuthenticated,
      }),
    },
  ),
);
