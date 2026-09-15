import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { useNotificacionesContador } from '../features/notificaciones/api';
import { NotificacionesPanel } from '../features/notificaciones/NotificacionesPanel';
import { ThemeToggleButton } from './ThemeToggleButton';
import styles from './Topbar.module.css';

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const user = useAuthStore((s) => s.user);
  const { data } = useNotificacionesContador();
  const noLeidas = data?.noLeidas ?? 0;
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      <div className={styles.right}>
        <ThemeToggleButton />
        <div className={styles.bellWrapper} ref={wrapperRef}>
          <button
            className={styles.iconBtn}
            title="Notificaciones"
            onClick={() => setOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {noLeidas > 0 && (
              <span className={styles.badge}>{noLeidas > 9 ? '9+' : noLeidas}</span>
            )}
          </button>
          {open && (
            <div className={styles.dropdown}>
              <NotificacionesPanel onNavigated={() => setOpen(false)} />
            </div>
          )}
        </div>
        <div className={styles.userChip}>
          <div className={styles.avatar}>
            {user?.nombre?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          <span className={styles.userName}>{user?.nombre}</span>
        </div>
      </div>
    </header>
  );
}
