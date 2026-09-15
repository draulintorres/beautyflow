import { useNavigate } from 'react-router-dom';
import { PortalShell } from './PortalShell';
import { PortalNav } from './PortalNav';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import styles from './PortalPlaceholder.module.css';

export function PortalPuntosPage() {
  const navigate = useNavigate();
  return (
    <PortalShell>
      <div className={styles.page}>
        <div className={styles.header}>
          <button className={styles.back} onClick={() => navigate('/portal')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <h1>Mis puntos</h1>
          <ThemeToggleButton className={styles.themeBtn} />
        </div>
        <div className={styles.body}>
          <div className={styles.coming}>
            <div className={styles.ico}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 17l3-9 4 5 2-8 2 8 4-5 3 9z"/>
              </svg>
            </div>
            <p>Próximamente</p>
            <small>El historial de puntos llegará en la siguiente entrega</small>
          </div>
        </div>
        <PortalNav active="puntos" />
      </div>
    </PortalShell>
  );
}
