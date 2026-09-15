import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { rutaInicial, puedeVer } from '../../lib/modulos';
import styles from './SinAccesoPage.module.css';

// Cuánto esperar entre reintentos propios de esta pantalla si el refresco
// de módulos de ProtectedRoute no llegó a tiempo (o falló en silencio, ej.
// una conexión de celular inestable) — unos pocos reintentos cortos son
// suficientes: si el problema es de verdad un permiso faltante, esto no
// encuentra nada nuevo y la pantalla se queda como corresponde.
const REINTENTOS = [800, 2000, 4000];

export function SinAccesoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const modulos = useAuthStore((s) => s.user?.modulos ?? []);

  // Autocuración: `ModuloRoute` llega aquí con un `<Navigate replace>`, así
  // que si esto se mostró por un módulo TRANSITORIAMENTE vacío o incompleto
  // (ej. justo tras un login, mientras el store de auth todavía está
  // hidratando, o un instante antes de que llegue el refresco silencioso de
  // módulos en ProtectedRoute) el usuario quedaba atascado en esta pantalla
  // para siempre — nada volvía a evaluar la ruta original una vez que los
  // módulos correctos llegaban, porque `ModuloRoute` ya se había
  // desmontado. Acá sí seguimos escuchando `modulos` reactivamente: en
  // cuanto la ruta de la que nos echaron vuelve a ser válida, se vuelve
  // sola sin que el usuario tenga que hacer nada.
  useEffect(() => {
    const rutaOriginal = (location.state as { from?: string } | null)?.from;
    if (rutaOriginal && puedeVer(modulos, rutaOriginal)) {
      navigate(rutaOriginal, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulos]);

  // Refresco PROPIO de módulos, independiente del que ya intenta
  // ProtectedRoute en segundo plano — esta pantalla solo se llega a montar
  // si ese refresco todavía no corrigió nada, así que no hay que confiar
  // en que un único intento (de cualquiera de los dos lados) alcance: si
  // falló por lo que sea (ej. una conexión inestable), sin esto nadie
  // vuelve a intentarlo y la persona queda atascada para siempre, sin
  // ningún aviso de que el sistema lo sigue intentando.
  useEffect(() => {
    let cancelado = false;
    const intentar = async () => {
      for (const espera of REINTENTOS) {
        if (cancelado) return;
        await new Promise((r) => setTimeout(r, espera));
        if (cancelado) return;
        try {
          const { data } = await api.get('/auth/me');
          const current = useAuthStore.getState().user;
          if (!current || cancelado) return;
          useAuthStore.getState().setUser({ ...current, modulos: data.modulos ?? [] });
          return; // el useEffect de arriba reacciona solo si esto cambió algo
        } catch {
          // sigue al próximo reintento de la lista
        }
      }
    };
    intentar();
    return () => { cancelado = true; };
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.iconWrap}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>

        <h1 className={styles.title}>Acceso restringido</h1>

        <p className={styles.body}>
          No tienes acceso a esta sección. Si crees que es un error, habla
          con el administrador del negocio.
        </p>

        <button
          className={styles.btn}
          onClick={() => navigate(rutaInicial(modulos))}
        >
          Ir a mi inicio
        </button>
      </div>
    </div>
  );
}