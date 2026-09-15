import { useNavigate } from 'react-router-dom';
import {
  useNotificacionesLista,
  useMarcarLeida,
  useMarcarTodasLeidas,
  tiempoRelativo,
  type NotificacionInterna,
} from './api';
import styles from './NotificacionesPanel.module.css';

interface NotificacionesPanelProps {
  onNavigated?: () => void;
}

const RUTA_POR_REFERENCIA: Record<string, string> = {
  cita: '/agenda',
  venta: '/pos',
};

export function NotificacionesPanel({ onNavigated }: NotificacionesPanelProps) {
  const { data: notificaciones = [], isLoading } = useNotificacionesLista(true);
  const marcarLeida = useMarcarLeida();
  const marcarTodas = useMarcarTodasLeidas();
  const navigate = useNavigate();

  const hayNoLeidas = notificaciones.some((n) => !n.leidaAt);

  function handleClick(n: NotificacionInterna) {
    if (!n.leidaAt) marcarLeida.mutate(n.id);
    const ruta = n.referenciaTipo ? RUTA_POR_REFERENCIA[n.referenciaTipo] : undefined;
    if (ruta) {
      navigate(ruta);
      onNavigated?.();
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Notificaciones</span>
        {hayNoLeidas && (
          <button
            className={styles.marcarTodas}
            onClick={() => marcarTodas.mutate()}
            disabled={marcarTodas.isPending}
          >
            Marcar todas como leídas
          </button>
        )}
      </div>

      <div className={styles.lista}>
        {isLoading && <div className={styles.estadoVacio}>Cargando…</div>}

        {!isLoading && notificaciones.length === 0 && (
          <div className={styles.estadoVacio}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            <span>No tienes notificaciones</span>
          </div>
        )}

        {notificaciones.map((n) => (
          <button
            key={n.id}
            className={`${styles.item} ${!n.leidaAt ? styles.noLeida : ''}`}
            onClick={() => handleClick(n)}
          >
            <span className={styles.itemDot} />
            <span className={styles.itemBody}>
              <span className={styles.itemTitulo}>{n.titulo}</span>
              <span className={styles.itemCuerpo}>{n.cuerpo}</span>
              <span className={styles.itemTiempo}>{tiempoRelativo(n.createdAt)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
