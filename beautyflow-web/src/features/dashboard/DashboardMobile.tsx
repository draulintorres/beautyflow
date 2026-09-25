import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { formatMoney, initiales } from '../../lib/format';
import styles from './DashboardMobile.module.css';

interface Kpis {
  ventasHoy: number; numVentasHoy: number; ventasMes: number;
  citasHoy: number; clientesNuevos: number; clientesVip: number;
  cuentasPorCobrar: number; ticketPromedio: number; porcentajeOcupacion: number;
}
interface Rankings {
  topEmpleados: { empleadoId: string; nombre: string; ingresos: number; comisiones: number }[];
  comisionesPendientes: number;
  comisionesPendientesDetalle: { empleadoId: string; nombre: string; monto: number }[];
  comisionesPendientesSinAsignar: number;
  topClientes: { clienteId: string; nombre: string; gastoTotal: number }[];
  empleadosReales: number;
}
interface ServicioVendido { id: string; nombre: string; cantidad: number; total: number }
interface SucursalLite { sucursalId: string; nombre: string; }
interface Cita {
  id: string;
  horaInicio: string;
  horaFin: string;
  estado: string;
  cliente: { id: string; nombre: string };
  empleado: { id: string; nombre: string };
  servicios: { servicioId: string; nombre: string; precio: number }[];
}

interface Props {
  kpis: Kpis | undefined;
  rankings: Rankings | undefined;
  /** Mismos datos que ya calcula `graficas.serviciosMasVendidos` para el
   *  donut de escritorio — se reutilizan acá para el bloque que reemplaza
   *  a "Top empleados"/"Comisiones pendientes" cuando no hay staff real. */
  serviciosMasVendidos?: ServicioVendido[];
  /** Lista de sucursales para el selector (solo llega si aplica: OWNER,
   *  módulo sucursales, >1 sucursal activa). undefined = no mostrar selector. */
  sucursales?: SucursalLite[];
  /** sucursal seleccionada, null = "Todas". */
  sucSel: string | null;
  onSelSucursal: (id: string | null) => void;
}

const ESTADO_COLOR: Record<string, string> = {
  CONFIRMADA:  'var(--ok)',
  PROGRAMADA:  'var(--info)',
  PENDIENTE:   'var(--warn)',
  EN_PROGRESO: 'var(--info)',
  EN_PROCESO:  'var(--info)',
  COMPLETADA:  'var(--muted)',
  FINALIZADA:  'var(--muted)',
  CANCELADA:   'var(--err)',
  NO_ASISTIO:  'var(--err)',
};

const ESTADO_LABEL: Record<string, string> = {
  CONFIRMADA:  'Confirmada',
  PROGRAMADA:  'Programada',
  PENDIENTE:   'Pendiente',
  EN_PROGRESO: 'En progreso',
  EN_PROCESO:  'En proceso',
  COMPLETADA:  'Completada',
  FINALIZADA:  'Finalizada',
  CANCELADA:   'Cancelada',
  NO_ASISTIO:  'No asistió',
};

function fmtEstado(estado: string): string {
  const label = ESTADO_LABEL[estado];
  if (label) return label;
  // Fallback: "EN_PROCESO" → "En proceso"
  return estado.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DashboardMobile({ kpis, rankings, serviciosMasVendidos, sucursales, sucSel, onSelSucursal }: Props) {
  const user    = useAuthStore(s => s.user);
  const empresa = useAuthStore(s => s.empresa);
  const navigate = useNavigate();

  // Mientras la empresa no tenga ningún empleado real contratado (solo el
  // Empleado fantasma del dueño, esCuentaDueno=true, que no cuenta acá —
  // ver dashboard.service.ts rankings()), "Top empleados"/"Comisiones
  // pendientes" siempre van a estar vacíos estructuralmente. Se reemplazan
  // por "Servicios más vendidos", útil para cualquier negocio.
  const tieneEmpleados = (rankings?.empleadosReales ?? 0) > 0;
  const maxSvc = Math.max(1, ...(serviciosMasVendidos ?? []).map(s => s.cantidad));

  // "Citas de hoy" también se filtra a la sucursal elegida (para el OWNER),
  // así calza con el contador "Citas hoy" de arriba.
  const { data: citas } = useQuery<Cita[]>({
    queryKey: ['citas-hoy-mobile', todayStr(), sucSel],
    queryFn: () =>
      api
        .get(`/citas?fecha=${todayStr()}${sucSel ? `&sucursalId=${sucSel}` : ''}`)
        .then(r => r.data),
  });

  const mostrarTabSucursales = !!sucursales && sucursales.length > 1;
  const sucSelNombre = sucSel ? sucursales?.find(s => s.sucursalId === sucSel)?.nombre : null;

  const hora    = new Date().getHours();
  const saludo  = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';
  const fechaHoy = new Date().toLocaleDateString('es-DO', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className={styles.mobile}>

      {/* ─── Header ─── */}
      <div className={styles.header}>
        <div className={styles.greet}>
          <span className={styles.saludoTxt}>{saludo},</span>
          <span className={styles.nameTxt}>{user?.nombre?.split(' ')[0]}</span>
        </div>
        <div className={styles.avatar}>{initiales(user?.nombre ?? 'U')}</div>
      </div>

      {/* ─── Empresa + fecha ─── */}
      <div className={styles.metaRow}>
        <div className={styles.empresaChip}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <polyline points="9,22 9,12 15,12 15,22"/>
          </svg>
          {empresa?.nombre ?? 'Beauty Glam'}
        </div>
        <div className={styles.fechaChip}>{fechaHoy}</div>
      </div>

      {/* ─── Selector de sucursal (solo OWNER) — controla TODO el Dashboard ─── */}
      {mostrarTabSucursales && (
        <div className={styles.sucTabsWrap}>
          <div className={styles.sucTabs}>
            <button
              type="button"
              className={`${styles.sucTab} ${sucSel === null ? styles.sucTabActivo : ''}`}
              onClick={() => onSelSucursal(null)}
            >
              Todas
            </button>
            {sucursales!.map(s => (
              <button
                key={s.sucursalId}
                type="button"
                className={`${styles.sucTab} ${sucSel === s.sucursalId ? styles.sucTabActivo : ''}`}
                onClick={() => onSelSucursal(s.sucursalId)}
              >
                {s.nombre}
              </button>
            ))}
          </div>
          {sucSelNombre && (
            <div className={styles.sucHint}>Viendo solo <b>{sucSelNombre}</b></div>
          )}
        </div>
      )}

      {/* ─── KPIs ─── */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Ventas hoy</div>
          <div className={styles.kpiVal}>RD$ {formatMoney(kpis?.ventasHoy ?? 0)}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Citas hoy</div>
          <div className={styles.kpiVal}>{kpis?.citasHoy ?? 0}</div>
        </div>
        {/* "Ticket prom." se ocultó a pedido de Draulin (confunde a
            clientes/testers) — el cálculo sigue viniendo en kpis.ticketPromedio,
            solo se dejó de renderizar. "Ventas mes" pasa a ocupar las dos
            columnas para no dejar el hueco de la tarjeta que faltaría. */}
        <div className={`${styles.kpiCard} ${styles.kpiCardWide}`}>
          <div className={styles.kpiLabel}>Ventas mes</div>
          <div className={styles.kpiVal}>RD$ {formatMoney(kpis?.ventasMes ?? 0)}</div>
        </div>
      </div>

      {/* ─── Citas del día ─── */}
      <div className={styles.section}>
        <div className={styles.secHead}>
          <span className={styles.secTitle}>Citas de hoy</span>
          {citas && <span className={styles.secCount}>{citas.length}</span>}
        </div>
        {(!citas || citas.length === 0) ? (
          <div className={styles.empty}>Sin citas programadas para hoy</div>
        ) : (
          <div className={styles.citaList}>
            {citas.slice(0, 8).map(c => (
              <div key={c.id} className={styles.citaCard}>
                <div className={styles.citaTime}>{c.horaInicio}</div>
                <div className={styles.citaBody}>
                  <div className={styles.citaTop}>
                    <div className={styles.citaAv}>{initiales(c.cliente.nombre)}</div>
                    <div className={styles.citaInfo}>
                      <div className={styles.citaNombre}>{c.cliente.nombre}</div>
                      <div className={styles.citaSvc}>
                        {c.servicios.map(s => s.nombre).join(', ')}
                      </div>
                    </div>
                  </div>
                  <div className={styles.citaBot}>
                    <span className={styles.citaEmp}>{c.empleado.nombre.split(' ')[0]}</span>
                    <span
                      className={styles.citaBadge}
                      style={{ color: ESTADO_COLOR[c.estado] }}
                    >
                      {fmtEstado(c.estado)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {tieneEmpleados ? (
        <>
          {/* ─── Top empleados ─── */}
          <div className={styles.section}>
            <div className={styles.secHead}>
              <span className={styles.secTitle}>Top empleados</span>
            </div>
            {(rankings?.topEmpleados ?? []).length === 0 ? (
              <div className={styles.empty}>Sin datos de empleados aún</div>
            ) : (
              <div className={styles.empList}>
                {rankings!.topEmpleados.slice(0, 3).map((e, i) => (
                  <div key={e.empleadoId} className={styles.empRow}>
                    <span className={styles.empPos}>{i + 1}</span>
                    <div className={styles.empAv}>{initiales(e.nombre)}</div>
                    <span className={styles.empNm}>{e.nombre.split(' ')[0]}</span>
                    <span className={styles.empAmt}>RD$ {formatMoney(e.ingresos)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Comisiones pendientes ─── */}
          <div className={styles.section}>
            <div className={styles.secHead}>
              <span className={styles.secTitle}>Comisiones pendientes</span>
              <button type="button" className={styles.verMas} onClick={() => navigate('/comisiones')}>
                Ver detalle →
              </button>
            </div>
            <div className={styles.commTotal}>RD$ {formatMoney(rankings?.comisionesPendientes ?? 0)}</div>
            <div className={styles.commSub}>Total por pagar a empleados</div>
            {(rankings?.comisionesPendientesDetalle ?? []).length === 0 ? (
              <div className={styles.empty}>Sin comisiones pendientes</div>
            ) : (
              <div className={styles.commList}>
                {rankings!.comisionesPendientesDetalle.map(c => (
                  <div key={c.empleadoId} className={styles.commRow}>
                    <span className={styles.commNm}>{c.nombre}</span>
                    <span className={styles.commAmt}>RD$ {formatMoney(c.monto)}</span>
                  </div>
                ))}
                {(rankings?.comisionesPendientesSinAsignar ?? 0) > 0 && (
                  <div className={styles.commRow}>
                    <span className={styles.commNm} style={{ color: 'var(--muted)' }}>Sin empleado asignado</span>
                    <span className={styles.commAmt}>RD$ {formatMoney(rankings!.comisionesPendientesSinAsignar)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        /* ─── Servicios más vendidos (reemplaza Top empleados/Comisiones
             mientras la empresa no tenga ningún empleado real) ─── */
        <div className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.secTitle}>Servicios más vendidos</span>
          </div>
          {(serviciosMasVendidos ?? []).length === 0 ? (
            <div className={styles.empty}>Aún no hay ventas registradas</div>
          ) : (
            <div className={styles.rankList}>
              {serviciosMasVendidos!.slice(0, 5).map(s => (
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
        </div>
      )}

      <div className={styles.navSpacer} />
    </div>
  );
}
