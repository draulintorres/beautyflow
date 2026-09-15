import { create } from 'zustand';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'bf-theme';

/**
 * Preferencia de tema: SOLO localStorage, por dispositivo — nunca se manda
 * al backend ni se liga a la cuenta (a propósito: es preferencia visual
 * personal, no configuración de negocio). Por defecto siempre "dark", el
 * mismo tema que existía antes de esto — un dispositivo nuevo, o el mismo
 * usuario en otro dispositivo, siempre arranca en oscuro hasta elegir.
 */
function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    // localStorage puede fallar (modo privado estricto, storage bloqueado) —
    // el default oscuro es un fallback seguro, igual que el comportamiento
    // previo a este cambio.
    return 'dark';
  }
}

function applyTheme(theme: Theme) {
  // data-theme en <html>: tokens.css redefine las variables de color bajo
  // :root[data-theme="light"]. También el bug ya resuelto del <select> en
  // blanco depende de esto — color-scheme cambia junto con el tema en
  // tokens.css usando este mismo atributo.
  document.documentElement.setAttribute('data-theme', theme);
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* si falla el guardado, el tema igual se aplica para esta sesión */
    }
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}));

// Aplica el tema guardado ni bien carga este módulo. El script inline en
// index.html ya puso el atributo ANTES del primer paint (evita el flash);
// esto solo mantiene el estado de React en sync con el DOM real.
applyTheme(useThemeStore.getState().theme);
