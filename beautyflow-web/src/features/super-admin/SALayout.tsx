import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSAAuthStore } from '../../store/saAuth';
import styles from './SALayout.module.css';

const NAV = [
  {
    to: '/admin/dashboard',
    label: 'Vista global',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 11l9-8 9 8M5 9v11h14V9" />
      </svg>
    ),
  },
  {
    to: '/admin/empresas',
    label: 'Empresas',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="2" y="7" width="20" height="15" rx="2" />
        <path d="M16 7V5a2 2 0 00-4 0v2M8 7V5a2 2 0 00-4 0v2" />
        <path d="M12 12v5M9 14h6" />
      </svg>
    ),
  },
  {
    to: '/admin/planes',
    label: 'Planes SaaS',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
      </svg>
    ),
  },
  {
    to: '/admin/facturacion',
    label: 'Facturación',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4M14 15h4" />
      </svg>
    ),
  },
];

export function SALayout() {
  const { admin, logout } = useSAAuthStore();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/admin/login', { replace: true });
  }

  const initials = admin?.nombre
    ? admin.nombre.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'SA';

  return (
    <div className={styles.app}>

      {/* ── Topbar mobile: solo visible <=720px, el sidebar de abajo se
          oculta ahí y esta es la única forma de navegar entre módulos. ── */}
      <header className={styles.mobileTopbar}>
        <button
          className={styles.hamburger}
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <div className={styles.brand}>
          <div className={styles.mark}>E</div>
          <div className={styles.brandText}><b>Estixa</b></div>
        </div>
      </header>

      {mobileOpen && (
        <div className={styles.backdrop} onClick={() => setMobileOpen(false)} />
      )}

      {/* ── Sidebar (drawer en mobile) ── */}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.brand}>
          <div className={styles.mark}>E</div>
          <div className={styles.brandText}>
            <b>Estixa</b>
          </div>
        </div>

        <span className={styles.adminTag}>★ SUPER ADMIN</span>

        <nav className={styles.nav}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                isActive ? `${styles.navLink} ${styles.active}` : styles.navLink
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidefoot}>
          <div className={styles.sideUser}>
            <div className={styles.av}>{initials}</div>
            <div className={styles.col}>
              <b>{admin?.nombre ?? 'Admin'}</b>
              <small>{admin?.email ?? ''}</small>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout} title="Cerrar sesión">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Contenido principal ── */}
      <main className={styles.main}>
        <Outlet />
      </main>

    </div>
  );
}
