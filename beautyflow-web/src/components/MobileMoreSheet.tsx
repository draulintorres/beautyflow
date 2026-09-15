import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';
import { puedeVer } from '../lib/modulos';
import { useNotificacionesContador } from '../features/notificaciones/api';
import { NotificacionesPanel } from '../features/notificaciones/NotificacionesPanel';
import styles from './MobileMoreSheet.module.css';

interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
}

const SECCIONES = [
  {
    label: 'Cobros',
    path: '/cuentas-por-cobrar',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <line x1="2" y1="10" x2="22" y2="10"/>
        <line x1="6" y1="15" x2="10" y2="15"/>
      </svg>
    ),
  },
  {
    label: 'Inventario',
    path: '/inventario',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M20 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
        <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
      </svg>
    ),
  },
  {
    label: 'Catálogo',
    path: '/catalogo',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <path d="M14 4h7M14 8h4M14 15h7M14 19h4"/>
      </svg>
    ),
  },
  {
    label: 'Reportes',
    path: '/reportes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    label: 'Equipo',
    path: '/equipo',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
  {
    label: 'Comisiones',
    path: '/comisiones',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
      </svg>
    ),
  },
  {
    label: 'Usuarios',
    path: '/usuarios',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
        <path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
  },
  {
    label: 'Sucursales',
    path: '/sucursales',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    label: 'Ajustes',
    path: '/ajustes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    ),
  },
  {
    label: 'Auditoría',
    path: '/auditoria',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
    ),
  },
];

export function MobileMoreSheet({ open, onClose }: MobileMoreSheetProps) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const empresa = useAuthStore((s) => s.empresa);
  const { data } = useNotificacionesContador();
  const noLeidas = data?.noLeidas ?? 0;
  const [showNotif, setShowNotif] = useState(false);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const initiales = (nombre: string) =>
    nombre.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  function go(path: string) {
    navigate(path);
    onClose();
  }

  function handleClose() {
    setShowNotif(false);
    onClose();
  }

  if (!open) return null;

  if (showNotif) {
    return (
      <>
        <div className={styles.backdrop} onClick={handleClose} />
        <div className={styles.sheet}>
          <div className={styles.handle} />
          <div className={styles.notifHeader}>
            <button className={styles.backBtn} onClick={() => setShowNotif(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          </div>
          <NotificacionesPanel onNavigated={handleClose} />
        </div>
      </>
    );
  }

  const visibles = SECCIONES.filter((s) => puedeVer(user?.modulos, s.path));

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.sheet}>
        <div className={styles.handle} />

        <div className={styles.userRow}>
          <div className={styles.avatar}>
            {user?.nombre ? initiales(user.nombre) : 'U'}
          </div>
          <div className={styles.userInfo}>
            <div className={styles.userName}>{user?.nombre}</div>
            <div className={styles.userRole}>{empresa?.nombre}</div>
          </div>
        </div>

        {/* Tema claro/oscuro: preferencia personal, universal — visible para
            cualquier rol, sin importar los módulos que tenga (a diferencia
            de la sección "Módulos" de abajo). */}
        <div className={styles.section}>
          <button className={styles.item} onClick={toggleTheme}>
            <span className={styles.itemIcon}>
              {theme === 'dark' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.5 14.3A8.5 8.5 0 019.7 3.5a8.5 8.5 0 1010.8 10.8z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4.5" />
                  <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
                </svg>
              )}
            </span>
            <span className={styles.itemLabel}>Apariencia</span>
            <span className={styles.themeState}>{theme === 'dark' ? 'Oscuro' : 'Claro'}</span>
          </button>
        </div>

        <div className={styles.section}>
          <button className={styles.item} onClick={() => setShowNotif(true)}>
            <span className={styles.itemIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
            </span>
            <span className={styles.itemLabel}>Notificaciones</span>
            {noLeidas > 0 && (
              <span className={styles.notifBadge}>{noLeidas > 9 ? '9+' : noLeidas}</span>
            )}
            <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        {visibles.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Módulos</div>
            {visibles.map((s) => (
              <button key={s.path} className={styles.item} onClick={() => go(s.path)}>
                <span className={styles.itemIcon}>{s.icon}</span>
                <span className={styles.itemLabel}>{s.label}</span>
                <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            ))}
          </div>
        )}

        <div className={styles.section}>
          <button
            className={`${styles.item} ${styles.danger}`}
            onClick={() => { logout(); onClose(); }}
          >
            <span className={styles.itemIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </span>
            <span className={styles.itemLabel}>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </>
  );
}