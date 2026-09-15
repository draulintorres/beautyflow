import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { saApi } from '../../lib/saApi';
import { formatMoney } from '../../lib/format';
import styles from './SADashboardPage.module.css';

/* ─── Tipos ──────────────────────────────────────────────── */
interface DashboardData {
  empresasActivas: number;
  empresasSuspendidas: number;
  nuevasEsteMes: number;
  ingresosMensualesSaaS: number;
  facturasVencidas: number;
  planesMasVendidos: Array<{ nombre: string; count: number }>;
}

interface Empresa {
  id: string;
  nombre: string;
  slug: string;
  estado: string;       // "ACTIVE" | "SUSPENDED" | "CANCELED"
  plan: string | null;  // nombre del plan (plano, no anidado)
  planEstado?: string;
  usuarios: number;
  sucursales: number;
  empleados: number;
  createdAt: string;
}

/* ─── Helpers ─────────────────────────────────────────────── */
const PLAN_CLASS: Record<string, string> = {
  // por nombre del plan (shape real del API)
  Trial:  styles.plTrial,
  Básico: styles.plBasic,
  Pro:    styles.plPro,
  // fallback por tipo legacy
  TRIAL: styles.plTrial,
  BASIC: styles.plBasic,
  PRO:   styles.plPro,
  ENTERPRISE: styles.plPro,
};

const ESTADO_CLASS: Record<string, string> = {
  ACTIVE:    styles.stAct,
  SUSPENDED: styles.stSusp,
  CANCELED:  styles.stSusp,
};

function initials(nombre: string) {
  return nombre.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

const AVATAR_COLORS = [
  'linear-gradient(135deg,#E4CB8A,#a07f33)',
  'linear-gradient(135deg,#8b6fc7,#54447a)',
  'linear-gradient(135deg,#3878C7,#1f477a)',
  'linear-gradient(135deg,#1D9E75,#0f5e46)',
  'linear-gradient(135deg,#c77b8b,#7a4450)',
];

function avatarColor(idx: number) {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}

function fDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ─── Componente ─────────────────────────────────────────── */
export function SADashboardPage() {
  const qc = useQueryClient();
  const [suspendId, setSuspendId] = useState<string | null>(null);

  const { data: dash, isLoading: dashLoading } = useQuery<DashboardData>({
    queryKey: ['sa-dashboard'],
    queryFn: () => saApi.get('/admin/dashboard').then((r) => r.data),
    staleTime: 30_000,
  });

  const { data: empresas = [], isLoading: empLoading } = useQuery<Empresa[]>({
    queryKey: ['sa-empresas'],
    queryFn: () => saApi.get('/admin/empresas').then((r) => r.data),
    staleTime: 30_000,
  });

  const suspender = useMutation({
    mutationFn: (id: string) => saApi.patch(`/admin/empresas/${id}/suspender`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sa-empresas'] });
      qc.invalidateQueries({ queryKey: ['sa-dashboard'] });
      setSuspendId(null);
    },
  });

  const reactivar = useMutation({
    mutationFn: (id: string) => saApi.patch(`/admin/empresas/${id}/reactivar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sa-empresas'] });
      qc.invalidateQueries({ queryKey: ['sa-dashboard'] });
    },
  });

  return (
    <div className={styles.page}>

      {/* ── Topbar ── */}
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Vista global</h1>
          <p className={styles.sub}>Estado general de la plataforma Estixa</p>
        </div>
      </div>

      <div className={styles.content}>

        {/* ── KPI Cards ── */}
        <div className={styles.kpis}>
          <KpiCard
            label="Empresas activas"
            value={dashLoading ? '—' : String(dash?.empresasActivas ?? 0)}
            delta={dashLoading ? '' : `${dash?.empresasSuspendidas ?? 0} suspendidas`}
            deltaClass={styles.neutral}
            iconClass={styles.iGold}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 10l8-5 8 5M6 10v9h12v-9" />
              </svg>
            }
          />
          <KpiCard
            label="Nuevas este mes"
            value={dashLoading ? '—' : String(dash?.nuevasEsteMes ?? 0)}
            delta="registros nuevos"
            deltaClass={styles.neutral}
            iconClass={styles.iOk}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="8" r="4" />
                <path d="M6 20v-2a6 6 0 0112 0v2M12 14v6M9 17h6" />
              </svg>
            }
          />
          <KpiCard
            label="Ingresos SaaS / mes"
            value={dashLoading ? '—' : `RD$ ${formatMoney(Number(dash?.ingresosMensualesSaaS ?? 0))}`}
            delta="suscripciones activas"
            deltaClass={styles.neutral}
            iconClass={styles.iInfo}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="M2 10h20M6 15h4" />
              </svg>
            }
          />
          <KpiCard
            label="Facturas vencidas"
            value={dashLoading ? '—' : String(dash?.facturasVencidas ?? 0)}
            delta={dash?.facturasVencidas ? 'requieren atención' : 'sin vencidas'}
            deltaClass={dash?.facturasVencidas ? styles.deltaErr : styles.neutral}
            iconClass={dash?.facturasVencidas ? styles.iErr : styles.iOk}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            }
          />
        </div>

        {/* ── Tabla Empresas ── */}
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h3>Empresas registradas</h3>
            <span className={styles.count}>{empLoading ? '…' : `${empresas.length} total`}</span>
          </div>

          {empLoading ? (
            <div className={styles.loadWrap}><span className={styles.spinner} /></div>
          ) : empresas.length === 0 ? (
            <p className={styles.empty}>No hay empresas registradas aún.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Plan</th>
                    <th>Estado</th>
                    <th>Empleados</th>
                    <th>Registro</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {empresas.map((emp, i) => {
                    const planNombre = emp.plan ?? '—';
                    const isPending  = suspender.isPending && suspender.variables === emp.id;
                    const isReacting = reactivar.isPending && reactivar.variables === emp.id;

                    return (
                      <tr key={emp.id}>
                        <td>
                          <div className={styles.empCell}>
                            <div
                              className={styles.empAvatar}
                              style={{ background: avatarColor(i) }}
                            >
                              {initials(emp.nombre)}
                            </div>
                            <div>
                              <b>{emp.nombre}</b>
                              <small>{emp.slug}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`${styles.planPill} ${PLAN_CLASS[planNombre] ?? styles.plBasic}`}>
                            {planNombre}
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.stPill} ${ESTADO_CLASS[emp.estado] ?? styles.stAct}`}>
                            {emp.estado}
                          </span>
                        </td>
                        <td className={styles.mono}>{emp.empleados}</td>
                        <td className={styles.mono}>{fDate(emp.createdAt)}</td>
                        <td>
                          {emp.estado === 'SUSPENDED' ? (
                            <button
                              className={`${styles.actBtn} ${styles.actReact}`}
                              disabled={isReacting}
                              onClick={() => reactivar.mutate(emp.id)}
                              title="Reactivar empresa"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M9 12l2 2 4-4M22 12A10 10 0 112 12a10 10 0 0120 0z" />
                              </svg>
                            </button>
                          ) : (
                            suspendId === emp.id ? (
                              <div className={styles.confirmRow}>
                                <span className={styles.confirmTxt}>¿Suspender?</span>
                                <button
                                  className={`${styles.actBtn} ${styles.actDanger}`}
                                  disabled={isPending}
                                  onClick={() => suspender.mutate(emp.id)}
                                >Sí</button>
                                <button
                                  className={`${styles.actBtn} ${styles.actCancel}`}
                                  onClick={() => setSuspendId(null)}
                                >No</button>
                              </div>
                            ) : (
                              <button
                                className={`${styles.actBtn} ${styles.actSusp}`}
                                onClick={() => setSuspendId(emp.id)}
                                title="Suspender empresa"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                  <circle cx="12" cy="12" r="9" />
                                  <path d="M9 9h6v6H9z" />
                                </svg>
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

/* ─── KpiCard ─────────────────────────────────────────────── */
function KpiCard({
  label, value, delta, deltaClass, iconClass, icon,
}: {
  label: string; value: string; delta: string;
  deltaClass: string; iconClass: string; icon: React.ReactNode;
}) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiTop}>
        <span className={`${styles.kpiIco} ${iconClass}`}>{icon}</span>
        <span className={styles.kpiLabel}>{label}</span>
      </div>
      <div className={styles.kpiValue}>{value}</div>
      <div className={`${styles.kpiDelta} ${deltaClass}`}>{delta}</div>
    </div>
  );
}
