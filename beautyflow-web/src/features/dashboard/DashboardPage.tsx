import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { formatMoney, initiales } from '../../lib/format';
import { KpiCard } from '../../components/KpiCard';
import { LineChart } from '../../components/LineChart';
import { Donut } from '../../components/Donut';
import type { DonutSegment } from '../../components/Donut';
import { DashboardMobile } from './DashboardMobile';
import styles from './DashboardPage.module.css';

/* ─── tipos de respuesta ─── */
interface Kpis {
  ventasHoy: number; numVentasHoy: number; ventasMes: number;
  citasHoy: number; clientesNuevos: number; clientesVip: number;
  cuentasPorCobrar: number; ticketPromedio: number; porcentajeOcupacion: number;
}
interface Graficas {
  ventas12Meses: { mes: string; total: number }[];
  serviciosMasVendidos: { id: string; nombre: string; cantidad: number; total: number }[];
  productosMasVendidos:  { id: string; nombre: string; cantidad: number; total: number }[];
  formasPago: { metodo: string; total: number; cantidad: number }[];
}
interface ComisionEmpleado { empleadoId: string; nombre: string; monto: number }
interface Rankings {
  topEmpleados: { empleadoId: string; nombre: string; ingresos: number; comisiones: number }[];
  comisionesPendientes: number;
  comisionesPendientesDetalle: ComisionEmpleado[];
  comisionesPendientesSinAsignar: number;
  topClientes: { clienteId: string; nombre: string; gastoTotal: number }[];
}
interface SucursalVentas {
  sucursalId: string; nombre: string; esPrincipal: boolean;
  ventasHoy: number; numVentasHoy: number; ventasMes: number;
}

const CHART_PALETTE = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)',
  'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)',
];

/* Color por método de pago con slot FIJO (el color no cambia si aparece o
   desaparece un método). El backend devuelve el nombre para mostrar
   ("Efectivo", "Transferencia"…), así que se normaliza (mayúsculas, sin
   acentos) antes de buscar. Un método personalizado que no esté en la
   tabla cae a un slot de la paleta por hash de su nombre — estable. */
const PAGO_SLOT: Record<string, string> = {
  EFECTIVO: 'var(--chart-4)',      // dorado/ámbar
  TARJETA: 'var(--chart-1)',       // azul
  TRANSFERENCIA: 'var(--chart-3)', // verde agua
  CREDITO: 'var(--chart-7)',       // violeta
  FIAO: 'var(--chart-7)',
  MIXTO: 'var(--chart-2)',         // naranja
  PUNTOS: 'var(--chart-5)',        // magenta
  'GIFT CARD': 'var(--chart-6)',   // verde
  GIFTCARD: 'var(--chart-6)',
};
function colorMetodoPago(nombre: string): string {
  const key = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  if (PAGO_SLOT[key]) return PAGO_SLOT[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return CHART_PALETTE[h % CHART_PALETTE.length];
}

function RingOcupacion({ pct }: { pct: number }) {
  const r = 26, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      {/* aro de fondo — theme-aware y con suficiente alpha para verse sobre
          el degradado de la KpiCard; antes era blanco 8%, invisible en claro. */}
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--gauge-track)" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--gold)" strokeWidth="7"
        strokeLinecap={pct > 0 ? 'round' : 'butt'}
        strokeDasharray={`${dash.toFixed(1)} ${(circ - dash).toFixed(1)}`}
        transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" fill="var(--text)"
        fontSize="15" fontFamily="Inter" fontWeight="600">{pct}%</text>
    </svg>
  );
}

function Panel({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <h3 className={styles.panelTitle}>{title}</h3>
        {extra}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ msg }: { msg: string }) {
  return <p className={styles.emptyMsg}>{msg}</p>;
}

export function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();

  // Pestaña multi-sucursal (solo OWNER): oculta por completo si no es
  // OWNER, si la empresa no tiene el módulo "sucursales", o si tiene 1 sola
  // sucursal activa. Cuando se elige una sucursal, TODO el Dashboard se
  // filtra a ella (mismo criterio de aislamiento que un usuario no-OWNER).
  const puedeVerSucursales = user?.rol === 'OWNER' && !!user?.modulos?.includes('sucursales');
  const { data: sucursales } = useQuery<SucursalVentas[]>({
    queryKey: ['dashboard-sucursales-lista'],
    queryFn: () => api.get('/dashboard/por-sucursal').then(r => r.data),
    enabled: puedeVerSucursales,
  });
  const [sucSelId, setSucSelId] = useState<string | null>(null); // null = "Todas"
  const mostrarTabSucursales = puedeVerSucursales && (sucursales?.length ?? 0) > 1;
  // Si la sucursal elegida ya no existe (se desactivó), volver a "Todas".
  const sucSel =
    mostrarTabSucursales && sucSelId && sucursales!.some(s => s.sucursalId === sucSelId)
      ? sucSelId
      : null;
  const sucSelNombre = sucSel ? sucursales!.find(s => s.sucursalId === sucSel)?.nombre : null;
  const sucQS = sucSel ? `?sucursalId=${sucSel}` : '';

  // Selector "Este año / Año pasado" de "Ventas de los últimos 12 meses".
  // "actual" = comportamiento de siempre (ventana móvil de los últimos 12
  // meses, sin mandar `anio`); "pasado" = año calendario completo anterior.
  const [anioSel, setAnioSel] = useState<'actual' | 'pasado'>('actual');
  const anioQS = anioSel === 'pasado' ? `anio=${new Date().getFullYear() - 1}` : '';
  const graficasQS = [sucSel && `sucursalId=${sucSel}`, anioQS].filter(Boolean).join('&');

  const { data: kpis, isLoading: kL } = useQuery<Kpis>({
    queryKey: ['dashboard-kpis', sucSel],
    queryFn: () => api.get(`/dashboard/kpis${sucQS}`).then(r => r.data),
  });
  const { data: graficas, isLoading: gL } = useQuery<Graficas>({
    queryKey: ['dashboard-graficas', sucSel, anioSel],
    queryFn: () => api.get(`/dashboard/graficas${graficasQS ? `?${graficasQS}` : ''}`).then(r => r.data),
  });
  const { data: rankings, isLoading: rL } = useQuery<Rankings>({
    queryKey: ['dashboard-rankings', sucSel],
    queryFn: () => api.get(`/dashboard/rankings${sucQS}`).then(r => r.data),
  });

  const loading = kL || gL || rL;

  /* donuts */
  const donutPago: DonutSegment[] = (graficas?.formasPago ?? []).map(f => ({
    label: f.metodo.charAt(0) + f.metodo.slice(1).toLowerCase(),
    value: f.total,
    color: colorMetodoPago(f.metodo),
  }));

  const donutServicios: DonutSegment[] = (graficas?.serviciosMasVendidos ?? [])
    .slice(0, 5)
    .map((s, i) => ({
      label: s.nombre,
      value: s.cantidad,
      color: CHART_PALETTE[i],
    }));

  const maxSvc = Math.max(1, ...(graficas?.serviciosMasVendidos ?? []).map(s => s.cantidad));

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <span className={styles.spinner} />
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando dashboard…</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.mobileOnly}>
        <DashboardMobile
          kpis={kpis}
          rankings={rankings}
          sucursales={mostrarTabSucursales ? sucursales! : undefined}
          sucSel={sucSel}
          onSelSucursal={setSucSelId}
        />
      </div>

      <div className={styles.desktopOnly}>
      <div className={styles.page}>
      {/* ─── Saludo ─── */}
      <div className={styles.greet}>
        <h2>¡Bienvenido, {user?.nombre?.split(' ')[0]}! 👋</h2>
        <p>{sucSelNombre ? `Resumen de ${sucSelNombre}` : 'Resumen general de tu negocio'}</p>
      </div>

      {/* ─── Selector de sucursal (solo OWNER) — controla TODO el Dashboard ─── */}
      {mostrarTabSucursales && (
        <div className={styles.sucTabs}>
          <button
            type="button"
            className={`${styles.sucTab} ${sucSel === null ? styles.sucTabActivo : ''}`}
            onClick={() => setSucSelId(null)}
          >
            Todas las sucursales
          </button>
          {sucursales!.map(s => (
            <button
              key={s.sucursalId}
              type="button"
              className={`${styles.sucTab} ${sucSel === s.sucursalId ? styles.sucTabActivo : ''}`}
              onClick={() => setSucSelId(s.sucursalId)}
            >
              {s.nombre}
            </button>
          ))}
        </div>
      )}

      {/* ─── KPI row 1 ─── */}
      <div className={styles.kpiGrid4}>
        <KpiCard label="Ventas hoy" color="gold"
          value={`RD$ ${formatMoney(kpis?.ventasHoy ?? 0)}`}
          icon={<svg viewBox="0 0 24 24"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}
        />
        <KpiCard label="Citas hoy" color="info"
          value={String(kpis?.citasHoy ?? 0)}
          icon={<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>}
        />
        <KpiCard label="Clientes nuevos" color="ok"
          value={String(kpis?.clientesNuevos ?? 0)}
          icon={<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M3 21c0-4 3-6 6-6M17 8v6M14 11h6"/></svg>}
        />
        <KpiCard label="Cuentas por cobrar" color="warn"
          value={`RD$ ${formatMoney(kpis?.cuentasPorCobrar ?? 0)}`}
          icon={<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>}
        />
      </div>

      {/* ─── KPI row 2 ─── */}
      <div className={styles.kpiGrid2}>
        <KpiCard label="Ticket promedio" color="gold"
          value={`RD$ ${formatMoney(kpis?.ticketPromedio ?? 0)}`}
          icon={<svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h12"/></svg>}
        />
        <KpiCard label="% Ocupación hoy" color="gold"
          value={`${kpis?.porcentajeOcupacion ?? 0}%`}
          icon={<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 14l3-4 3 2 4-6"/></svg>}
          right={<RingOcupacion pct={kpis?.porcentajeOcupacion ?? 0} />}
        />
      </div>

      {/* ─── Línea + Donut categorías ─── */}
      <div className={styles.row2}>
        <Panel title="Ventas de los últimos 12 meses"
          extra={
            <select
              className={styles.sel}
              value={anioSel}
              onChange={e => setAnioSel(e.target.value as 'actual' | 'pasado')}
            >
              <option value="actual">Este año</option>
              <option value="pasado">Año pasado</option>
            </select>
          }>
          <LineChart data={graficas?.ventas12Meses ?? []} />
        </Panel>
        <Panel title="Ventas por categoría">
          <Donut segments={donutServicios} empty="Sin ventas registradas" />
        </Panel>
      </div>

      {/* ─── Top empleados + Servicios + Comisiones ─── */}
      <div className={styles.row3}>
        <Panel title="Top Empleados (ingresos)">
          {(rankings?.topEmpleados ?? []).length === 0
            ? <EmptyRow msg="Sin datos de empleados aún" />
            : (
              <div className={styles.empList}>
                {rankings!.topEmpleados.map((e, i) => (
                  <div key={e.empleadoId} className={styles.empRow}>
                    <span className={styles.empPos}>{i + 1}</span>
                    <div className={styles.empAv}>{initiales(e.nombre)}</div>
                    <span className={styles.empNm}>{e.nombre.split(' ')[0]}</span>
                    <span className={styles.empAmt}>RD${formatMoney(e.ingresos)}</span>
                  </div>
                ))}
              </div>
            )}
        </Panel>

        <Panel title="Servicios más vendidos"
          extra={
            <button type="button" className={styles.more}
              onClick={() => navigate('/reportes?r=servicios-vendidos')}>
              Ver todos →
            </button>
          }>
          {(graficas?.serviciosMasVendidos ?? []).length === 0
            ? <EmptyRow msg="Sin servicios registrados aún" />
            : (
              <div className={styles.rankList}>
                {graficas!.serviciosMasVendidos.slice(0, 5).map(s => (
                  <div key={s.id} className={styles.rankItem}>
                    <span className={styles.rankNm}>{s.nombre}</span>
                    <div className={styles.rankTrack}>
                      <div className={styles.rankFill} style={{ width: `${(s.cantidad / maxSvc) * 100}%` }} />
                    </div>
                    <span className={styles.rankAmt}>{s.cantidad}</span>
                  </div>
                ))}
              </div>
            )}
        </Panel>

        <Panel title="Comisiones pendientes"
          extra={
            <button type="button" className={styles.more}
              onClick={() => navigate('/comisiones')}>
              Ver detalle →
            </button>
          }>
          <div className={styles.commBox}>
            <div className={styles.commBig}>
              RD${formatMoney(rankings?.comisionesPendientes ?? 0)}
            </div>
            <div className={styles.commLbl}>Total por pagar a empleados</div>
            {(rankings?.comisionesPendientesDetalle ?? []).length === 0 ? (
              <EmptyRow msg="Sin comisiones pendientes" />
            ) : (
              <div className={styles.commList}>
                {rankings!.comisionesPendientesDetalle.map(c => (
                  <div key={c.empleadoId} className={styles.commRow}>
                    <span className={styles.commNm}>{c.nombre}</span>
                    <span className={styles.commAmt}>RD${formatMoney(c.monto)}</span>
                  </div>
                ))}
                {(rankings?.comisionesPendientesSinAsignar ?? 0) > 0 && (
                  <div className={styles.commRow}>
                    <span className={styles.commNm} style={{ color: 'var(--muted)' }}>Sin empleado asignado</span>
                    <span className={styles.commAmt}>RD${formatMoney(rankings!.comisionesPendientesSinAsignar)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* ─── Métodos de pago + Resumen del día ─── */}
      <div className={styles.row2}>
        <Panel title="Ventas por método de pago">
          <Donut segments={donutPago} empty="Sin ventas registradas" />
        </Panel>

        <Panel title="Resumen del día">
          <div className={styles.resumen}>
            <div className={styles.resumenList}>
              {[
                { icon: <svg viewBox="0 0 24 24"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>, label: 'Ventas totales', val: `RD$ ${formatMoney(kpis?.ventasHoy ?? 0)}` },
                { icon: <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4"/></svg>, label: 'Citas hoy', val: String(kpis?.citasHoy ?? 0) },
                { icon: <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M3 21c0-4 3-6 6-6"/></svg>, label: 'Clientes nuevos', val: String(kpis?.clientesNuevos ?? 0) },
                { icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>, label: 'Ventas del mes', val: `RD$ ${formatMoney(kpis?.ventasMes ?? 0)}` },
                { icon: <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-8 0v2M9 7a4 4 0 108 0"/></svg>, label: 'Clientes VIP', val: String(kpis?.clientesVip ?? 0) },
              ].map(r => (
                <div key={r.label} className={styles.resumenRow}>
                  <span className={styles.resumenIcon}>{r.icon}</span>
                  <span>{r.label}</span>
                  <b className={styles.resumenVal}>{r.val}</b>
                </div>
              ))}
            </div>
            <div className={styles.metaRing}>
              <RingOcupacion pct={kpis?.porcentajeOcupacion ?? 0} />
              <div className={styles.metaPct}>Meta diaria</div>
              <small className={styles.metaSub}>Ocupación del día</small>
            </div>
          </div>
        </Panel>
      </div>
    </div>
    </div>
    </>
  );
}
