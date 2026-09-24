import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, downloadPdf } from '../../lib/api';
import { formatMoney, initiales } from '../../lib/format';
import { useAuthStore } from '../../store/auth';
import { AgendaMobile } from './AgendaMobile';
import { NuevaCitaMobile } from './NuevaCitaMobile';
import { ReprogramarModal, citaToPosState } from './ReprogramarModal';
import styles from './AgendaPage.module.css';

interface Cita {
  id: string; fecha: string; horaInicio: string; horaFin: string;
  estado: string;
  cliente: { id: string; nombre: string; telefono: string; whatsapp: string } | null;
  empleado: { id: string; nombre: string } | null;
  servicios: { servicioId: string; nombre: string; precio: number; duracionMin: number }[];
  subtotal: number; descuento: number; itbis: number; total: number;
  notas: string | null;
  // Candado "una venta por cita" (Parte B): solo no-null si hay una venta
  // ACTIVA ligada (anular() limpia esto, ver ReprogramarModal.tsx).
  venta: { id: string; estado: string } | null;
}
interface Empleado {
  id: string; nombre: string; activo: boolean; participaAgenda: boolean;
  esCuentaDueno?: boolean;
  usuario?: { id: string } | null;
}
interface DeudaAlquiler { id: string; saldo: number; estado: string; }

const START_H = 8, END_H = 19, SLOT_H = 62, CAL_HDR = 54;
const HOURS = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i);
const AV_GRADIENTS = [
  'linear-gradient(135deg,#E4CB8A,#a07f33)',
  'linear-gradient(135deg,#1D9E75,#0f5e46)',
  'linear-gradient(135deg,#3878C7,#1f477a)',
  'linear-gradient(135deg,#8b6fc7,#54447a)',
  'linear-gradient(135deg,#c77b8b,#7a4450)',
  'linear-gradient(135deg,#d9a531,#8a6218)',
];
const ESTADO_CLS: Record<string, string> = {
  PENDIENTE: 'Pend', CONFIRMADA: 'Conf', EN_PROCESO: 'Proc',
  FINALIZADA: 'Comp', CANCELADA: 'Canc', NO_ASISTIO: 'Nosh',
};
const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente', CONFIRMADA: 'Confirmada', EN_PROCESO: 'En proceso',
  FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada', NO_ASISTIO: 'No asistio',
};
const TERMINALES = ['FINALIZADA', 'CANCELADA', 'NO_ASISTIO'];
const DIAS = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
const MESES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MESES_C = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function stepFecha(fecha: string, delta: number) {
  const d = new Date(fecha + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function labelFechaLarga(f: string) {
  const d = new Date(f + 'T12:00:00');
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES_L[d.getMonth()]} de ${d.getFullYear()}`;
}
function labelFechaCorta(f: string) {
  const d = new Date(f + 'T12:00:00');
  return `${d.getDate()} de ${MESES_L[d.getMonth()]} de ${d.getFullYear()}`;
}
function labelFechaMini(f: string) {
  const d = new Date(f + 'T12:00:00');
  return `${d.getDate()} ${MESES_C[d.getMonth()]}`;
}
function labelHour12(h: number) {
  const ap = h < 12 ? 'AM' : 'PM';
  const hh = h === 0 ? 12 : h <= 12 ? h : h - 12;
  return `${hh}:00 ${ap}`;
}
function labelTime12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const hh = h === 0 ? 12 : h <= 12 ? h : h - 12;
  return `${hh}:${String(m).padStart(2,'0')} ${ap}`;
}
function timeToTop(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return ((h - START_H) * 60 + m) / 60 * SLOT_H;
}
function durationPx(ini: string, fin: string) {
  const [sh, sm] = ini.split(':').map(Number);
  const [eh, em] = fin.split(':').map(Number);
  return Math.max(((eh * 60 + em) - (sh * 60 + sm)) / 60 * SLOT_H - 4, 22);
}

function QCard({ label, value, colorVar, dot, mono, icon }: {
  label: string; value: string; colorVar?: string; dot?: boolean; mono?: boolean;
  icon?: React.ReactNode;
}) {
  const tint = colorVar ?? 'var(--gold-soft)';
  return (
    <div className={styles.qcard}>
      {dot && colorVar && <div className={styles.qdot} style={{ background: colorVar }} />}
      <div className={styles.qtop}>
        {icon && (
          <div className={styles.qicon} style={{
            background: `color-mix(in srgb, ${tint} 16%, transparent)`,
            color: tint,
          }}>{icon}</div>
        )}
        <div className={styles.qlabel}>{label}</div>
      </div>
      {/* El número va SIEMPRE en color de texto (negro en claro, blanco en
          oscuro) para máxima legibilidad; el color semántico lo lleva el
          punto/ícono, no la cifra. */}
      <div className={styles.qvalue} style={{
        fontFamily: mono ? 'var(--font-mono)' : undefined,
      }}>{value}</div>
    </div>
  );
}

function DRow({ icon, label, value, notes }: {
  icon: React.ReactNode; label: string; value: string; notes?: boolean;
}) {
  return (
    <div className={`${styles.drow} ${notes ? styles.drowNotes : ''}`}>
      <span className={styles.drowIco}>{icon}</span>
      <span className={styles.drowKey}>{label}</span>
      <span className={styles.drowVal}>{value}</span>
    </div>
  );
}

export function AgendaPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [fecha, setFecha] = useState(todayStr);
  const [selId, setSelId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [nuevaCita, setNuevaCita] = useState(false);
  const [reprogramando, setReprogramando] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const authUser = useAuthStore(s => s.user);
  const soyInquilino = authUser?.rol === 'ALQUILER';

  const { data: empleados = [] } = useQuery<Empleado[]>({
    queryKey: ['empleados'],
    queryFn: () => api.get('/empleados').then(r => r.data),
    staleTime: 5 * 60_000,
  });
  const { data: citas = [], isLoading } = useQuery<Cita[]>({
    queryKey: ['citas', fecha],
    queryFn: () => api.get('/citas', { params: { fecha } }).then(r => r.data),
  });
  // "Ingreso de hoy": dinero REAL (ventas PAGADA), a diferencia de
  // "Ingreso esperado" (proyección de citas, calculado abajo sin tocar).
  // El backend filtra quién ve qué (inquilino, salón o su propio ingreso).
  const { data: ingresoHoyData } = useQuery<{ ingresoHoy: number }>({
    queryKey: ['ingreso-hoy', fecha],
    queryFn: () => api.get('/citas/ingreso-hoy', { params: { fecha } }).then(r => r.data),
  });
  const ingresoHoy = ingresoHoyData?.ingresoHoy ?? 0;
  const { data: misDeudas = [] } = useQuery<DeudaAlquiler[]>({
    queryKey: ['mis-deudas-alquiler'],
    queryFn: () => api.get('/alquiler/deudas').then(r => r.data),
    enabled: soyInquilino,
    staleTime: 60_000,
  });
  const totalMeDeben = useMemo(
    () => misDeudas.reduce((s, d) => s + Number(d.saldo), 0),
    [misDeudas],
  );

  const selCita = citas.find(c => c.id === selId) ?? null;
  const clienteId = selCita?.cliente?.id ?? null;
  const { data: historial = [] } = useQuery<Cita[]>({
    queryKey: ['cliente-citas', clienteId],
    queryFn: () => api.get(`/clientes/${clienteId}/citas`).then(r => r.data),
    enabled: !!clienteId,
    staleTime: 60_000,
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) =>
      api.patch(`/citas/${id}/estado`, { estado }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['citas', fecha] }),
  });
  const cancelarCita = useMutation({
    mutationFn: (id: string) => api.patch(`/citas/${id}/cancelar`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['citas', fecha] }),
  });

  const stats = useMemo(() => ({
    total: citas.length,
    confirmadas: citas.filter(c => c.estado === 'CONFIRMADA').length,
    pendientes: citas.filter(c => c.estado === 'PENDIENTE').length,
    canceladas: citas.filter(c => c.estado === 'CANCELADA').length,
    ingreso: citas.filter(c => !TERMINALES.includes(c.estado)).reduce((s, c) => s + c.total, 0),
  }), [citas]);

  const isToday = fecha === todayStr();
  const nowHour = now.getHours();
  const nowTop = (isToday && nowHour >= START_H && nowHour < END_H)
    ? (nowHour - START_H) * SLOT_H + (now.getMinutes() / 60) * SLOT_H + CAL_HDR
    : null;
  const nowLabel = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const empList = useMemo(() => {
    // esCuentaDueno excluido: no es personal bookable (ver mismo criterio
    // en NuevaCitaMobile.tsx) -- no tiene sentido como columna del calendario.
    let base = empleados.filter(e => e.activo && e.participaAgenda !== false && !e.esCuentaDueno);
    // Alquiler de silla: cortesía visual — el inquilino solo ve su propia
    // columna (el backend ya filtra las citas; esto evita listar nombres
    // de otros empleados en el calendario de alguien que es un negocio
    // independiente dentro del salón).
    if (soyInquilino) base = base.filter(e => e.usuario?.id === authUser?.id);
    const fromDB = base.slice(0, 6);
    if (fromDB.length > 0) return fromDB;
    const map = new Map<string, Empleado>();
    for (const c of citas) {
      if (c.empleado && !map.has(c.empleado.id)) {
        map.set(c.empleado.id, { id: c.empleado.id, nombre: c.empleado.nombre, activo: true, participaAgenda: true });
      }
    }
    return Array.from(map.values()).slice(0, 6);
  }, [empleados, citas, soyInquilino, authUser]);

  const citasByEmp = useMemo(() => {
    const m: Record<string, Cita[]> = {};
    for (const emp of empList) m[emp.id] = [];
    for (const c of citas) {
      if (c.empleado && m[c.empleado.id]) m[c.empleado.id].push(c);
    }
    return m;
  }, [empList, citas]);

  const histPrev = historial
    .filter(c => c.fecha < fecha && !TERMINALES.includes(c.estado))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 3);

  const isTerminal = selCita ? TERMINALES.includes(selCita.estado) : false;

  return (
    <>
      <div className={styles.mobileOnly}><AgendaMobile /></div>
      <div className={`${styles.desktopOnly} ${styles.page}`}>
      <div className={styles.agHeader}>
        <div>
          <h1 className={styles.pageTitle}>Agenda</h1>
          <p className={styles.pageSub}>Gestiona las citas de tu negocio</p>
        </div>
        <button className={styles.btnNew} onClick={() => setNuevaCita(true)}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Nueva cita
        </button>
      </div>

      <div className={styles.quickCards}>
        <QCard label="Citas hoy" value={String(stats.total)}
          icon={<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>} />
        <QCard label="Confirmadas" value={String(stats.confirmadas)} colorVar="var(--ok)" dot
          icon={<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>} />
        <QCard label="Pendientes" value={String(stats.pendientes)} colorVar="var(--warn)" dot
          icon={<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>} />
        <QCard label="Canceladas" value={String(stats.canceladas)} colorVar="var(--err)" dot
          icon={<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>} />
        <QCard label="Ingreso esperado" value={`RD$ ${formatMoney(stats.ingreso)}`} mono
          icon={<svg viewBox="0 0 24 24"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>} />
        <QCard label="Ingreso de hoy" value={`RD$ ${formatMoney(ingresoHoy)}`} colorVar="var(--ok)" mono
          icon={<svg viewBox="0 0 24 24"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>} />
        {soyInquilino && (
          <QCard label="Le debes al negocio" value={`RD$ ${formatMoney(totalMeDeben)}`} colorVar="var(--err)" mono
            icon={<svg viewBox="0 0 24 24"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>} />
        )}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.viewSwitch}>
          <button className={styles.viewActive}>Dia</button>
          <button>Semana</button>
          <button>Mes</button>
        </div>
        <button className={styles.todayBtn} onClick={() => setFecha(todayStr())}>Hoy</button>
        <div className={styles.dateStepper}>
          <button onClick={() => setFecha(f => stepFecha(f, -1))}>
            <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className={styles.dateLabel}>{labelFechaCorta(fecha)}</span>
          <button onClick={() => setFecha(f => stepFecha(f, 1))}>
            <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
      </div>

      <div className={styles.agBody}>
        <div className={styles.calWrap}>
          <div className={styles.calDayLabel}>{labelFechaLarga(fecha)}</div>
          <div className={styles.calScroll}>
            {isLoading ? (
              <div className={styles.loadWrap}><span className={styles.spinner} /></div>
            ) : (
              <div
                className={styles.cal}
                style={{ gridTemplateColumns: `58px repeat(${Math.max(empList.length,1)}, minmax(150px, 1fr))` }}
              >
                <div className={styles.calHead}>
                  <div className={styles.corner} />
                  {empList.map((emp, i) => (
                    <div key={emp.id} className={styles.empColHead}>
                      <div className={styles.empAv}
                        style={{ background: AV_GRADIENTS[i % AV_GRADIENTS.length] }}>
                        {initiales(emp.nombre)}
                      </div>
                      <div>
                        <b>{emp.nombre.split(' ')[0]}</b>
                        <small>Estilista</small>
                      </div>
                    </div>
                  ))}
                </div>

                <div className={styles.hoursCol}>
                  {HOURS.map(h => (
                    <div key={h} className={styles.hourCell}>
                      <span>{labelHour12(h)}</span>
                    </div>
                  ))}
                </div>

                {empList.length === 0 ? (
                  <div className={styles.emptyCol}>
                    {HOURS.map(h => <div key={h} className={styles.slot} />)}
                  </div>
                ) : (
                  empList.map(emp => (
                    <div key={emp.id} className={styles.empCol}>
                      {HOURS.map(h => <div key={h} className={styles.slot} />)}
                      {(citasByEmp[emp.id] ?? []).map(cita => {
                        const cls = ESTADO_CLS[cita.estado] ?? 'Pend';
                        return (
                          <div
                            key={cita.id}
                            className={`${styles.appt} ${styles[`appt${cls}`] ?? ''} ${cita.id === selId ? styles.apptSel : ''}`}
                            style={{ top: timeToTop(cita.horaInicio), height: durationPx(cita.horaInicio, cita.horaFin) }}
                            onClick={() => setSelId(cita.id === selId ? null : cita.id)}
                          >
                            <div className={styles.apptTime}>{labelTime12(cita.horaInicio)}</div>
                            <div className={styles.apptClient}>{cita.cliente?.nombre}</div>
                            {cita.servicios[0] && (
                              <div className={styles.apptSvc}>{cita.servicios[0].nombre}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}

                {nowTop !== null && (
                  <div className={styles.nowLine} style={{ top: nowTop }}>
                    <span className={styles.nowLbl}>{labelTime12(nowLabel)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <aside className={styles.detail}>
          {!selCita ? (
            <div className={styles.detailEmpty}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                <rect x="3" y="4" width="18" height="17" rx="2"/>
                <path d="M3 9h18M8 2v4M16 2v4"/>
              </svg>
              <p>Selecciona una cita para ver los detalles</p>
            </div>
          ) : (
            <>
              <div className={styles.dh}>
                <span className={styles.citaId}>Cita #{selCita.id.slice(-6).toUpperCase()}</span>
                <div className={styles.dhRight}>
                  <span className={`${styles.stBadge} ${styles[`badge${ESTADO_CLS[selCita.estado]}`] ?? ''}`}>
                    {ESTADO_LABEL[selCita.estado]}
                  </span>
                  <button className={styles.closeBtn} onClick={() => setSelId(null)}>x</button>
                </div>
              </div>

              {selCita.cliente && (
                <div className={styles.clientRow}>
                  <div className={styles.clientPic}>{initiales(selCita.cliente.nombre)}</div>
                  <div>
                    <div className={styles.clientNm}>{selCita.cliente.nombre}</div>
                    <div className={styles.clientPh}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#9a988f" strokeWidth="2" width="13" height="13">
                        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.69 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0122 16.92z"/>
                      </svg>
                      {selCita.cliente.whatsapp || selCita.cliente.telefono}
                    </div>
                  </div>
                </div>
              )}

              <div className={styles.drows}>
                <DRow icon={<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18"/></svg>}
                  label="Fecha" value={labelFechaCorta(selCita.fecha)} />
                <DRow icon={<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>}
                  label="Hora" value={`${labelTime12(selCita.horaInicio)} - ${labelTime12(selCita.horaFin)}`} />
                <DRow icon={<svg viewBox="0 0 24 24"><circle cx="6" cy="7" r="2"/><circle cx="6" cy="17" r="2"/><path d="M8 9l11 8M8 15l11-8"/></svg>}
                  label="Servicio" value={selCita.servicios.map(s => s.nombre).join(', ') || 'N/A'} />
                <DRow icon={<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>}
                  label="Empleado" value={selCita.empleado?.nombre ?? 'N/A'} />
                <DRow icon={<svg viewBox="0 0 24 24"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}
                  label="Precio" value={`RD$ ${formatMoney(selCita.total)}`} />
                {selCita.notas && (
                  <DRow icon={<svg viewBox="0 0 24 24"><path d="M4 4h16v12H8l-4 4z"/></svg>}
                    label="Notas" value={selCita.notas} notes />
                )}
              </div>

              {selCita.venta && (
                <div className={styles.yaCobrada}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
                  <span>Ya cobrada</span>
                  <button onClick={() => downloadPdf(`/facturas/${selCita.venta!.id}/recibo`, 'recibo.pdf')}>
                    Ver recibo
                  </button>
                </div>
              )}

              {!isTerminal && (
                <div className={styles.acts}>
                  <button className={`${styles.dbtn} ${styles.dEdit}`} onClick={() => setReprogramando(true)}>
                    <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
                    Editar
                  </button>
                  {selCita.estado === 'PENDIENTE' && (
                    <button
                      className={`${styles.dbtn} ${styles.dConf}`}
                      disabled={cambiarEstado.isPending}
                      onClick={() => cambiarEstado.mutate({ id: selCita.id, estado: 'CONFIRMADA' })}
                    >
                      <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
                      Confirmar
                    </button>
                  )}
                  {!selCita.venta && (selCita.estado === 'CONFIRMADA' || selCita.estado === 'PENDIENTE') && (
                    <button
                      className={`${styles.dbtn} ${styles.dCobrar}`}
                      onClick={() => navigate('/pos', { state: citaToPosState(selCita) })}
                    >
                      <svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                      Cobrar
                    </button>
                  )}
                  {(selCita.cliente?.whatsapp || selCita.cliente?.telefono) && (
                    <a href={`https://wa.me/1${(selCita.cliente.whatsapp || selCita.cliente.telefono).replace(/\D/g,'')}`}
                      target="_blank" rel="noopener noreferrer"
                      className={`${styles.dbtn} ${styles.dWa}`}>
                      <svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 01-8.5 8.5 8.5 8.5 0 01-4-1L3 21l1.5-5a8.5 8.5 0 01-1-4 8.38 8.38 0 018.5-8.5 8.5 8.5 0 018 8.5z"/></svg>
                      WhatsApp
                    </a>
                  )}
                  <button
                    className={`${styles.dbtn} ${styles.dCancel} ${styles.dbtnFull}`}
                    disabled={cancelarCita.isPending}
                    onClick={() => cancelarCita.mutate(selCita.id)}
                  >
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
                    Cancelar cita
                  </button>
                </div>
              )}

              {histPrev.length > 0 && (
                <div className={styles.history}>
                  <div className={styles.histHead}>
                    <b>Historial del cliente</b>
                    <a href="#">Ver mas</a>
                  </div>
                  {histPrev.map(h => (
                    <div key={h.id} className={styles.hrow}>
                      <span className={styles.hdate}>{labelFechaMini(h.fecha)}</span>
                      <span className={styles.hserv}>{h.servicios[0]?.nombre ?? 'N/A'}</span>
                      <span className={styles.hamt}>RD${formatMoney(h.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
      </div>

      {nuevaCita && (
        <NuevaCitaMobile
          fechaInicial={fecha}
          onClose={() => setNuevaCita(false)}
          onDone={() => {
            setNuevaCita(false);
            qc.invalidateQueries({ queryKey: ['citas', fecha] });
          }}
        />
      )}

      {reprogramando && selCita && (
        <ReprogramarModal
          cita={selCita}
          empleados={empleados}
          soyInquilino={soyInquilino}
          onClose={() => setReprogramando(false)}
          onSuccess={() => {
            setReprogramando(false);
            qc.invalidateQueries({ queryKey: ['citas', fecha] });
          }}
        />
      )}
    </>
  );
}
