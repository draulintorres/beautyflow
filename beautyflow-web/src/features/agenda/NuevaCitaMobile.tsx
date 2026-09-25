import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useAuthStore } from '../../store/auth';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import styles from './NuevaCitaMobile.module.css';

interface Empleado {
  id: string; nombre: string; activo: boolean; participaAgenda: boolean;
  esCuentaDueno?: boolean;
  usuario?: { id: string } | null;
}
interface Servicio { id: string; nombre: string; precio: string; duracionMin: number; categoria?: { nombre: string }; activo: boolean; }
interface Cliente { id: string; nombre: string; telefono?: string; whatsapp?: string; }
interface Intervalo { inicio: string; fin: string; }
interface Disponibilidad {
  fecha: string; trabaja: boolean;
  horaInicio: string | null; horaFin: string | null;
  ocupado: Intervalo[]; disponible: Intervalo[];
}

const DIAS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function toMin(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2,'0')}:${String(min % 60).padStart(2,'0')}`;
}
function toAmPm(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function generarSlots(disponible: Intervalo[], durMin: number): string[] {
  if (durMin <= 0) return [];
  const slots: string[] = [];
  for (const { inicio, fin } of disponible) {
    let cur = toMin(inicio);
    const end = toMin(fin);
    while (cur + durMin <= end) {
      slots.push(toHHMM(cur));
      cur += 15;
    }
  }
  return slots;
}

export function NuevaCitaMobile({
  fechaInicial,
  onClose,
  onDone,
}: {
  fechaInicial: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  useLockBodyScroll();

  const [paso, setPaso]               = useState(1);
  const [fecha, setFecha]             = useState(fechaInicial);
  const [empleadoId, setEmpleadoId]   = useState<string | null>(null);
  const [serviciosIds, setServiciosIds] = useState<string[]>([]);
  const [horaInicio, setHoraInicio]   = useState<string | null>(null);
  const [clienteId, setClienteId]     = useState<string | null>(null);
  const [notas, setNotas]             = useState('');
  const [busServ, setBusServ]         = useState('');
  const [busCli, setBusCli]           = useState('');
  const [errMsg, setErrMsg]           = useState<string | null>(null);

  // ─── Queries (se cachean globalmente) ───
  const { data: empleados = [] } = useQuery<Empleado[]>({
    queryKey: ['empleados'],
    queryFn: () => api.get('/empleados').then(r => r.data),
  });
  const { data: servicios = [] } = useQuery<Servicio[]>({
    queryKey: ['servicios'],
    queryFn: () => api.get('/servicios').then(r => r.data),
  });
  const { data: clientes = [] } = useQuery<Cliente[]>({
    queryKey: ['clientes'],
    queryFn: () => api.get('/clientes').then(r => r.data),
  });
  // ─── Derivados que hacen falta ANTES de la query de disponibilidad ───
  const authUser = useAuthStore(s => s.user);
  const soyInquilino = authUser?.rol === 'ALQUILER';
  const esOwner = authUser?.rol === 'OWNER';
  const miEmpleado = empleados.find(e => e.usuario?.id === authUser?.id) ?? null;

  // Dejar "Empleado" sin elegir es válido SOLO para el dueño — significa
  // "la cita es para mí" (el backend resuelve/crea su Empleado fantasma
  // igual que hace el POS). `miEmpleado` puede no existir todavía si es su
  // primera cita/venta — en ese caso no hay id que consultar contra
  // disponibilidad.service.ts, así que se asume libre todo el día (no
  // puede haber conflictos: si el Empleado no existe, no tiene citas).
  const empleadoIdEfectivo = empleadoId ?? (esOwner ? miEmpleado?.id ?? null : null);
  const duenoSinEmpleadoAun = !empleadoId && esOwner && !miEmpleado;

  const { data: disp, isLoading: dispLoading } = useQuery<Disponibilidad>({
    queryKey: ['disponibilidad', empleadoIdEfectivo, fecha],
    queryFn: () =>
      api.get(`/empleados/${empleadoIdEfectivo}/disponibilidad`, { params: { fecha } }).then(r => r.data),
    enabled: !!empleadoIdEfectivo && !!fecha,
  });

  // ─── Derivados ───
  const hoy = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const diasStrip = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(hoy); d.setDate(hoy.getDate() + i - 1); return d;
    }), [hoy]);

  // Un inquilino solo puede agendarse a sí mismo — se fija automáticamente
  // en cuanto se conoce su propio empleadoId. El backend lo fuerza igual
  // (Cambio 2) aunque esto fallara, así que es puramente cortesía visual.
  useEffect(() => {
    if (soyInquilino && miEmpleado && empleadoId !== miEmpleado.id) {
      setEmpleadoId(miEmpleado.id);
    }
  }, [soyInquilino, miEmpleado, empleadoId]);

  // esCuentaDueno excluido de la LISTA (no se ofrece como opción clicable):
  // es el Empleado fantasma que se autocrea para el dueño
  // (resolveEmpleadoRegistra, en el POS). Dejar "Empleado" sin elegir es
  // justamente cómo se agenda el dueño a sí mismo (ver empleadoIdEfectivo
  // arriba) — no tiene que aparecer en la lista para eso.
  const empleadosActivos   = empleados.filter(e => e.activo && e.participaAgenda !== false && !e.esCuentaDueno);
  const serviciosFiltrados = servicios.filter(s =>
    s.activo && s.nombre.toLowerCase().includes(busServ.toLowerCase())
  );
  const clientesFiltrados  = clientes
    .filter(c => c.nombre.toLowerCase().includes(busCli.toLowerCase()))
    .slice(0, 40);

  const serviciosSel = useMemo(
    () => servicios.filter(s => serviciosIds.includes(s.id)),
    [servicios, serviciosIds]
  );
  const duracionTotal   = serviciosSel.reduce((a, s) => a + s.duracionMin, 0);
  const precioEstimado  = serviciosSel.reduce((a, s) => a + Number(s.precio), 0);

  const slots = useMemo(() => {
    if (empleadoIdEfectivo) {
      return disp?.trabaja ? generarSlots(disp.disponible, duracionTotal) : [];
    }
    // Dueño sin Empleado creado todavía: no hay nada que consultar, se
    // asume libre todo el día (ver empleadoIdEfectivo).
    if (duenoSinEmpleadoAun) return generarSlots([{ inicio: '00:00', fin: '23:59' }], duracionTotal);
    return [];
  }, [disp, duracionTotal, empleadoIdEfectivo, duenoSinEmpleadoAun]);

  const empleadoSel = empleados.find(e => e.id === empleadoId);
  // Cuando no se eligió a nadie, la cita queda a nombre del dueño.
  const nombreProfesional = empleadoSel?.nombre ?? (esOwner ? `${authUser?.nombre ?? 'Tú'} (dueño)` : undefined);
  const clienteSel  = clientes.find(c => c.id === clienteId);
  const fechaObj    = new Date(`${fecha}T00:00:00`);

  // ─── Handlers ───
  function cambiarFecha(f: string) { setFecha(f); setHoraInicio(null); }
  function cambiarEmpleado(id: string) { setEmpleadoId(id); setHoraInicio(null); }
  function toggleServicio(id: string) {
    setServiciosIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setHoraInicio(null);
  }

  const crearCita = useMutation({
    mutationFn: () => api.post('/citas', {
      clienteId,
      // Sin elegir a nadie (solo posible siendo el dueño): se omite del
      // todo, no se manda null — el backend resuelve/crea el Empleado del
      // dueño cuando no llega empleadoId.
      ...(empleadoId ? { empleadoId } : {}),
      fecha,
      horaInicio,
      servicios: serviciosIds,
      ...(notas.trim() ? { notas: notas.trim() } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agenda-mobile'] });
      onDone();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      const status = err?.response?.status;
      // Antes esto mostraba el mensaje real solo para 409 y un genérico
      // para cualquier otro caso (400 incluido) -- ocultaba la razón real
      // que el backend sí manda (ej. "Se requiere una sucursal para
      // asignar cabina"), dejando a quien usa la app sin pista de qué
      // corregir.
      if (status === 409 || status === 400) {
        setErrMsg(
          typeof msg === 'string' ? msg : Array.isArray(msg) ? msg[0] : 'No se pudo crear la cita. Verifica los datos e intenta de nuevo.'
        );
      } else {
        setErrMsg('No se pudo crear la cita. Verifica los datos e intenta de nuevo.');
      }
    },
  });

  // ─── Condiciones para avanzar ───
  // El dueño puede avanzar sin elegir a nadie (la cita queda para él);
  // cualquier otro rol sí tiene que elegir un profesional.
  const puedeIr2      = !!empleadoId || esOwner;
  const puedeIr3      = serviciosIds.length > 0;
  const puedeIr4      = !!horaInicio;
  const puedeConfirmar = !!clienteId && !crearCita.isPending;

  const PASO_LBL = ['', 'Fecha y empleado', 'Servicios', 'Hora', 'Cliente'];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.handle} />

        {/* ── Cabecera ── */}
        <div className={styles.head}>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className={styles.headMid}>
            <span className={styles.headTitle}>Nueva cita</span>
            <span className={styles.headSub}>{PASO_LBL[paso]}</span>
          </div>
          <div className={styles.pasoCnt}>{paso}/4</div>
        </div>

        {/* ── Barra de progreso ── */}
        <div className={styles.progBar}>
          {[1,2,3,4].map(p => (
            <div key={p} className={`${styles.progStep} ${paso >= p ? styles.progStepOn : ''}`} />
          ))}
        </div>

        {/* ── Contenido ── */}
        <div className={styles.body}>

          {/* PASO 1 — Fecha + Empleado */}
          {paso === 1 && (
            <>
              <div className={styles.secLabel}>Fecha — acceso rápido</div>

              <div className={styles.diasStrip}>
                {diasStrip.map(d => {
                  const iso = toISO(d);
                  const activo = iso === fecha;
                  const esHoy  = iso === toISO(hoy);
                  return (
                    <button
                      key={iso}
                      className={`${styles.dia} ${activo ? styles.diaOn : ''}`}
                      onClick={() => cambiarFecha(iso)}
                    >
                      <span className={styles.diaNom}>{DIAS[d.getDay()]}</span>
                      <span className={styles.diaNum}>{d.getDate()}</span>
                      {esHoy && <span className={styles.diaHoy} />}
                    </button>
                  );
                })}
              </div>

              <div className={styles.secLabel}>Otra fecha</div>
              <input
                className={styles.dateInput}
                type="date"
                value={fecha}
                onChange={e => cambiarFecha(e.target.value)}
              />

              <div className={styles.secLabel}>Empleado</div>
              {soyInquilino ? (
                <div className={styles.empList}>
                  <div className={`${styles.empItem} ${styles.empItemSel}`}>
                    <div className={styles.empAvatar}>{(miEmpleado?.nombre ?? '?').charAt(0).toUpperCase()}</div>
                    <span className={styles.empNom}>{miEmpleado?.nombre ?? 'Tú'}</span>
                    <svg className={styles.checkIco} viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/>
                    </svg>
                  </div>
                </div>
              ) : (
                <div className={styles.empList}>
                  {empleadosActivos.length === 0 && !esOwner && (
                    <div className={styles.noDisp}>
                      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
                      No hay profesionales disponibles en agenda
                    </div>
                  )}
                  {esOwner && (
                    <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 8px' }}>
                      {empleadosActivos.length === 0
                        ? 'Todavía no tenés empleados en Agenda — sin elegir a nadie, la cita queda a tu nombre.'
                        : 'Si no elegís a nadie, la cita queda a tu nombre.'}
                    </p>
                  )}
                  {empleadosActivos.map(e => (
                    <button
                      key={e.id}
                      className={`${styles.empItem} ${empleadoId === e.id ? styles.empItemSel : ''}`}
                      onClick={() => cambiarEmpleado(e.id)}
                    >
                      <div className={styles.empAvatar}>{e.nombre.charAt(0).toUpperCase()}</div>
                      <span className={styles.empNom}>{e.nombre}</span>
                      {empleadoId === e.id && (
                        <svg className={styles.checkIco} viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* PASO 2 — Servicios */}
          {paso === 2 && (
            <>
              <div className={styles.secLabel}>Servicios</div>
              <input
                className={styles.busInput}
                placeholder="Buscar servicio..."
                value={busServ}
                onChange={e => setBusServ(e.target.value)}
              />
              <div className={styles.srvList}>
                {serviciosFiltrados.map(s => {
                  const sel = serviciosIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      className={`${styles.srvItem} ${sel ? styles.srvItemSel : ''}`}
                      onClick={() => toggleServicio(s.id)}
                    >
                      <div className={styles.srvInfo}>
                        <span className={styles.srvNom}>{s.nombre}</span>
                        <span className={styles.srvMeta}>
                          {s.duracionMin} min · RD$ {formatMoney(Number(s.precio))}
                        </span>
                      </div>
                      {sel && (
                        <svg className={styles.checkIco} viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/>
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>

              {serviciosIds.length > 0 && (
                <div className={styles.srvResumen}>
                  <span>
                    {serviciosIds.length} servicio{serviciosIds.length > 1 ? 's' : ''} · {duracionTotal} min
                  </span>
                  <span>RD$ {formatMoney(precioEstimado)}</span>
                </div>
              )}
            </>
          )}

          {/* PASO 3 — Hora */}
          {paso === 3 && (
            <>
              <div className={styles.secLabel}>
                Hora — {DIAS[fechaObj.getDay()]} {fechaObj.getDate()} de {MESES[fechaObj.getMonth()]}
              </div>
              <div className={styles.secSub}>{nombreProfesional} · {duracionTotal} min por sesión</div>

              {dispLoading && (
                <div className={styles.loadWrap}><span className={styles.spinner} /></div>
              )}

              {!dispLoading && !disp && !duenoSinEmpleadoAun && (
                <div className={styles.noDisp}>
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
                  Error al cargar disponibilidad
                </div>
              )}

              {!dispLoading && disp && !disp.trabaja && (
                <div className={styles.noDisp}>
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
                  {nombreProfesional} no trabaja ese día
                </div>
              )}

              {!dispLoading && (disp?.trabaja || duenoSinEmpleadoAun) && slots.length === 0 && (
                <div className={styles.noDisp}>
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
                  No hay horas disponibles para {duracionTotal} min
                </div>
              )}

              {!dispLoading && slots.length > 0 && (
                <div className={styles.slotGrid}>
                  {slots.map(slot => (
                    <button
                      key={slot}
                      className={`${styles.slot} ${horaInicio === slot ? styles.slotSel : ''}`}
                      onClick={() => setHoraInicio(slot)}
                    >
                      {toAmPm(slot)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* PASO 4 — Cliente + Confirmación */}
          {paso === 4 && (
            <>
              <div className={styles.secLabel}>Cliente</div>
              <input
                className={styles.busInput}
                placeholder="Buscar cliente..."
                value={busCli}
                onChange={e => setBusCli(e.target.value)}
              />
              <div className={styles.cliList}>
                {clientesFiltrados.map(c => (
                  <button
                    key={c.id}
                    className={`${styles.cliItem} ${clienteId === c.id ? styles.cliItemSel : ''}`}
                    onClick={() => setClienteId(c.id)}
                  >
                    <div className={styles.cliTexts}>
                      <span className={styles.cliNom}>{c.nombre}</span>
                      {(c.whatsapp || c.telefono) && <span className={styles.cliTel}>{c.whatsapp || c.telefono}</span>}
                    </div>
                    {clienteId === c.id && (
                      <svg className={styles.checkIco} viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              <div className={styles.secLabel}>Notas (opcional)</div>
              <textarea
                className={styles.notasInput}
                placeholder="Información adicional..."
                value={notas}
                onChange={e => setNotas(e.target.value)}
                maxLength={500}
                rows={3}
              />

              {/* Resumen */}
              <div className={styles.resumen}>
                <div className={styles.resTitle}>Resumen de la cita</div>
                <div className={styles.resRow}>
                  <span>Fecha</span>
                  <b>{DIAS[fechaObj.getDay()]}, {fechaObj.getDate()} de {MESES[fechaObj.getMonth()]}</b>
                </div>
                <div className={styles.resRow}>
                  <span>Hora</span>
                  <b>{horaInicio ? toAmPm(horaInicio) : ''} · {duracionTotal} min</b>
                </div>
                <div className={styles.resRow}>
                  <span>Empleado</span>
                  <b>{nombreProfesional}</b>
                </div>
                <div className={styles.resRow}>
                  <span>Servicios</span>
                  <b>{serviciosSel.map(s => s.nombre).join(', ')}</b>
                </div>
                <div className={styles.resRow}>
                  <span>Cliente</span>
                  <b>{clienteSel?.nombre ?? '—'}</b>
                </div>
                <div className={styles.resRow}>
                  <span>Precio est.</span>
                  <b>RD$ {formatMoney(precioEstimado)}</b>
                </div>
              </div>

              {errMsg && <div className={styles.errMsg}>{errMsg}</div>}
            </>
          )}

        </div>

        {/* ── Pie de navegación ── */}
        <div className={styles.foot}>
          {paso > 1 ? (
            <button
              className={styles.btnBack}
              onClick={() => { setPaso(p => p - 1); setErrMsg(null); }}
            >
              ← Atrás
            </button>
          ) : <div />}

          {paso < 4 && (
            <button
              className={styles.btnNext}
              disabled={
                (paso === 1 && !puedeIr2) ||
                (paso === 2 && !puedeIr3) ||
                (paso === 3 && !puedeIr4)
              }
              onClick={() => setPaso(p => p + 1)}
            >
              Siguiente →
            </button>
          )}

          {paso === 4 && (
            <button
              className={styles.btnCreate}
              disabled={!puedeConfirmar}
              onClick={() => { setErrMsg(null); crearCita.mutate(); }}
            >
              {crearCita.isPending ? 'Creando…' : 'Crear cita'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
