import { mesCorto } from '../lib/format';

interface Point { mes: string; total: number; }

const W = 600, H = 200, PAD = 10;

function buildPath(data: Point[]) {
  const vals = data.map(d => d.total);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;

  return vals.map((v, i) => {
    const x = PAD + (i * (W - 2 * PAD) / (vals.length - 1));
    const y = H - PAD - ((v - min) / range) * (H - 2 * PAD - 20);
    return [x, y] as [number, number];
  });
}

export function LineChart({ data }: { data: Point[] }) {
  if (!data.length) return null;
  const pts = buildPath(data);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W - PAD} ${H - PAD} L${PAD} ${H - PAD} Z`;
  const allZero = data.every(d => d.total === 0);

  return (
    <div style={{ position: 'relative' }}>
      {allZero && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted)', fontSize: '13px', pointerEvents: 'none',
        }}>
          Sin ventas registradas aún
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ width: '100%', height: '200px', display: 'block' }}>
        <defs>
          <linearGradient id="lcgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(201,162,75,.28)" />
            <stop offset="1" stopColor="rgba(201,162,75,0)" />
          </linearGradient>
        </defs>
        {!allZero && <path d={area} fill="url(#lcgrad)" />}
        <path d={line} fill="none" stroke="var(--gold)" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" opacity={allZero ? 0.15 : 1} />
        {pts.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="2.6"
              fill="var(--surface)" stroke="var(--gold)" strokeWidth="1.6" opacity={allZero ? 0.3 : 1} />
            <title>{data[i].mes}: RD$ {data[i].total.toLocaleString()}</title>
          </g>
        ))}
      </svg>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '6px 10px 0', fontSize: '10px', color: 'var(--muted)',
        fontFamily: 'var(--font-mono)',
      }}>
        {data.map(d => <span key={d.mes}>{mesCorto(d.mes)}</span>)}
      </div>
    </div>
  );
}
