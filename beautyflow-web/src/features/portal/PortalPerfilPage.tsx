import { useNavigate } from 'react-router-dom';
import { PortalShell } from './PortalShell';
import { PortalNav } from './PortalNav';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import styles from './PortalPlaceholder.module.css';

export function PortalPerfilPage() {
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
          <h1>Mi perfil</h1>
          <ThemeToggleButton className={styles.themeBtn} />
        </div>
        <div className={styles.body}>
          <div className={styles.coming}>
            <div className={styles.ico}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
              </svg>
            </div>
            <p>Próximamente</p>
            <small>La edición de perfil llegará en la siguiente entrega</small>
          </div>
        </div>
        <PortalNav active="perfil" />
      </div>
    </PortalShell>
  );
}
