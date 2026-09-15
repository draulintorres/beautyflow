import type { ReactNode } from 'react';
import styles from './PortalShell.module.css';

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.stage}>
      <div className={styles.phone}>
        <div className={styles.screen}>{children}</div>
      </div>
    </div>
  );
}
