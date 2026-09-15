import axios from 'axios';
import { useAuthStore } from '../store/auth';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Descarga/abre un PDF autenticado.
 * - El fetch va por axios (con el header Authorization) — un <a href> o
 *   window.open directo al endpoint daría 401, por eso se trae como blob.
 * - iOS Safari NO soporta el atributo `download` en blobs: el <a download>
 *   simplemente no hace nada visible ahí (aunque funciona en desktop y
 *   Android). Por eso abrimos el PDF en una pestaña nueva — el visor nativo
 *   de PDF de cada plataforma ya trae su propio botón de guardar/compartir.
 * - La pestaña se abre de forma SÍNCRONA (antes del await) para que el
 *   navegador no la bloquee como pop-up; una vez llega el blob, se le
 *   asigna la URL.
 */
export async function downloadPdf(url: string, filename: string) {
  const win = window.open('', '_blank');
  try {
    const res = await api.get(url, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const href = URL.createObjectURL(blob);
    if (win) {
      win.location.href = href;
    } else {
      // Pop-up bloqueado: fallback al método de descarga directa (desktop/Android).
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(href), 30000);
  } catch (err) {
    win?.close();
    throw err;
  }
}

/**
 * Comparte un PDF autenticado con la Web Share API (`navigator.share`) —
 * en Android/iOS abre el menú nativo de compartir (WhatsApp, correo, etc.),
 * justo lo que hace falta cuando no hay impresora conectada, que es el caso
 * normal en el celular. Si el navegador no soporta compartir archivos (la
 * mayoría de navegadores de escritorio), cae al comportamiento de
 * `downloadPdf` (abrir en pestaña nueva) como respaldo.
 */
export async function sharePdf(url: string, filename: string, shareTitle?: string) {
  const res = await api.get(url, { responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'application/pdf' });
  const file = new File([blob], filename, { type: 'application/pdf' });

  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data: ShareData) => boolean;
  };

  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: shareTitle });
      return;
    } catch (err) {
      // El usuario canceló el diálogo de compartir — no es un error real.
      if (err instanceof Error && err.name === 'AbortError') return;
      throw err;
    }
  }

  // Sin soporte de compartir archivos (desktop, navegadores viejos): mismo
  // respaldo que downloadPdf — abrir en pestaña nueva.
  const win = window.open('', '_blank');
  const href = URL.createObjectURL(blob);
  if (win) {
    win.location.href = href;
  } else {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(href), 30000);
}

// Promesa de refresh en vuelo. Si múltiples peticiones reciben 401 al mismo
// tiempo (token expirado + React Query refetcheando en background), todas
// esperan esta misma promesa en lugar de disparar su propio /auth/refresh.
// Sin esto, la rotación de tokens hace que solo el primero en llegar al
// backend tenga éxito y los demás reciban "Sesión no válida" → logout.
let pendingRefresh: Promise<{ accessToken: string; refreshToken: string }> | null = null;

/** Lee el auth persistido directo de localStorage (no del store en memoria
 * de esta pestaña) — ver comentario de uso en el interceptor de abajo. */
function leerAuthDeStorage(): { accessToken: string | null; refreshToken: string | null } | null {
  try {
    const raw = localStorage.getItem('bf-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state ?? null;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const { refreshToken, setTokens, logout } = useAuthStore.getState();
      if (refreshToken) {
        try {
          if (!pendingRefresh) {
            pendingRefresh = axios
              .post(`${import.meta.env.VITE_API_URL}/auth/refresh`, { refreshToken })
              .then((r) => r.data)
              .finally(() => { pendingRefresh = null; });
          }
          const data = await pendingRefresh;
          setTokens(data.accessToken, data.refreshToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } catch {
          pendingRefresh = null;
          // El refresh token se invalida al usarse (rotación de un solo
          // uso) — si el usuario tiene la app abierta en dos pestañas o
          // ventanas a la vez (ej. la PWA instalada + una pestaña normal
          // con la misma cuenta), la OTRA pestaña puede haber rotado este
          // mismo refreshToken hace un instante y ya haber guardado uno
          // nuevo en localStorage. El estado en memoria de ESTA pestaña
          // (`useAuthStore.getState()`) no se entera de ese cambio — cada
          // pestaña tiene su propia copia en memoria — así que sin este
          // chequeo esta pestaña cerraría la sesión de todas con
          // `logout()`, pisando una sesión que en realidad seguía siendo
          // válida. Antes de rendirnos, releemos localStorage DIRECTO
          // (fuente de verdad compartida entre pestañas) y reintentamos
          // una sola vez si de verdad cambió.
          const stored = leerAuthDeStorage();
          if (stored?.refreshToken && stored.refreshToken !== refreshToken && !original._retryCrossTab) {
            original._retryCrossTab = true;
            try {
              original.headers.Authorization = `Bearer ${stored.accessToken}`;
              return await api(original);
            } catch {
              logout();
            }
          } else {
            logout();
          }
        }
      } else {
        logout();
      }
    }
    return Promise.reject(error);
  },
);
