import type { ReactNode } from 'react';
import styles from './KpiCard.module.css';

interface KpiCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  color?: 'gold' | 'info' | 'ok' | 'warn';
  delta?: { value: string; up: boolean };
  right?: ReactNode;
}

export function KpiCard({ label, value, icon, color = 'gold', delta, right }: KpiCardProps) {
  return (
    <div className={`${styles.card} ${right ? styles.wide : ''}`}>
      <div className={styles.left}>
        <div className={styles.top}>
          <div className={`${styles.ico} ${styles[color]}`}>{icon}</div>
          <div className={styles.label}>{label}</div>
        </div>
        <div className={styles.val}>{value}</div>
        {delta && (
          <div className={`${styles.delta} ${delta.up ? styles.up : styles.down}`}>
            {delta.up ? '↑' : '↓'} {delta.value}
          </div>
        )}
      </div>
      {right && <div className={styles.right}>{right}</div>}
    </div>
  );
}
