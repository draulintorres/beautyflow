import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { initiales } from '../../lib/format';
import styles from './EmpleadosPage.module.css';

// ── Types ──────────────────────────────────────────────
interface Sucursal { id: string; nombre: string; }
interface Servicio  { id: string; nombre: string; }
interface Empleado {
  id: string;
  nombre: string;
  puesto: string | null;
  telefono: string | null;
  activo: boolean;
  enVacaciones: boolean;
  sucursalId: string | null;
  usuarioId: string | null;
  sucursal: Sucursal | null;
  usuario: { id: string; email: string } | null;
  _count: { especialidades: number };
}
interface EmpleadoDetalle extends Empleado {
  especialidades: { servicioId: string; servicio: { id: string; nombre: string } }[];
  horarios: { id: string; diaSemana: number; horaInicio: string; horaFin: string; activo: boolean }[];
}
interface EmpresaInfo { maxEmpleados: number | null; }
interface UsuarioOpt { id: string; nombre: string; email: string; }

// ── Helpers ────────────────────────────────────────────
const OWNER_ADMIN         = new Set(['OWNER', 'ADMIN']);
const OWNER_ADMIN_MANAGER = new Set(['OWNER', 'ADMIN', 'MANAGER']);
const APPROX_MENU_H = 130;

const DIAS = [
  { label: 'Lunes',     n: 1 },
  { label: 'Martes',    n: 2 },
  { label: 'Miércoles', n: 3 },
  { label: 'Jueves',    n: 4 },
  { label: 'Viernes',   n: 5 },
  { label: 'Sábado',    n: 6 },
  { label: 'Domingo',   n: 0 },
];

const errMsg = (e: unknown) => {
  const msg = (e as any)?.response?.data?.message;
  return msg ? (Array.isArray(msg) ? msg.join(' · ') : String(msg)) : 'Error inesperado.';
};

// ── Toast ──────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  function show(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  }
  return { toast, show };
}

// ── Drawer con pestañas ────────────────────────────────
type Tab = 'datos' | 'horarios' | 'especialidades';

function EmpleadoDrawer({
  data,
  sucursales,
  servicios,
  onClose,
  onSuccess,
}: {
  data?: Empleado;
  sucursales: Sucursal[];
  servicios: Servicio[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!data;
  const qc = useQueryClient();

  // ─ Estado del drawer ─
  const [tab, setTab] = useState<Tab>('datos');
  const [savedId, setSavedId] = useState<string | null>(data?.id ?? null);
  const [drawerErr, setDrawerErr] = useState('');

  // ─ Datos ─
  const [form, setForm] = useState({
    nombre:     data?.nombre ?? '',
    puesto:     data?.puesto ?? '',
    telefono:   data?.telefono ?? '',
    sucursalId: data?.sucursalId ?? '',
    usuarioId:  data?.usuarioId ?? '',
    activo:     data?.activo ?? true,
    enVacaciones: data?.enVacaciones ?? false,
  });

  // ─ Horarios ─
  const [horarios, setHorarios] = useState<Record<number, { activo: boolean; inicio: string; fin: string }>>(() => {
    const base: Record<number, { activo: boolean; inicio: string; fin: string }> = {};
    DIAS.forEach(d => { base[d.n] = { activo: false, inicio: '09:00', fin: '18:00' }; });
    if (data) {
      // Pre-load from detalle query (será cargado async)
    }
    return base;
  });
  const [horariosLoaded, setHorariosLoaded] = useState(!isEdit);
  const [horariosErr, setHorariosErr] = useState('');

  // ─ Especialidades ─
  const [selEsp, setSelEsp] = useState<Set<string>>(new Set());
  const [espLoaded, setEspLoaded] = useState(!isEdit);
  const [espErr, setEspErr] = useState('');

  // Cargar detalle cuando se edita
  const { data: detalle } = useQuery<EmpleadoDetalle>({
    queryKey: ['empleado-detalle', data?.id],
    queryFn: () => api.get(`/empleados/${data!.id}`).then(r => r.data),
    enabled: !!data?.id,
  });

  useEffect(() => {
    if (!detalle) return;
    // Carga horarios
    const base: Record<number, { activo: boolean; inicio: string; fin: string }> = {};
    DIAS.forEach(d => { base[d.n] = { activo: false, inicio: '09:00', fin: '18:00' }; });
    for (const h of detalle.horarios) {
      base[h.diaSemana] = { activo: h.activo, inicio: h.horaInicio, fin: h.horaFin };
    }
    setHorarios(base);
    setHorariosLoaded(true);
    // Carga especialidades
    setSelEsp(new Set(detalle.especialidades.map(e => e.servicioId)));
    setEspLoaded(true);
  }, [detalle]);

  // ─ Usuarios libres para vincular ─
  const { data: usuariosData } = useQuery<UsuarioOpt[]>({
    queryKey: ['usuarios-para-empleado', data?.id],
    queryFn: async () => {
      const [usuariosRes, empleadosRes] = await Promise.all([
        api.get('/usuarios').then(r => r.data as { id: string; nombre: string; email: string }[]),
        api.get('/empleados').then(r => r.data as Empleado[]),
      ]);
      const vinculados = new Set(empleadosRes.filter(e => e.usuarioId && e.id !== data?.id).map(e => e.usuarioId));
      return usuariosRes.filter(u => !vinculados.has(u.id));
    },
  });

  // ─ Mutaciones ─
  const guardarDatos = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        nombre: form.nombre.trim(),
        ...(form.puesto    && { puesto: form.puesto.trim() }),
        ...(form.telefono  && { telefono: form.telefono.trim() }),
        ...(form.sucursalId && { sucursalId: form.sucursalId }),
        ...(form.usuarioId ? { usuarioId: form.usuarioId } : { usuarioId: null }),
        activo: form.activo,
        ...(isEdit && { enVacaciones: form.enVacaciones }),
      };
      if (isEdit) {
        return api.patch(`/empleados/${savedId}`, body).then(r => r.data);
      }
      return api.post('/empleados', body).then(r => r.data);
    },
    onSuccess: (res) => {
      setSavedId(res.id);
      qc.invalidateQueries({ queryKey: ['empleados'] });
      qc.invalidateQueries({ queryKey: ['empresa-empleados'] });
      setDrawerErr('');
    },
    onError: (e) => setDrawerErr(errMsg(e)),
  });

  const guardarHorarios = useMutation({
    mutationFn: () => {
      const arr = DIAS.filter(d => horarios[d.n]?.activo).map(d => ({
        diaSemana: d.n,
        horaInicio: horarios[d.n].inicio,
        horaFin: horarios[d.n].fin,
      }));
      // Validación local
      for (const h of arr) {
        if (h.horaFin <= h.horaInicio) throw new Error(`${DIAS.find(d=>d.n===h.diaSemana)?.label}: hora fin debe ser mayor que hora inicio`);
      }
      return api.put(`/empleados/${savedId}/horarios`, { horarios: arr }).then(r => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] });
      qc.invalidateQueries({ queryKey: ['empleado-detalle', savedId] });
      setHorariosErr('');
    },
    onError: (e) => setHorariosErr(errMsg(e)),
  });

  const guardarEsp = useMutation({
    mutationFn: () =>
      api.put(`/empleados/${savedId}/especialidades`, { servicioIds: [...selEsp] }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] });
      qc.invalidateQueries({ queryKey: ['empleado-detalle', savedId] });
      setEspErr('');
    },
    onError: (e) => setEspErr(errMsg(e)),
  });

  function aplicarLV() {
    const ref = horarios[1]; // Lunes
    setHorarios(prev => {
      const next = { ...prev };
      [1, 2, 3, 4, 5].forEach(d => {
        next[d] = { activo: true, inicio: ref?.inicio ?? '09:00', fin: ref?.fin ?? '18:00' };
      });
      return next;
    });
  }

  const datosValidos = form.nombre.trim().length > 0;

  return (
    <div className={styles.drawerOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Head */}
        <div className={styles.drawerHead}>
          <h3>{isEdit ? `Editar — ${data!.nombre}` : 'Nuevo empleado'}</h3>
          <button type="button" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button type="button" className={`${styles.tab} ${tab === 'datos' ? styles.tabActive : ''}`} onClick={() => setTab('datos')}>Datos</button>
          <button type="button" className={`${styles.tab} ${tab === 'horarios' ? styles.tabActive : ''}`} onClick={() => setTab('horarios')} disabled={!savedId}>Horarios</button>
          <button type="button" className={`${styles.tab} ${tab === 'especialidades' ? styles.tabActive : ''}`} onClick={() => setTab('especialidades')} disabled={!savedId}>Especialidades</button>
        </div>

        {/* Body */}
        <div className={styles.drawerBody}>

          {/* ── PESTAÑA DATOS ── */}
          {tab === 'datos' && (
            <div className={styles.tabContent}>
              <div className={styles.formGrid}>
                <div className={`${styles.formField} ${styles.fieldFull}`}>
                  <label>Nombre *</label>
                  <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Estefany Jimenez" maxLength={150} />
                </div>
                <div className={styles.formField}>
                  <label>Puesto</label>
                  <input value={form.puesto} onChange={e => setForm(f => ({ ...f, puesto: e.target.value }))} placeholder="Ej. Estilista" maxLength={60} />
                </div>
                <div className={styles.formField}>
                  <label>Teléfono</label>
                  <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="809-000-0000" maxLength={30} />
                </div>
                <div className={`${styles.formField} ${styles.fieldFull}`}>
                  <label>Sucursal</label>
                  <select value={form.sucursalId} onChange={e => setForm(f => ({ ...f, sucursalId: e.target.value }))}>
                    <option value="">— Sin asignar —</option>
                    {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div className={`${styles.formField} ${styles.fieldFull}`}>
                  <label>Vincular usuario</label>
                  <select value={form.usuarioId} onChange={e => setForm(f => ({ ...f, usuarioId: e.target.value }))}>
                    <option value="">— Ninguno —</option>
                    {(usuariosData ?? []).map(u => <option key={u.id} value={u.id}>{u.nombre} ({u.email})</option>)}
                  </select>
                  <span className={styles.fieldHint}>Vincula una cuenta de acceso al sistema con este empleado.</span>
                </div>
                <div className={styles.checkRow}>
                  <label>
                    <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                    Activo
                  </label>
                </div>
                {isEdit && (
                  <div className={styles.checkRow}>
                    <label>
                      <input type="checkbox" checked={form.enVacaciones} onChange={e => setForm(f => ({ ...f, enVacaciones: e.target.checked }))} />
                      En vacaciones
                    </label>
                  </div>
                )}
              </div>
              {!savedId && (
                <p className={styles.fieldHint} style={{ marginTop: 8 }}>Guarda los datos primero para configurar horarios y especialidades.</p>
              )}
              {drawerErr && <p className={styles.modalErr}>{drawerErr}</p>}
            </div>
          )}

          {/* ── PESTAÑA HORARIOS ── */}
          {tab === 'horarios' && (
            <div className={styles.tabContent}>
              {!horariosLoaded ? (
                <div className={styles.loadWrap}><div className={styles.spinner} /></div>
              ) : (
                <>
                  <div className={styles.horariosGrid}>
                    {DIAS.map(d => (
                      <div key={d.n} className={`${styles.horarioRow} ${horarios[d.n]?.activo ? styles.horarioRowActive : ''}`}>
                        <label className={styles.horarioDayCheck}>
                          <input
                            type="checkbox"
                            checked={horarios[d.n]?.activo ?? false}
                            onChange={e => setHorarios(prev => ({ ...prev, [d.n]: { ...prev[d.n], activo: e.target.checked } }))}
                          />
                          <span className={styles.horarioDayLabel}>{d.label}</span>
                        </label>
                        <div className={styles.horarioTimes}>
                          <input
                            type="time"
                            value={horarios[d.n]?.inicio ?? '09:00'}
                            disabled={!horarios[d.n]?.activo}
                            onChange={e => setHorarios(prev => ({ ...prev, [d.n]: { ...prev[d.n], inicio: e.target.value } }))}
                            className={styles.timeInput}
                          />
                          <span className={styles.timeSep}>–</span>
                          <input
                            type="time"
                            value={horarios[d.n]?.fin ?? '18:00'}
                            disabled={!horarios[d.n]?.activo}
                            onChange={e => setHorarios(prev => ({ ...prev, [d.n]: { ...prev[d.n], fin: e.target.value } }))}
                            className={styles.timeInput}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" className={styles.btnApplyLV} onClick={aplicarLV}>
                    Aplicar 09:00–18:00 a Lun–Vie
                  </button>
                  {horariosErr && <p className={styles.modalErr}>{horariosErr}</p>}
                </>
              )}
            </div>
          )}

          {/* ── PESTAÑA ESPECIALIDADES ── */}
          {tab === 'especialidades' && (
            <div className={styles.tabContent}>
              {!espLoaded ? (
                <div className={styles.loadWrap}><div className={styles.spinner} /></div>
              ) : (
                <>
                  <p className={styles.espHint}>Marca los servicios que este empleado puede realizar. Afecta la disponibilidad en la agenda.</p>
                  <div className={styles.espGrid}>
                    {servicios.map(sv => (
                      <label key={sv.id} className={styles.espItem}>
                        <input
                          type="checkbox"
                          checked={selEsp.has(sv.id)}
                          onChange={e => {
                            setSelEsp(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(sv.id) : next.delete(sv.id);
                              return next;
                            });
                          }}
                        />
                        <span>{sv.nombre}</span>
                      </label>
                    ))}
                  </div>
                  {espErr && <p className={styles.modalErr}>{espErr}</p>}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.drawerFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={guardarDatos.isPending || guardarHorarios.isPending || guardarEsp.isPending}>
            Cancelar
          </button>
          {tab === 'datos' && (
            <button
              type="button"
              className={styles.btnSave}
              onClick={async () => {
                await guardarDatos.mutateAsync();
                if (isEdit) { onSuccess(); } // al editar, cierra tras guardar datos
              }}
              disabled={!datosValidos || guardarDatos.isPending}
            >
              {guardarDatos.isPending ? 'Guardando...' : isEdit ? 'Guardar datos' : 'Crear empleado'}
            </button>
          )}
          {tab === 'horarios' && savedId && (
            <button
              type="button"
              className={styles.btnSave}
              onClick={() => guardarHorarios.mutate()}
              disabled={guardarHorarios.isPending}
            >
              {guardarHorarios.isPending ? 'Guardando...' : 'Guardar horarios'}
            </button>
          )}
          {tab === 'especialidades' && savedId && (
            <button
              type="button"
              className={styles.btnSave}
              onClick={() => guardarEsp.mutate()}
              disabled={guardarEsp.isPending}
            >
              {guardarEsp.isPending ? 'Guardando...' : 'Guardar especialidades'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ConfirmModal ───────────────────────────────────────
function ConfirmModal({
  title, message, confirmLabel = 'Confirmar', danger = false,
  loading, onConfirm, onClose,
}: {
  title: string; message: string; confirmLabel?: string; danger?: boolean;
  loading: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`${styles.modal} ${styles.modalSm}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>{title}</h3>
          <button type="button" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className={styles.modalBody}><p className={styles.confirmMsg}>{message}</p></div>
        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={loading}>Cancelar</button>
          <button type="button" className={danger ? styles.btnDanger : styles.btnSave} onClick={onConfirm} disabled={loading}>
            {loading ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EmpleadoRow (desktop) ──────────────────────────────
function EmpleadoRow({
  e,
  canWrite,
  canDelete,
  openMenuId,
  onMenuToggle,
  onEdit,
  onToggleActivo,
  onDelete,
}: {
  e: Empleado;
  canWrite: boolean;
  canDelete: boolean;
  openMenuId: string | null;
  onMenuToggle: (id: string | null) => void;
  onEdit: (e: Empleado) => void;
  onToggleActivo: (e: Empleado) => void;
  onDelete: (e: Empleado) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);
  const menuOpen = openMenuId === e.id;

  function handleToggle() {
    if (!menuOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < APPROX_MENU_H ? rect.top - APPROX_MENU_H - 4 : rect.bottom + 4;
      setDropPos({ top, right: window.innerWidth - rect.right });
    }
    onMenuToggle(menuOpen ? null : e.id);
  }

  return (
    <tr>
      <td>
        <div className={styles.nameCell}>
          <div className={styles.avatar}>{initiales(e.nombre)}</div>
          <div>
            <div className={styles.empNombre}>{e.nombre}</div>
            {e.puesto && <div className={styles.empPuesto}>{e.puesto}</div>}
          </div>
        </div>
      </td>
      <td className={styles.mutedCell}>{e.sucursal?.nombre ?? '—'}</td>
      <td className={styles.mutedCell}>{e.telefono ?? '—'}</td>
      <td>
        <span className={styles.espBadge}>{e._count.especialidades} servicio{e._count.especialidades !== 1 ? 's' : ''}</span>
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={e.activo ? styles.badgeOn : styles.badgeOff}>{e.activo ? 'Activo' : 'Inactivo'}</span>
          {e.enVacaciones && <span className={styles.badgeVac}>Vacaciones</span>}
        </div>
      </td>
      <td>
        {canWrite && (
          <div className={styles.menuWrap}>
            <button ref={btnRef} className={styles.menuBtn} onClick={handleToggle}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <circle cx="12" cy="5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="19" r="1.2" fill="currentColor" />
              </svg>
            </button>
            {menuOpen && dropPos && (
              <div className={styles.menuDropdown} style={{ top: dropPos.top, right: dropPos.right }}>
                <button onClick={() => { onMenuToggle(null); onEdit(e); }}>Editar</button>
                <button onClick={() => { onMenuToggle(null); onToggleActivo(e); }}>
                  {e.activo ? 'Desactivar' : 'Activar'}
                </button>
                {canDelete && (
                  <>
                    <div className={styles.menuDivider} />
                    <button className={styles.menuItemDanger} onClick={() => { onMenuToggle(null); onDelete(e); }}>Eliminar</button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ── MobileCard ─────────────────────────────────────────
function MobileEmpleadoCard({
  e, canWrite, canDelete, onEdit, onToggleActivo, onDelete,
}: {
  e: Empleado; canWrite: boolean; canDelete: boolean;
  onEdit: (e: Empleado) => void; onToggleActivo: (e: Empleado) => void; onDelete: (e: Empleado) => void;
}) {
  return (
    <div className={styles.mobileCard}>
      <div className={styles.mobileCardTop}>
        <div className={styles.mobileCardLeft}>
          <div className={styles.mobileCardName}>
            <div className={styles.avatar}>{initiales(e.nombre)}</div>
            <span>{e.nombre}</span>
            {e.enVacaciones && <span className={styles.badgeVac}>Vacaciones</span>}
          </div>
          {e.puesto && <div className={styles.mobileCardPuesto}>{e.puesto}</div>}
          {e.sucursal && <div className={styles.mobileCardSuc}>{e.sucursal.nombre}</div>}
          {e.telefono && <div className={styles.mobileCardTel}>{e.telefono}</div>}
        </div>
        <span className={e.activo ? styles.badgeOn : styles.badgeOff}>{e.activo ? 'Activo' : 'Inactivo'}</span>
      </div>
      <div className={styles.mobileCardMeta}>
        <span className={styles.espBadge}>{e._count.especialidades} servicio{e._count.especialidades !== 1 ? 's' : ''}</span>
      </div>
      {canWrite && (
        <div className={styles.mobileCardActions}>
          <button className={styles.mobileActionBtn} onClick={() => onEdit(e)}>Editar</button>
          <button className={styles.mobileActionBtn} onClick={() => onToggleActivo(e)}>{e.activo ? 'Desactivar' : 'Activar'}</button>
          {canDelete && (
            <button className={`${styles.mobileActionBtn} ${styles.mobileActionDanger}`} onClick={() => onDelete(e)}>Eliminar</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────
export function EmpleadosPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { toast, show: showToast } = useToast();

  const currentRol = user?.rol ?? '';
  const canWrite  = OWNER_ADMIN_MANAGER.has(currentRol);
  const canDelete = OWNER_ADMIN.has(currentRol);

  // ─ Queries ─
  const { data: empleados = [], isLoading } = useQuery<Empleado[]>({
    queryKey: ['empleados'],
    queryFn: () => api.get('/empleados').then(r => r.data),
  });

  const { data: empresa } = useQuery<EmpresaInfo>({
    queryKey: ['empresa-empleados'],
    queryFn: () => api.get('/empresa').then(r => r.data),
  });

  const { data: sucursales = [] } = useQuery<Sucursal[]>({
    queryKey: ['sucursales'],
    queryFn: () => api.get('/sucursales').then(r => r.data),
  });

  const { data: servicios = [] } = useQuery<Servicio[]>({
    queryKey: ['servicios'],
    queryFn: () => api.get('/servicios').then(r => r.data),
  });

  // ─ UI state ─
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [drawerTarget, setDrawerTarget] = useState<Empleado | 'new' | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ tipo: 'toggle' | 'delete'; emp: Empleado } | null>(null);

  // Cerrar dropdown al click fuera
  useEffect(() => {
    if (!openMenuId) return;
    function handle(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest(`.${styles.menuWrap}`)) setOpenMenuId(null);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [openMenuId]);

  // ─ Mutations ─
  const toggleActivo = useMutation({
    mutationFn: (emp: Empleado) => api.patch(`/empleados/${emp.id}`, { activo: !emp.activo }).then(r => r.data),
    onSuccess: (_, emp) => {
      qc.invalidateQueries({ queryKey: ['empleados'] });
      showToast(emp.activo ? 'Empleado desactivado.' : 'Empleado activado.');
      setConfirmTarget(null);
    },
    onError: (e) => { showToast(errMsg(e), false); setConfirmTarget(null); },
  });

  const eliminar = useMutation({
    mutationFn: (emp: Empleado) => api.delete(`/empleados/${emp.id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] });
      qc.invalidateQueries({ queryKey: ['empresa-empleados'] });
      showToast('Empleado eliminado.');
      setConfirmTarget(null);
    },
    onError: (e) => { showToast(errMsg(e), false); setConfirmTarget(null); },
  });

  // ─ Límite ─
  const total  = empleados.length;
  const maxEmp = empresa?.maxEmpleados ?? null;
  const atLimit = maxEmp !== null && total >= maxEmp;
  const pct = maxEmp ? Math.min((total / maxEmp) * 100, 100) : 0;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Empleados</div>
          <div className={styles.sub}>Gestiona el equipo de trabajo.</div>
        </div>
        {canWrite && (
          <button
            className={styles.btnNew}
            onClick={() => setDrawerTarget('new')}
            disabled={atLimit}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Nuevo empleado
          </button>
        )}
      </div>

      {/* Indicador límite */}
      {maxEmp !== null && (
        <div className={styles.limitBox}>
          <div className={styles.limitRow}>
            <span className={styles.limitLabel}>{total} de {maxEmp} empleados</span>
            {atLimit && <span className={styles.limitWarn}>Límite alcanzado — actualiza tu plan para agregar más.</span>}
          </div>
          <div className={styles.limitTrack}>
            <div className={`${styles.limitFill} ${atLimit ? styles.limitFillFull : ''}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Tabla desktop */}
      <div className={styles.tableCard}>
        {isLoading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : empleados.length === 0 ? (
          <div className={styles.emptyMsg}>No hay empleados registrados. ¡Agrega el primero!</div>
        ) : (
          <>
            {/* Desktop */}
            <div className={styles.tableDesktop}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Empleado</th>
                    <th>Sucursal</th>
                    <th>Teléfono</th>
                    <th>Especialidades</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {empleados.map(e => (
                    <EmpleadoRow
                      key={e.id}
                      e={e}
                      canWrite={canWrite}
                      canDelete={canDelete}
                      openMenuId={openMenuId}
                      onMenuToggle={setOpenMenuId}
                      onEdit={setDrawerTarget}
                      onToggleActivo={emp => setConfirmTarget({ tipo: 'toggle', emp })}
                      onDelete={emp => setConfirmTarget({ tipo: 'delete', emp })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile */}
            <div className={styles.mobileCards}>
              {empleados.map(e => (
                <MobileEmpleadoCard
                  key={e.id}
                  e={e}
                  canWrite={canWrite}
                  canDelete={canDelete}
                  onEdit={setDrawerTarget}
                  onToggleActivo={emp => setConfirmTarget({ tipo: 'toggle', emp })}
                  onDelete={emp => setConfirmTarget({ tipo: 'delete', emp })}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Drawer */}
      {drawerTarget !== null && (
        <EmpleadoDrawer
          data={drawerTarget !== 'new' ? drawerTarget : undefined}
          sucursales={sucursales}
          servicios={servicios}
          onClose={() => setDrawerTarget(null)}
          onSuccess={() => {
            setDrawerTarget(null);
            showToast(drawerTarget === 'new' ? 'Empleado creado.' : 'Empleado actualizado.');
          }}
        />
      )}

      {/* Confirm toggle activo */}
      {confirmTarget?.tipo === 'toggle' && (
        <ConfirmModal
          title={confirmTarget.emp.activo ? 'Desactivar empleado' : 'Activar empleado'}
          message={confirmTarget.emp.activo
            ? `¿Desactivar a ${confirmTarget.emp.nombre}? No aparecerá en la agenda.`
            : `¿Activar a ${confirmTarget.emp.nombre}?`}
          confirmLabel={confirmTarget.emp.activo ? 'Desactivar' : 'Activar'}
          danger={confirmTarget.emp.activo}
          loading={toggleActivo.isPending}
          onConfirm={() => toggleActivo.mutate(confirmTarget.emp)}
          onClose={() => setConfirmTarget(null)}
        />
      )}

      {/* Confirm eliminar */}
      {confirmTarget?.tipo === 'delete' && (
        <ConfirmModal
          title="Eliminar empleado"
          message={`¿Eliminar a ${confirmTarget.emp.nombre}? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          danger
          loading={eliminar.isPending}
          onConfirm={() => eliminar.mutate(confirmTarget.emp)}
          onClose={() => setConfirmTarget(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
