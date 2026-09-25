import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { MobileBrandHeader } from '../components/MobileBrandHeader';
import { MobileNav } from '../components/MobileNav';
import { MobileMoreSheet } from '../components/MobileMoreSheet';
import styles from './AppLayout.module.css';

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Resumen de hoy' },
  '/agenda': { title: 'Agenda', subtitle: 'Citas del día' },
  '/pos': { title: 'Caja / POS', subtitle: 'Punto de venta' },
  '/clientes': { title: 'Clientes', subtitle: 'CRM' },
  '/inventario': { title: 'Inventario', subtitle: 'Productos y stock' },
  '/reportes':   { title: 'Reportes',   subtitle: 'Análisis y exportación' },
  '/comisiones': { title: 'Comisiones', subtitle: 'Liquidación de comisiones' },
  '/ajustes': { title: 'Ajustes', subtitle: 'Datos del negocio y notificaciones' },
};

export function AppLayout() {
  const { pathname } = useLocation();
  const meta = PAGE_TITLES[pathname] ?? { title: 'Estixa' };
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <Sidebar />
      <MobileBrandHeader />
      <div className={styles.main}>
        <Topbar title={meta.title} subtitle={meta.subtitle} />
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
      <MobileNav onMoreClick={() => setMoreOpen(true)} />
      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
