import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { puedeVer } from '../lib/modulos';
import styles from './MobileNav.module.css';

type NavItem = {
  key: string;
  label: string;
  path: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Inicio',
    path: '/dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9,22 9,12 15,12 15,22"/>
      </svg>
    ),
  },
  {
    key: 'agenda',
    label: 'Agenda',
    path: '/agenda',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="4" width="18" height="17" rx="2"/>
        <path d="M3 9h18M8 2v4M16 2v4"/>
      </svg>
    ),
  },
  {
    key: 'pos',
    label: 'Caja',
    path: '/pos',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <path d="M2 10h20"/>
      </svg>
    ),
  },
  {
    key: 'clientes',
    label: 'Clientes',
    path: '/clientes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="9" cy="7" r="4"/>
        <path d="M3 21c0-4 3-6 6-6"/>
        <circle cx="17" cy="9" r="3"/>
        <path d="M21 21c0-3-2-5-4-5"/>
      </svg>
    ),
  },
  {
    key: 'mas',
    label: 'Más',
    path: '',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.7">
        <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
        <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
        <circle cx="19" cy="12" r="1.5" fill="currentColor"/>
      </svg>
    ),
  },
];

interface MobileNavProps {
  onMoreClick: () => void;
}

export function MobileNav({ onMoreClick }: MobileNavProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const modulos = useAuthStore((s) => s.user?.modulos);

  const visibles = NAV_ITEMS.filter(
    (item) => item.key === 'mas' || puedeVer(modulos, item.path),
  );

  return (
    <nav className={styles.nav}>
      {visibles.map((item) => {
        const isActive = item.key !== 'mas' && pathname === item.path;
        return (
          <button
            key={item.key}
            className={`${styles.item} ${isActive ? styles.active : ''}`}
            onClick={() => {
              if (item.key === 'mas') {
                onMoreClick();
              } else {
                navigate(item.path);
              }
            }}
          >
            <span className={styles.icon}>{item.icon}</span>
            <span className={styles.label}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}