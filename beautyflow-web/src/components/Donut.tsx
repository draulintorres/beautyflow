import styles from './Donut.module.css';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  segments: DonutSegment[];
  size?: number;
  empty?: string;
}

export function Donut({ segments, size = 130, empty = 'Sin datos' }: DonutProps) {
  const total = segments.reduce((s, g) => s + g.value, 0);
  const isEmpty = total === 0;

  const pcts: DonutSegment[] = isEmpty
    ? [{ label: empty, value: 100, color: 'var(--chart-track)' }]
    : segments.map(s => ({ ...s, value: (s.value / total) * 100 }));

  // Separación fina (color de la superficie) entre segmentos, para que se
  // distingan aunque dos colores queden contiguos. Circunferencia ≈ 100u.
  const GAP = isEmpty || pcts.length < 2 ? 0 : 0.9;

  let offset = 25;
  const circles = pcts.map((s, i) => {
    const on = Math.max(0, s.value - GAP);
    const el = (
      <circle key={i} cx="21" cy="21" r="15.9"
        fill="none" stroke={s.color} strokeWidth="6"
        strokeDasharray={`${on.toFixed(1)} ${(100 - on).toFixed(1)}`}
        strokeDashoffset={offset}
      />
    );
    offset = (offset - s.value + 100) % 100;
    return el;
  });

  return (
    <div className={styles.wrap}>
      <svg width={size} height={size} viewBox="0 0 42 42" className={styles.svg}>
        <circle cx="21" cy="21" r="15.9" fill="none"
          stroke="var(--chart-track)" strokeWidth="6" />
        {circles}
      </svg>
      <div className={styles.legend}>
        {isEmpty ? (
          <span className={styles.empty}>{empty}</span>
        ) : (
          segments.map(s => (
            <div key={s.label} className={styles.item}>
              <span className={styles.dot} style={{ background: s.color }} />
              <span className={styles.lbl}>{s.label}</span>
              <b className={styles.pct}>
                {((s.value / total) * 100).toFixed(0)}%
              </b>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
