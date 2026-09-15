import { type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './PortalNav.module.css';

type NavKey = 'inicio' | 'citas' | 'puntos' | 'perfil';

export function PortalNav({ active }: { active: NavKey }) {
  const navigate = useNavigate();

  const items: { key: NavKey; label: string; to: string; icon: ReactElement }[] = [
    {
      key: 'inicio', label: 'Inicio', to: '/portal',
      icon: <svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8M5 9v11h14V9"/></svg>,
    },
    {
      key: 'citas', label: 'Citas', to: '/portal/citas',
      icon: <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18"/></svg>,
    },
    {
      key: 'puntos', label: 'Puntos', to: '/portal/puntos',
      icon: <svg viewBox="0 0 24 24"><path d="M3 17l3-9 4 5 2-8 2 8 4-5 3 9z"/></svg>,
    },
    {
      key: 'perfil', label: 'Perfil', to: '/portal/perfil',
      icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>,
    },
  ];

  return (
    <nav className={styles.nav}>
      {items.map(it => (
        <button
          key={it.key}
          className={`${styles.item} ${active === it.key ? styles.active : ''}`}
          onClick={() => navigate(it.to)}
        >
          <span className={styles.icon}>{it.icon}</span>
          {it.label}
        </button>
      ))}
    </nav>
  );
}
