import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { initiales } from '../../lib/format';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import styles from './EquipoPage.module.css';

// ── Types ─────────────────────────────────────────────────
interface Rol { id: string; roleKey: string; nombre: string; }
interface Sucursal { id: string; nombre: string; }
interface Servicio { id: string; nombre: string; activo: boolean; }

interface IntegranteUsuario {
  id: string;
  email: string;
  activo: boolean;
  rol: { roleKey: string; nombre: string };
}

interface Integrante {
  id: string;
  nombre: string;
  puesto: string | null;
  telefono: string | null;
  activo: boolean;
  enVacaciones: boolean;
  participaAgenda: boolean;
  sucursalId: string | null;
  usuarioId: string | null;
  sucursal: Sucursal | null;
  usuario: IntegranteUsuario | null;
  _count: { especialidades: number };
  especialidades: { servicio: { id: string; nombre: string } }[];
}

interface IntegranteDetalle extends Integrante {
  especialidades: { servicioId: string; servicio: { id: string; nombre: string } }[];
  horarios: { id: string; diaSemana: number; horaInicio: string; horaFin: string; activo: boolean }[];
}

interface EmpresaInfo { maxEmpleados: number | null; }

type Tab = 'datos' | 'horarios' | 'especialidades' | 'comision';
type DrawerState = { data: Integrante | 'new'; tab: Tab };

interface ComisionData {
  modeloPago: 'COMISION' | 'SUELDO_FIJO' | 'ALQUILER';
  sueldoMonto: number | null;
  pctBase: number | null;
  overrides: { servicioId: string; servicioNombre: string; pct: number }[];
}
interface OverrideRow { id: string; servicioId: string; servicioNombre: string; pct: string; }
interface AlquilerConfigData {
  tipoCuota: 'POR_SERVICIO' | 'RENTA_PERIODO';
  flujoDinero: 'DIRECTO' | 'POR_CAJA';
  montoPorServicio: number | string | null;
  montoRenta: number | string | null;
  periodoRenta: 'SEMANAL' | 'MENSUAL' | null;
  activo: boolean;
}

// ── Constants & helpers ────────────────────────────────────
const OWNER_ADMIN         = new Set(['OWNER', 'ADMIN']);
const OWNER_ADMIN_MANAGER = new Set(['OWNER', 'ADMIN', 'MANAGER']);
const APPROX_MENU_H = 290;

const DIAS = [
  { label: 'Lunes',     n: 1 },
  { label: 'Martes',    n: 2 },
  { label: 'Miércoles', n: 3 },
  { label: 'Jueves',    n: 4 },
  { label: 'Viernes',   n: 5 },
  { label: 'Sábado',    n: 6 },
  { label: 'Domingo',   n: 0 },
];

const CARGO_SUGERENCIAS = [
  'Estilista', 'Barbero', 'Manicurista', 'Colorista',
  'Recepcionista', 'Administración', 'Esteticista', 'Masajista',
];

const AVATAR_COLORS = ['#7c5cbf', '#2d7dd2', '#3bb273', '#c9952b', '#c44536', '#2a9d8f', '#c0803a'];
function avatarBg(nombre: string): string {
  const hash = nombre.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const errMsg = (e: unknown) => {
  const msg = (e as any)?.response?.data?.message;
  return msg ? (Array.isArray(msg) ? msg.join(' · ') : String(msg)) : 'Error inesperado.';
};

function useToast() {
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  function show(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  }
  return { toast, show };
}

// ── Inline SVG icons ───────────────────────────────────────
const IcoEdit = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IcoClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>
);
const IcoStar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const IcoDollar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
  </svg>
);
const IcoShield = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IcoShieldOff = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19.69 14a6.9 6.9 0 00.31-2V5l-8-3-3.16 1.18M4.73 4.73L4 5v7c0 5.55 3.84 10.74 8 12a19.3 19.3 0 001.65-.44M1 1l22 22"/>
  </svg>
);
const IcoToggle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="8" width="22" height="8" rx="4"/><circle cx="16" cy="12" r="3" fill="currentColor"/>
  </svg>
);
const IcoTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
  </svg>
);

// ── TempPasswordModal ──────────────────────────────────────
function TempPasswordModal({ password, onClose }: { password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`${styles.modal} ${styles.modalSm}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>Contraseña temporal</h3>
          <button type="button" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.tempNote}>
            Comparte esta contraseña con el integrante. No se volverá a mostrar; deberá cambiarla al iniciar sesión.
          </p>
          <div className={styles.tempBox}>
            <span className={styles.tempPwd}>{password}</span>
            <button type="button" className={copied ? styles.btnCopied : styles.btnCopy} onClick={copy}>
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnSave} onClick={onClose}>Entendido</button>
        </div>
      </div>
    </div>
  );
}

// ── ConfirmModal ───────────────────────────────────────────
function ConfirmModal({
  title, message, confirmLabel = 'Confirmar', danger = false,
  loading, onConfirm, onClose,
}: {
  title: string; message: string; confirmLabel?: string; danger?: boolean;
  loading: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`${styles.modal} ${styles.modalSm}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>{title}</h3>
          <button type="button" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.confirmMsg}>{message}</p>
        </div>
        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            type="button"
            className={danger ? styles.btnDanger : styles.btnSave}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CrearAccesoModal ───────────────────────────────────────
function CrearAccesoModal({
  integrante, roles, currentRol, onClose, onSuccess,
}: {
  integrante: Integrante;
  roles: Rol[];
  currentRol: string;
  onClose: () => void;
  onSuccess: (tempPwd: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [rolId, setRolId] = useState('');
  const [err, setErr] = useState('');
  const qc = useQueryClient();

  const rolesDisponibles = currentRol === 'OWNER' ? roles : roles.filter(r => r.roleKey !== 'OWNER');
  const isValid = email.trim() && rolId;

  const crear = useMutation({
    mutationFn: () =>
      api.post(`/empleados/${integrante.id}/crear-acceso`, { email: email.trim(), rolId }).then(r => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['equipo'] });
      onSuccess(res.passwordTemporal);
    },
    onError: (e) => setErr(errMsg(e)),
  });

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>Crear acceso — {integrante.nombre}</h3>
          <button type="button" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.accNote}>
            Crea una cuenta de acceso para <strong>{integrante.nombre}</strong>. Se generará una contraseña temporal que deberás compartir con la persona.
          </p>
          <div className={styles.formGrid}>
            <div className={`${styles.formField} ${styles.fieldFull}`}>
              <label>Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                autoFocus
              />
            </div>
            <div className={`${styles.formField} ${styles.fieldFull}`}>
              <label>Rol *</label>
              <select value={rolId} onChange={(e) => setRolId(e.target.value)}>
                <option value="">Seleccionar rol...</option>
                {rolesDisponibles.map(r => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          {err && <div className={styles.modalErr}>{err}</div>}
        </div>
        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={crear.isPending}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnSave}
            onClick={() => crear.mutate()}
            disabled={!isValid || crear.isPending}
          >
            {crear.isPending ? 'Creando...' : 'Crear acceso'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── GestionarAccesoModal ───────────────────────────────────
function GestionarAccesoModal({
  integrante, roles, currentRol, currentUserId, onClose, onRefresh, onTempPwd,
}: {
  integrante: Integrante;
  roles: Rol[];
  currentRol: string;
  currentUserId: string;
  onClose: () => void;
  onRefresh: () => void;
  onTempPwd: (pwd: string) => void;
}) {
  const usuario = integrante.usuario!;
  const isSelf = usuario.id === currentUserId;
  const currentRolId = roles.find(r => r.roleKey === usuario.rol.roleKey)?.id ?? '';
  const [rolId, setRolId] = useState(currentRolId);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [subConfirm, setSubConfirm] = useState<'reset' | 'quitar' | null>(null);
  const qc = useQueryClient();

  const rolesDisponibles = currentRol === 'OWNER' ? roles : roles.filter(r => r.roleKey !== 'OWNER');
  const rolChanged = rolId !== currentRolId;

  async function guardarRol() {
    setLoading(true);
    setErr('');
    try {
      await api.patch(`/usuarios/${usuario.id}`, { rolId });
      qc.invalidateQueries({ queryKey: ['equipo'] });
      onClose();
      onRefresh();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    setLoading(true);
    setErr('');
    try {
      const res = await api.patch(`/usuarios/${usuario.id}/reset-password`, {});
      qc.invalidateQueries({ queryKey: ['equipo'] });
      setSubConfirm(null);
      onClose();
      if (res.data?.passwordTemporal) onTempPwd(res.data.passwordTemporal);
      else onRefresh();
    } catch (e) {
      setErr(errMsg(e));
      setSubConfirm(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleQuitarAcceso() {
    setLoading(true);
    setErr('');
    try {
      await api.patch(`/empleados/${integrante.id}/quitar-acceso`);
      qc.invalidateQueries({ queryKey: ['equipo'] });
      setSubConfirm(null);
      onClose();
      onRefresh();
    } catch (e) {
      setErr(errMsg(e));
      setSubConfirm(null);
    } finally {
      setLoading(false);
    }
  }

  if (subConfirm === 'reset') {
    return (
      <ConfirmModal
        title="Restablecer contraseña"
        message={`¿Restablecer la contraseña de ${integrante.nombre}? Se generará una contraseña temporal y se cerrarán todas sus sesiones activas.`}
        confirmLabel="Restablecer"
        loading={loading}
        onConfirm={handleReset}
        onClose={() => setSubConfirm(null)}
      />
    );
  }

  if (subConfirm === 'quitar') {
    return (
      <ConfirmModal
        title="Quitar acceso"
        message={`¿Quitar el acceso al sistema de ${integrante.nombre}? La cuenta quedará desactivada, pero el integrante seguirá activo en el equipo.`}
        confirmLabel="Quitar acceso"
        danger
        loading={loading}
        onConfirm={handleQuitarAcceso}
        onClose={() => setSubConfirm(null)}
      />
    );
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>Gestionar acceso — {integrante.nombre}</h3>
          <button type="button" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <div className={`${styles.formField} ${styles.fieldFull}`}>
              <label>Email</label>
              <input value={usuario.email} readOnly className={styles.fieldReadonly} />
              <span className={styles.fieldHint}>El email no se puede cambiar</span>
            </div>
            <div className={`${styles.formField} ${styles.fieldFull}`}>
              <label>Rol</label>
              {isSelf ? (
                <>
                  <input value={usuario.rol.nombre} readOnly className={styles.fieldReadonly} />
                  <span className={styles.fieldHint}>No puedes cambiar tu propio rol</span>
                </>
              ) : (
                <select value={rolId} onChange={(e) => setRolId(e.target.value)}>
                  {rolesDisponibles.map(r => (
                    <option key={r.id} value={r.id}>{r.nombre}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className={styles.accionesAcceso}>
            <button
              type="button"
              className={styles.btnAccion}
              onClick={() => setSubConfirm('reset')}
              disabled={loading}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="15" height="15">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
              </svg>
              Restablecer contraseña
            </button>
            {!isSelf && (
              <button
                type="button"
                className={`${styles.btnAccion} ${styles.btnAccionDanger}`}
                onClick={() => setSubConfirm('quitar')}
                disabled={loading}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="15" height="15">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  <line x1="18" y1="8" x2="23" y2="13" /><line x1="23" y1="8" x2="18" y2="13" />
                </svg>
                Quitar acceso al sistema
              </button>
            )}
          </div>

          {err && <div className={styles.modalErr} style={{ marginTop: 12 }}>{err}</div>}
        </div>
        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={loading}>
            Cerrar
          </button>
          {!isSelf && rolChanged && (
            <button type="button" className={styles.btnSave} onClick={guardarRol} disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar rol'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ComisionTab ────────────────────────────────────────────
function ComisionTab({
  empleadoId,
  servicios,
}: {
  empleadoId: string;
  servicios: Servicio[];
}) {
  const { user } = useAuthStore();
  const canWrite = OWNER_ADMIN.has(user?.rol ?? '');
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery<ComisionData>({
    queryKey: ['comision-ui', empleadoId],
    queryFn: () => api.get(`/empleados/${empleadoId}/comision`).then(r => r.data),
  });
  // GET /alquiler/config/:id devuelve 200 con cuerpo VACÍO cuando el
  // empleado nunca fue configurado (no 404) — se normaliza a null.
  const { data: alquilerConfig, isLoading: loadingAlq } = useQuery<AlquilerConfigData | null>({
    queryKey: ['alquiler-config-ui', empleadoId],
    queryFn: () => api.get(`/alquiler/config/${empleadoId}`)
      .then(r => (r.data && typeof r.data === 'object') ? r.data as AlquilerConfigData : null),
  });

  const [modeloPago, setModeloPago]   = useState<'COMISION' | 'SUELDO_FIJO' | 'ALQUILER'>('COMISION');
  const [sueldoMonto, setSueldoMonto] = useState('');
  const [pctBase, setPctBase]         = useState('');
  const [overrides, setOverrides]     = useState<OverrideRow[]>([]);
  const [tipoCuota, setTipoCuota]         = useState<'POR_SERVICIO' | 'RENTA_PERIODO'>('POR_SERVICIO');
  const [montoPorServicio, setMontoPorServicio] = useState('');
  const [montoRenta, setMontoRenta]       = useState('');
  const [periodoRenta, setPeriodoRenta]   = useState<'SEMANAL' | 'MENSUAL'>('SEMANAL');
  const [flujoDinero, setFlujoDinero]     = useState<'DIRECTO' | 'POR_CAJA'>('DIRECTO');
  const [initialized, setInitialized] = useState(false);
  const [switchWarn, setSwitchWarn]   = useState<'pierde-comision' | 'salir-alquiler' | null>(null);
  const [pendingModelo, setPendingModelo] = useState<'COMISION' | 'SUELDO_FIJO' | 'ALQUILER' | null>(null);
  const [comErr, setComErr]           = useState('');
  const [comOk, setComOk]             = useState('');

  function syncFromData(d: ComisionData, alq?: AlquilerConfigData | null) {
    setModeloPago(d.modeloPago);
    setSueldoMonto(d.sueldoMonto != null ? String(d.sueldoMonto) : '');
    setPctBase(d.pctBase != null ? String(d.pctBase) : '');
    setOverrides(
      d.overrides.map(o => ({
        id: `${o.servicioId}-${Math.random().toString(36).slice(2)}`,
        servicioId:     o.servicioId,
        servicioNombre: o.servicioNombre,
        pct:            String(o.pct),
      })),
    );
    if (alq) {
      setTipoCuota(alq.tipoCuota);
      setMontoPorServicio(alq.montoPorServicio != null ? String(alq.montoPorServicio) : '');
      setMontoRenta(alq.montoRenta != null ? String(alq.montoRenta) : '');
      setPeriodoRenta(alq.periodoRenta ?? 'SEMANAL');
      setFlujoDinero(alq.flujoDinero);
    }
  }

  useEffect(() => {
    if (!config || alquilerConfig === undefined || initialized) return;
    syncFromData(config, alquilerConfig);
    setInitialized(true);
  }, [config, alquilerConfig]);

  function applyModeloChange(next: 'COMISION' | 'SUELDO_FIJO' | 'ALQUILER') {
    setModeloPago(next);
    if (next === 'SUELDO_FIJO') { setPctBase(''); setOverrides([]); }
  }

  function handleModeloChange(next: 'COMISION' | 'SUELDO_FIJO' | 'ALQUILER') {
    if (next === modeloPago) return;
    if (
      (next === 'SUELDO_FIJO' || next === 'ALQUILER') &&
      modeloPago === 'COMISION' &&
      (pctBase !== '' || overrides.length > 0)
    ) {
      setPendingModelo(next);
      setSwitchWarn('pierde-comision');
      return;
    }
    if (modeloPago === 'ALQUILER' && next !== 'ALQUILER') {
      setPendingModelo(next);
      setSwitchWarn('salir-alquiler');
      return;
    }
    applyModeloChange(next);
  }

  function addOverride() {
    const used = new Set(overrides.map(o => o.servicioId));
    const first = servicios.find(s => s.activo && !used.has(s.id));
    if (!first) return;
    setOverrides(prev => [
      ...prev,
      { id: `${first.id}-${Math.random().toString(36).slice(2)}`, servicioId: first.id, servicioNombre: first.nombre, pct: '' },
    ]);
  }

  function removeOverride(id: string) { setOverrides(prev => prev.filter(o => o.id !== id)); }

  function updateOverride(id: string, field: 'servicioId' | 'pct', value: string) {
    setOverrides(prev => prev.map(o => {
      if (o.id !== id) return o;
      if (field === 'servicioId') {
        const svc = servicios.find(s => s.id === value);
        return { ...o, servicioId: value, servicioNombre: svc?.nombre ?? '' };
      }
      return { ...o, pct: value };
    }));
  }

  const guardar = useMutation({
    mutationFn: async () => {
      if (modeloPago === 'COMISION') {
        if (pctBase !== '') {
          const n = Number(pctBase);
          if (isNaN(n) || n < 0 || n > 100) throw new Error('El % base debe ser entre 0 y 100');
        }
        for (const ov of overrides) {
          if (!ov.servicioId) throw new Error('Selecciona un servicio para cada excepción');
          const n = Number(ov.pct);
          if (ov.pct === '' || isNaN(n) || n < 0 || n > 100)
            throw new Error('El % de cada excepción debe estar entre 0 y 100');
        }
        const svcIds = overrides.map(o => o.servicioId);
        if (new Set(svcIds).size !== svcIds.length)
          throw new Error('No puede haber servicios duplicados en las excepciones');
      }

      if (modeloPago === 'ALQUILER') {
        if (tipoCuota === 'POR_SERVICIO') {
          const n = Number(montoPorServicio);
          if (montoPorServicio === '' || isNaN(n) || n <= 0)
            throw new Error('El monto por servicio es requerido y debe ser mayor a 0');
        } else {
          const n = Number(montoRenta);
          if (montoRenta === '' || isNaN(n) || n <= 0)
            throw new Error('El monto de renta es requerido y debe ser mayor a 0');
          if (!periodoRenta) throw new Error('Selecciona el período de la renta');
        }

        // Orquestación: 1) config de alquiler PRIMERO. Si falla, el
        // modeloPago del empleado NO se toca (el catch de abajo deja la
        // excepción del backend intacta) — nunca queda un ALQUILER "a
        // medias" sin config funcional detrás.
        const alqBody: Record<string, unknown> = { tipoCuota, flujoDinero, activo: true };
        if (tipoCuota === 'POR_SERVICIO') alqBody.montoPorServicio = Number(montoPorServicio);
        else { alqBody.montoRenta = Number(montoRenta); alqBody.periodoRenta = periodoRenta; }
        await api.put(`/alquiler/config/${empleadoId}`, alqBody);

        // 2) Solo ahora se marca el empleado como ALQUILER.
        await api.put(`/empleados/${empleadoId}/comision`, { modeloPago: 'ALQUILER' });
      } else {
        const body: Record<string, unknown> = { modeloPago };
        if (sueldoMonto !== '') body.sueldoMonto = Number(sueldoMonto);
        if (modeloPago === 'COMISION') {
          if (pctBase !== '') body.pctBase = Number(pctBase);
          body.overrides = overrides.map(o => ({ servicioId: o.servicioId, pct: Number(o.pct) }));
        } else {
          body.overrides = [];
        }
        await api.put(`/empleados/${empleadoId}/comision`, body);

        // Si el empleado VENÍA de Alquiler, desactivar su AlquilerConfig
        // (se conserva el registro por si vuelve más adelante — el resto
        // del sistema ya lee `activo` para decidir si aplica o no, así que
        // no hace falta borrar nada). Best-effort: el modelo ya cambió
        // correctamente aunque esto falle; solo queda un config inactivo
        // pendiente de reintentar.
        if (config?.modeloPago === 'ALQUILER' && alquilerConfig) {
          const deactivate: Record<string, unknown> = {
            tipoCuota: alquilerConfig.tipoCuota,
            flujoDinero: alquilerConfig.flujoDinero,
            activo: false,
          };
          if (alquilerConfig.tipoCuota === 'POR_SERVICIO') {
            deactivate.montoPorServicio = Number(alquilerConfig.montoPorServicio);
          } else {
            deactivate.montoRenta = Number(alquilerConfig.montoRenta);
            deactivate.periodoRenta = alquilerConfig.periodoRenta;
          }
          await api.put(`/alquiler/config/${empleadoId}`, deactivate).catch(() => {});
        }
      }

      // Recarga real desde GET tras guardar — no se asume éxito por la
      // respuesta del PUT.
      const [freshComision, freshAlquiler] = await Promise.all([
        api.get(`/empleados/${empleadoId}/comision`).then(r => r.data as ComisionData),
        api.get(`/alquiler/config/${empleadoId}`)
          .then(r => (r.data && typeof r.data === 'object') ? r.data as AlquilerConfigData : null),
      ]);
      return { freshComision, freshAlquiler };
    },
    onSuccess: ({ freshComision, freshAlquiler }) => {
      qc.setQueryData(['comision-ui', empleadoId], freshComision);
      qc.setQueryData(['alquiler-config-ui', empleadoId], freshAlquiler);
      syncFromData(freshComision, freshAlquiler);
      setComErr('');
      setComOk(modeloPago === 'ALQUILER' ? 'Alquiler guardado correctamente.' : 'Comisión guardada correctamente.');
      setTimeout(() => setComOk(''), 3000);
    },
    onError: (e) => setComErr(e instanceof Error ? e.message : errMsg(e)),
  });

  if (isLoading || loadingAlq) return <div className={styles.loadWrap}><div className={styles.spinner} /></div>;

  const usedSvcIds = new Set(overrides.map(o => o.servicioId));
  const availableToAdd = servicios.filter(s => s.activo && !usedSvcIds.has(s.id));

  return (
    <div className={styles.tabContent}>
      {/* Modelo de pago */}
      <div className={styles.comModelRow}>
        <span className={styles.comModelLabel}>Modelo de pago</span>
        <div className={styles.comModelBtns}>
          <button
            type="button"
            className={`${styles.comModelBtn} ${modeloPago === 'COMISION' ? styles.comModelBtnOn : ''}`}
            onClick={() => canWrite && handleModeloChange('COMISION')}
          >
            Comisión %
          </button>
          <button
            type="button"
            className={`${styles.comModelBtn} ${modeloPago === 'SUELDO_FIJO' ? styles.comModelBtnOn : ''}`}
            onClick={() => canWrite && handleModeloChange('SUELDO_FIJO')}
          >
            Sueldo fijo
          </button>
          <button
            type="button"
            className={`${styles.comModelBtn} ${modeloPago === 'ALQUILER' ? styles.comModelBtnOn : ''}`}
            onClick={() => canWrite && handleModeloChange('ALQUILER')}
          >
            Alquiler
          </button>
        </div>
      </div>

      {modeloPago === 'COMISION' && (
        <>
          <div className={styles.comSection}>
            <div className={styles.comSectionTitle}>% general de servicios</div>
            <div className={styles.comRow}>
              <input
                type="number" min={0} max={100} step={0.01}
                value={pctBase}
                onChange={e => setPctBase(e.target.value)}
                placeholder="Ej. 30"
                disabled={!canWrite}
                className={styles.comPctInput}
              />
              <span className={styles.comSymbol}>%</span>
            </div>
            {pctBase === '' && (
              <div className={styles.comWarn}>
                Sin configuración → comisión = 0 en servicios sin excepción
              </div>
            )}
          </div>

          <div className={styles.comSection}>
            <div className={styles.comSectionHeader}>
              <div className={styles.comSectionTitle}>Excepciones por servicio</div>
              {canWrite && (
                <button
                  type="button"
                  className={styles.comAddBtn}
                  onClick={addOverride}
                  disabled={availableToAdd.length === 0}
                  title={availableToAdd.length === 0 ? 'No hay más servicios disponibles' : undefined}
                >
                  + Agregar
                </button>
              )}
            </div>
            {overrides.length === 0 ? (
              <p className={styles.comEmpty}>Sin excepciones — se usará el % general para todos los servicios.</p>
            ) : (
              <div className={styles.overrideList}>
                {overrides.map(ov => {
                  const opts = servicios.filter(s => s.activo && (!usedSvcIds.has(s.id) || s.id === ov.servicioId));
                  return (
                    <div key={ov.id} className={styles.overrideRow}>
                      <select
                        className={styles.overrideSvcSel}
                        value={ov.servicioId}
                        onChange={e => updateOverride(ov.id, 'servicioId', e.target.value)}
                        disabled={!canWrite}
                      >
                        {opts.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                      <input
                        type="number" min={0} max={100} step={0.01}
                        className={styles.overridePctInput}
                        value={ov.pct}
                        onChange={e => updateOverride(ov.id, 'pct', e.target.value)}
                        placeholder="%"
                        disabled={!canWrite}
                      />
                      <span className={styles.comSymbol}>%</span>
                      {canWrite && (
                        <button type="button" className={styles.overrideDelBtn} onClick={() => removeOverride(ov.id)}>
                          <IcoTrash />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className={styles.comPrecedencia}>Prioridad: excepción por servicio › % general › 0 (sin config)</p>
          </div>
        </>
      )}

      {modeloPago === 'SUELDO_FIJO' && (
        <div className={styles.comSection}>
          <div className={styles.comSectionTitle}>Sueldo mensual (informativo)</div>
          <div className={styles.comRow}>
            <span className={styles.comPrefix}>RD$</span>
            <input
              type="number" min={0} step={0.01}
              value={sueldoMonto}
              onChange={e => setSueldoMonto(e.target.value)}
              placeholder="0.00"
              disabled={!canWrite}
              className={styles.comPctInput}
            />
          </div>
          <div className={styles.comWarn}>
            Las ventas de este empleado no generan comisión.
          </div>
        </div>
      )}

      {modeloPago === 'ALQUILER' && (
        <>
          <p className={styles.alqIntro}>
            En el modelo de alquiler, el colaborador te paga a ti (no al revés). El sistema no le calcula comisión.
          </p>

          <div className={styles.comSection}>
            <div className={styles.comSectionTitle}>Tipo de cuota</div>
            <div className={styles.comModelBtns}>
              <button
                type="button"
                className={`${styles.comModelBtn} ${tipoCuota === 'POR_SERVICIO' ? styles.comModelBtnOn : ''}`}
                onClick={() => canWrite && setTipoCuota('POR_SERVICIO')}
              >
                Por servicio
              </button>
              <button
                type="button"
                className={`${styles.comModelBtn} ${tipoCuota === 'RENTA_PERIODO' ? styles.comModelBtnOn : ''}`}
                onClick={() => canWrite && setTipoCuota('RENTA_PERIODO')}
              >
                Renta por período
              </button>
            </div>
          </div>

          {tipoCuota === 'POR_SERVICIO' ? (
            <div className={styles.comSection}>
              <div className={styles.comSectionTitle}>Monto por servicio</div>
              <div className={styles.comRow}>
                <span className={styles.comPrefix}>RD$</span>
                <input
                  type="number" min={0.01} step={0.01}
                  value={montoPorServicio}
                  onChange={e => setMontoPorServicio(e.target.value)}
                  placeholder="0.00"
                  disabled={!canWrite}
                  className={styles.comPctInput}
                />
              </div>
              <p className={styles.alqHelp}>El colaborador te paga esta cantidad por cada servicio que realiza.</p>
            </div>
          ) : (
            <div className={styles.comSection}>
              <div className={styles.comSectionTitle}>Monto de renta</div>
              <div className={styles.comRow}>
                <span className={styles.comPrefix}>RD$</span>
                <input
                  type="number" min={0.01} step={0.01}
                  value={montoRenta}
                  onChange={e => setMontoRenta(e.target.value)}
                  placeholder="0.00"
                  disabled={!canWrite}
                  className={styles.comPctInput}
                />
              </div>
              <div className={styles.comSectionTitle} style={{ marginTop: 14 }}>Período</div>
              <div className={styles.comModelBtns}>
                <button
                  type="button"
                  className={`${styles.comModelBtn} ${periodoRenta === 'SEMANAL' ? styles.comModelBtnOn : ''}`}
                  onClick={() => canWrite && setPeriodoRenta('SEMANAL')}
                >
                  Semanal
                </button>
                <button
                  type="button"
                  className={`${styles.comModelBtn} ${periodoRenta === 'MENSUAL' ? styles.comModelBtnOn : ''}`}
                  onClick={() => canWrite && setPeriodoRenta('MENSUAL')}
                >
                  Mensual
                </button>
              </div>
              <p className={styles.alqHelp}>
                El colaborador te paga esta renta fija cada período, independientemente de cuántos servicios haga.
              </p>
            </div>
          )}

          <div className={styles.comSection}>
            <div className={styles.comSectionTitle}>Flujo del dinero</div>
            <div className={styles.comModelBtns}>
              <button
                type="button"
                className={`${styles.comModelBtn} ${flujoDinero === 'DIRECTO' ? styles.comModelBtnOn : ''}`}
                onClick={() => canWrite && setFlujoDinero('DIRECTO')}
              >
                El colaborador maneja su propio dinero
              </button>
              <button
                type="button"
                className={`${styles.comModelBtn} ${flujoDinero === 'POR_CAJA' ? styles.comModelBtnOn : ''}`}
                onClick={() => canWrite && setFlujoDinero('POR_CAJA')}
              >
                El dinero entra a la caja del negocio
              </button>
            </div>
            {flujoDinero === 'DIRECTO' ? (
              <div className={styles.comWarn}>
                Directo: el dinero de sus ventas NO entra a tu caja — el colaborador lo cobra por su cuenta. Solo queda registrada la cuota que te debe.
              </div>
            ) : (
              <div className={styles.comWarn}>
                Por caja: el dinero SÍ entra a tu caja junto con el resto de las ventas — lo verás desglosado aparte al cerrar caja, para saber cuánto de lo que hay en la gaveta es de este colaborador.
              </div>
            )}
          </div>
        </>
      )}

      {comErr && <p className={styles.modalErr}>{comErr}</p>}
      {comOk && <p className={styles.comOk}>{comOk}</p>}

      {canWrite && (
        <div className={styles.comSaveRow}>
          <button
            type="button"
            className={styles.btnSave}
            onClick={() => { setComErr(''); guardar.mutate(); }}
            disabled={guardar.isPending}
          >
            {guardar.isPending ? 'Guardando...' : modeloPago === 'ALQUILER' ? 'Guardar alquiler' : 'Guardar comisión'}
          </button>
        </div>
      )}

      {switchWarn === 'pierde-comision' && (
        <ConfirmModal
          title={pendingModelo === 'ALQUILER' ? 'Cambiar a alquiler' : 'Cambiar a sueldo fijo'}
          message={`Al cambiar a ${pendingModelo === 'ALQUILER' ? 'alquiler' : 'sueldo fijo'} se eliminará la configuración de comisiones de este empleado. Las ventas ya registradas no cambian.`}
          confirmLabel="Sí, cambiar"
          danger
          loading={false}
          onConfirm={() => { setSwitchWarn(null); if (pendingModelo) applyModeloChange(pendingModelo); setPendingModelo(null); }}
          onClose={() => { setSwitchWarn(null); setPendingModelo(null); }}
        />
      )}

      {switchWarn === 'salir-alquiler' && (
        <ConfirmModal
          title="Salir del modelo de alquiler"
          message="Su configuración de alquiler (tipo de cuota, monto, flujo del dinero) se desactivará al guardar — se conserva por si vuelve a este modo más adelante, pero deja de generar cuotas nuevas. Las deudas de alquiler ya generadas no cambian."
          confirmLabel="Sí, cambiar"
          danger
          loading={false}
          onConfirm={() => { setSwitchWarn(null); if (pendingModelo) applyModeloChange(pendingModelo); setPendingModelo(null); }}
          onClose={() => { setSwitchWarn(null); setPendingModelo(null); }}
        />
      )}
    </div>
  );
}

// ── IntegranteDrawer ───────────────────────────────────────
function IntegranteDrawer({
  data, initialTab = 'datos', sucursales, servicios, onClose, onSuccess,
}: {
  data?: Integrante;
  initialTab?: Tab;
  sucursales: Sucursal[];
  servicios: Servicio[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!data;
  const qc = useQueryClient();
  useLockBodyScroll();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [savedId, setSavedId] = useState<string | null>(data?.id ?? null);
  const [drawerErr, setDrawerErr] = useState('');

  const [form, setForm] = useState({
    nombre:          data?.nombre ?? '',
    puesto:          data?.puesto ?? '',
    telefono:        data?.telefono ?? '',
    sucursalId:      data?.sucursalId ?? '',
    activo:          data?.activo ?? true,
    enVacaciones:    data?.enVacaciones ?? false,
    participaAgenda: data?.participaAgenda ?? true,
  });

  const [horarios, setHorarios] = useState<Record<number, { activo: boolean; inicio: string; fin: string }>>(() => {
    const base: Record<number, { activo: boolean; inicio: string; fin: string }> = {};
    DIAS.forEach(d => { base[d.n] = { activo: false, inicio: '09:00', fin: '18:00' }; });
    return base;
  });
  const [horariosLoaded, setHorariosLoaded] = useState(!isEdit);
  const [horariosErr, setHorariosErr] = useState('');

  const [selEsp, setSelEsp] = useState<Set<string>>(new Set());
  const [espLoaded, setEspLoaded] = useState(!isEdit);
  const [espErr, setEspErr] = useState('');

  const { data: detalle } = useQuery<IntegranteDetalle>({
    queryKey: ['equipo-detalle', data?.id],
    queryFn: () => api.get(`/empleados/${data!.id}`).then(r => r.data),
    enabled: !!data?.id,
  });

  useEffect(() => {
    if (!detalle) return;
    const base: Record<number, { activo: boolean; inicio: string; fin: string }> = {};
    DIAS.forEach(d => { base[d.n] = { activo: false, inicio: '09:00', fin: '18:00' }; });
    for (const h of detalle.horarios) {
      base[h.diaSemana] = { activo: h.activo, inicio: h.horaInicio, fin: h.horaFin };
    }
    setHorarios(base);
    setHorariosLoaded(true);
    setSelEsp(new Set(detalle.especialidades.map(e => e.servicioId)));
    setEspLoaded(true);
  }, [detalle]);

  const guardarDatos = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        nombre: form.nombre.trim(),
        puesto: form.puesto.trim() || undefined,
        telefono: form.telefono.trim() || undefined,
        sucursalId: form.sucursalId || undefined,
        activo: form.activo,
        participaAgenda: form.participaAgenda,
        ...(isEdit && { enVacaciones: form.enVacaciones }),
      };
      if (isEdit) return api.patch(`/empleados/${savedId}`, body).then(r => r.data);
      return api.post('/empleados', body).then(r => r.data);
    },
    onSuccess: (res) => {
      setSavedId(res.id);
      qc.invalidateQueries({ queryKey: ['equipo'] });
      qc.invalidateQueries({ queryKey: ['empresa-equipo'] });
      setDrawerErr('');
      if (isEdit) {
        onSuccess();
      } else {
        setTab('horarios');
        setHorariosLoaded(true);
      }
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
      for (const h of arr) {
        if (h.horaFin <= h.horaInicio) {
          throw new Error(`${DIAS.find(d => d.n === h.diaSemana)?.label}: hora fin debe ser mayor que hora inicio`);
        }
      }
      return api.put(`/empleados/${savedId}/horarios`, { horarios: arr }).then(r => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipo-detalle', savedId] });
      setHorariosErr('');
    },
    onError: (e) => setHorariosErr(errMsg(e)),
  });

  const guardarEsp = useMutation({
    mutationFn: () =>
      api.put(`/empleados/${savedId}/especialidades`, { servicioIds: [...selEsp] }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipo-detalle', savedId] });
      setEspErr('');
    },
    onError: (e) => setEspErr(errMsg(e)),
  });

  function aplicarLV() {
    const ref = horarios[1];
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
        <div className={styles.drawerHead}>
          <h3>{isEdit ? `Editar — ${data!.nombre}` : 'Nuevo integrante'}</h3>
          <button type="button" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className={styles.tabs}>
          <button type="button" className={`${styles.tab} ${tab === 'datos' ? styles.tabActive : ''}`} onClick={() => setTab('datos')}>Datos</button>
          <button
            type="button" className={`${styles.tab} ${tab === 'horarios' ? styles.tabActive : ''}`}
            onClick={() => setTab('horarios')} disabled={!savedId}
            title={!savedId ? 'Primero guarda los datos básicos' : undefined}
          >Horarios</button>
          <button
            type="button" className={`${styles.tab} ${tab === 'especialidades' ? styles.tabActive : ''}`}
            onClick={() => setTab('especialidades')} disabled={!savedId}
            title={!savedId ? 'Primero guarda los datos básicos' : undefined}
          >Especialidades</button>
          <button
            type="button" className={`${styles.tab} ${tab === 'comision' ? styles.tabActive : ''}`}
            onClick={() => setTab('comision')} disabled={!savedId}
            title={!savedId ? 'Primero guarda los datos básicos' : undefined}
          >Comisión</button>
        </div>

        <div className={styles.drawerBody}>

          {/* ── DATOS ── */}
          {tab === 'datos' && (
            <div className={styles.tabContent}>
              <div className={styles.formGrid}>
                <div className={`${styles.formField} ${styles.fieldFull}`}>
                  <label>Nombre *</label>
                  <input
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Nombre completo"
                    maxLength={150}
                    autoFocus
                  />
                </div>
                <div className={styles.formField}>
                  <label>Cargo</label>
                  <input
                    list="cargo-sugerencias"
                    value={form.puesto}
                    onChange={e => setForm(f => ({ ...f, puesto: e.target.value }))}
                    placeholder="Ej. Estilista"
                    maxLength={60}
                  />
                  <datalist id="cargo-sugerencias">
                    {CARGO_SUGERENCIAS.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className={styles.formField}>
                  <label>Teléfono</label>
                  <input
                    value={form.telefono}
                    onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                    placeholder="809-000-0000"
                    maxLength={30}
                  />
                </div>
                <div className={`${styles.formField} ${styles.fieldFull}`}>
                  <label>Sucursal</label>
                  <select value={form.sucursalId} onChange={e => setForm(f => ({ ...f, sucursalId: e.target.value }))}>
                    <option value="">— Sin asignar —</option>
                    {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>

                <div className={`${styles.toggleSection} ${styles.fieldFull}`}>
                  <div className={styles.toggleRow}>
                    <div className={styles.toggleInfo}>
                      <span className={styles.toggleLabel}>Participa en agenda</span>
                      <span className={styles.toggleHint}>
                        Si está activo, aparece como profesional reservable en la agenda
                      </span>
                    </div>
                    <label className={styles.toggleSwitch}>
                      <input
                        type="checkbox"
                        checked={form.participaAgenda}
                        onChange={e => setForm(f => ({ ...f, participaAgenda: e.target.checked }))}
                      />
                      <span className={styles.toggleTrack} />
                    </label>
                  </div>
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
                <p className={styles.fieldHint} style={{ marginTop: 10 }}>
                  Guarda los datos con el botón de abajo para continuar — se habilitarán las pestañas de Horarios, Especialidades y Comisión.
                </p>
              )}
              {drawerErr && <p className={styles.modalErr}>{drawerErr}</p>}
            </div>
          )}

          {/* ── HORARIOS ── */}
          {tab === 'horarios' && (
            <div className={styles.tabContent}>
              {!form.participaAgenda && (
                <div className={styles.noAgendaNote}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="14" height="14">
                    <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                  </svg>
                  Este integrante no participa en la agenda, pero puedes configurar su horario de todos modos.
                </div>
              )}
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
                          <input type="time" value={horarios[d.n]?.inicio ?? '09:00'} disabled={!horarios[d.n]?.activo}
                            onChange={e => setHorarios(prev => ({ ...prev, [d.n]: { ...prev[d.n], inicio: e.target.value } }))}
                            className={styles.timeInput} />
                          <span className={styles.timeSep}>–</span>
                          <input type="time" value={horarios[d.n]?.fin ?? '18:00'} disabled={!horarios[d.n]?.activo}
                            onChange={e => setHorarios(prev => ({ ...prev, [d.n]: { ...prev[d.n], fin: e.target.value } }))}
                            className={styles.timeInput} />
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

          {/* ── ESPECIALIDADES ── */}
          {tab === 'especialidades' && (
            <div className={styles.tabContent}>
              {!form.participaAgenda && (
                <div className={styles.noAgendaNote}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="14" height="14">
                    <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                  </svg>
                  Este integrante no participa en la agenda, pero puedes configurar sus especialidades de todos modos.
                </div>
              )}
              {!espLoaded ? (
                <div className={styles.loadWrap}><div className={styles.spinner} /></div>
              ) : (
                <>
                  <p className={styles.espHint}>Marca los servicios que este integrante puede realizar. Afecta la disponibilidad en agenda.</p>
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

          {/* ── COMISIÓN ── */}
          {tab === 'comision' && savedId && (
            <ComisionTab key={savedId} empleadoId={savedId} servicios={servicios} />
          )}
        </div>

        <div className={styles.drawerFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose}
            disabled={guardarDatos.isPending || guardarHorarios.isPending || guardarEsp.isPending}>
            Cancelar
          </button>
          {tab === 'datos' && (
            <button type="button" className={styles.btnSave}
              onClick={() => guardarDatos.mutate()}
              disabled={!datosValidos || guardarDatos.isPending}>
              {guardarDatos.isPending ? 'Guardando...' : isEdit ? 'Guardar datos' : 'Guardar y continuar →'}
            </button>
          )}
          {tab === 'horarios' && savedId && (
            <button type="button" className={styles.btnSave}
              onClick={() => guardarHorarios.mutate()}
              disabled={guardarHorarios.isPending}>
              {guardarHorarios.isPending ? 'Guardando...' : 'Guardar horarios'}
            </button>
          )}
          {tab === 'especialidades' && savedId && (
            <button type="button" className={styles.btnSave}
              onClick={() => guardarEsp.mutate()}
              disabled={guardarEsp.isPending}>
              {guardarEsp.isPending ? 'Guardando...' : 'Guardar especialidades'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── IntegranteRow (desktop) ────────────────────────────────
function IntegranteRow({
  integrante: i, canWrite, canDelete, canManageAcceso, currentUserId,
  openMenuId, onMenuToggle, onEdit, onHorarios, onEspecialidades, onComision,
  onCrearAcceso, onGestionarAcceso, onToggleActivo, onDelete,
}: {
  integrante: Integrante;
  canWrite: boolean;
  canDelete: boolean;
  canManageAcceso: boolean;
  currentUserId: string;
  openMenuId: string | null;
  onMenuToggle: (id: string | null) => void;
  onEdit: () => void;
  onHorarios: () => void;
  onEspecialidades: () => void;
  onComision: () => void;
  onCrearAcceso: () => void;
  onGestionarAcceso: () => void;
  onToggleActivo: () => void;
  onDelete: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);
  const menuOpen = openMenuId === i.id;
  const isSelf = i.usuarioId === currentUserId;

  function handleToggle() {
    if (!menuOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < APPROX_MENU_H ? rect.top - APPROX_MENU_H - 4 : rect.bottom + 4;
      setDropPos({ top, right: window.innerWidth - rect.right });
    }
    onMenuToggle(menuOpen ? null : i.id);
  }

  const roleKey = i.usuario?.rol?.roleKey ?? '';

  return (
    <tr>
      <td>
        <div className={styles.nameCell}>
          <div className={styles.avatar} style={{ backgroundColor: avatarBg(i.nombre) }}>
            {initiales(i.nombre)}
          </div>
          <div>
            <div className={styles.empNombre}>
              {i.nombre}
              {isSelf && <span className={styles.selfTag}>Tú</span>}
            </div>
            {i.puesto && <div className={styles.empPuesto}>{i.puesto}</div>}
          </div>
        </div>
      </td>
      <td>
        <div className={styles.rolAccesoCell}>
          {i.usuario ? (
            <>
              <span className={`${styles.rolChip} ${(styles as any)[`role_${roleKey}`] ?? ''}`}>
                {i.usuario.rol.nombre}
              </span>
              <span className={styles.chipConAcceso}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="9" height="9">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                Acceso al sistema
              </span>
            </>
          ) : (
            <>
              <span className={styles.chipSinAcceso}>Sin acceso</span>
              <span className={styles.sinCuentaLabel}>Sin cuenta del sistema</span>
            </>
          )}
        </div>
      </td>
      <td className={styles.mutedCell}>{i.sucursal?.nombre ?? '—'}</td>
      <td>
        <div className={styles.espChips}>
          {i.especialidades.length === 0 ? (
            <span className={styles.espNone}>—</span>
          ) : (
            <>
              {i.especialidades.slice(0, 3).map(e => (
                <span key={e.servicio.id} className={styles.espChip}>{e.servicio.nombre}</span>
              ))}
              {i.especialidades.length > 3 && (
                <span
                  className={styles.espChipMore}
                  title={i.especialidades.slice(3).map(e => e.servicio.nombre).join(', ')}
                >
                  +{i.especialidades.length - 3}
                </span>
              )}
            </>
          )}
        </div>
      </td>
      <td>
        <div className={styles.badgesCell}>
          <span className={i.activo ? styles.badgeOn : styles.badgeOff}>
            {i.activo ? 'Activo' : 'Inactivo'}
          </span>
          {i.enVacaciones && <span className={styles.badgeVac}>Vacaciones</span>}
          {i.participaAgenda && i.activo && <span className={styles.badgeAgenda}>En agenda</span>}
        </div>
      </td>
      <td>
        {canWrite && (
          <div className={styles.menuWrap} onClick={(e) => e.stopPropagation()}>
            <button ref={btnRef} type="button" className={styles.menuBtn} onClick={handleToggle}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>
            {menuOpen && dropPos && (
              <div className={styles.menuDropdown} style={{ top: dropPos.top, right: dropPos.right }}>
                <button type="button" onClick={onEdit} className={styles.menuItem}>
                  <span className={styles.menuItemIcon}><IcoEdit /></span>
                  Editar datos
                </button>
                <button type="button" onClick={onHorarios} className={styles.menuItem}>
                  <span className={styles.menuItemIcon}><IcoClock /></span>
                  Horarios
                </button>
                <button type="button" onClick={onEspecialidades} className={styles.menuItem}>
                  <span className={styles.menuItemIcon}><IcoStar /></span>
                  Especialidades
                </button>
                <button type="button" onClick={onComision} className={styles.menuItem}>
                  <span className={styles.menuItemIcon}><IcoDollar /></span>
                  Comisiones
                </button>

                {canManageAcceso && (
                  <>
                    <div className={styles.menuDivider} />
                    {i.usuario ? (
                      <button type="button" onClick={onGestionarAcceso} className={styles.menuItem}>
                        <span className={styles.menuItemIcon}><IcoShield /></span>
                        Gestionar acceso
                      </button>
                    ) : (
                      <button type="button" onClick={onCrearAcceso} className={styles.menuItem}>
                        <span className={styles.menuItemIcon}><IcoShieldOff /></span>
                        Crear acceso
                      </button>
                    )}
                  </>
                )}

                <div className={styles.menuDivider} />
                <button type="button" onClick={onToggleActivo} className={styles.menuItem}>
                  <span className={styles.menuItemIcon}><IcoToggle /></span>
                  {i.activo ? 'Desactivar' : 'Activar'}
                </button>
                {canDelete && (
                  <>
                    <div className={styles.menuDivider} />
                    <button type="button" className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={onDelete}>
                      <span className={styles.menuItemIcon}><IcoTrash /></span>
                      Eliminar
                    </button>
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

// ── MobileIntegranteCard ───────────────────────────────────
function MobileIntegranteCard({
  integrante: i, canWrite, canDelete, canManageAcceso, currentUserId,
  onEdit, onHorarios, onEspecialidades, onComision, onCrearAcceso, onGestionarAcceso, onToggleActivo, onDelete,
}: {
  integrante: Integrante;
  canWrite: boolean;
  canDelete: boolean;
  canManageAcceso: boolean;
  currentUserId: string;
  onEdit: () => void;
  onHorarios: () => void;
  onEspecialidades: () => void;
  onComision: () => void;
  onCrearAcceso: () => void;
  onGestionarAcceso: () => void;
  onToggleActivo: () => void;
  onDelete: () => void;
}) {
  const isSelf = i.usuarioId === currentUserId;
  const roleKey = i.usuario?.rol?.roleKey ?? '';

  return (
    <div className={styles.mobileCard}>
      <div className={styles.mobileCardTop}>
        <div className={styles.mobileCardLeft}>
          <div className={styles.mobileCardName}>
            <div className={styles.avatar} style={{ backgroundColor: avatarBg(i.nombre) }}>
              {initiales(i.nombre)}
            </div>
            <span>{i.nombre}</span>
            {isSelf && <span className={styles.selfTag}>Tú</span>}
          </div>
          {i.puesto && <div className={styles.mobileCardPuesto}>{i.puesto}</div>}
          {i.sucursal && <div className={styles.mobileCardSuc}>{i.sucursal.nombre}</div>}
        </div>
        <div className={styles.mobileCardRight}>
          <div className={styles.rolAccesoCell}>
            {i.usuario ? (
              <>
                <span className={`${styles.rolChip} ${(styles as any)[`role_${roleKey}`] ?? ''}`}>
                  {i.usuario.rol.nombre}
                </span>
                <span className={styles.chipConAcceso}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="9" height="9">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  Acceso al sistema
                </span>
              </>
            ) : (
              <>
                <span className={styles.chipSinAcceso}>Sin acceso</span>
                <span className={styles.sinCuentaLabel}>Sin cuenta</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className={styles.mobileCardMeta}>
        <span className={i.activo ? styles.badgeOn : styles.badgeOff}>
          {i.activo ? 'Activo' : 'Inactivo'}
        </span>
        {i.enVacaciones && <span className={styles.badgeVac}>Vacaciones</span>}
        {i.participaAgenda && i.activo && <span className={styles.badgeAgenda}>En agenda</span>}
        {i.especialidades.length > 0 && (
          <>
            {i.especialidades.slice(0, 2).map(e => (
              <span key={e.servicio.id} className={styles.espChip}>{e.servicio.nombre}</span>
            ))}
            {i.especialidades.length > 2 && (
              <span className={styles.espChipMore}>+{i.especialidades.length - 2}</span>
            )}
          </>
        )}
      </div>
      {canWrite && (
        <div className={styles.mobileCardActions}>
          <button type="button" className={styles.mobileActionBtn} onClick={onEdit}>Editar</button>
          <button type="button" className={styles.mobileActionBtn} onClick={onHorarios}>Horarios</button>
          <button type="button" className={styles.mobileActionBtn} onClick={onEspecialidades}>Especialidades</button>
          <button type="button" className={styles.mobileActionBtn} onClick={onComision}>Comisiones</button>
          {canManageAcceso && (
            i.usuario ? (
              <button type="button" className={styles.mobileActionBtn} onClick={onGestionarAcceso}>Gestionar acceso</button>
            ) : (
              <button type="button" className={styles.mobileActionBtn} onClick={onCrearAcceso}>Crear acceso</button>
            )
          )}
          <button type="button" className={styles.mobileActionBtn} onClick={onToggleActivo}>
            {i.activo ? 'Desactivar' : 'Activar'}
          </button>
          {canDelete && (
            <button type="button" className={`${styles.mobileActionBtn} ${styles.mobileActionDanger}`} onClick={onDelete}>
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── EquipoPage ─────────────────────────────────────────────
export function EquipoPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { toast, show: showToast } = useToast();

  const currentUserId = user?.id ?? '';
  const currentRol = user?.rol ?? '';
  const canWrite        = OWNER_ADMIN_MANAGER.has(currentRol);
  const canDelete       = OWNER_ADMIN.has(currentRol);
  const canManageAcceso = OWNER_ADMIN.has(currentRol);

  const { data: integrantes = [], isLoading } = useQuery<Integrante[]>({
    queryKey: ['equipo'],
    queryFn: () => api.get('/empleados').then(r => r.data),
  });

  const { data: empresa } = useQuery<EmpresaInfo>({
    queryKey: ['empresa-equipo'],
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

  const { data: roles = [] } = useQuery<Rol[]>({
    queryKey: ['usuarios-roles'],
    queryFn: () => api.get('/usuarios/roles').then(r => r.data),
  });

  // Summary stats (real, computed from full list)
  const totalIntegrantes = integrantes.length;
  const enAgenda      = integrantes.filter(i => i.activo && i.participaAgenda).length;
  const conAcceso     = integrantes.filter(i => i.usuario !== null).length;
  const enVacaciones  = integrantes.filter(i => i.enVacaciones).length;
  const inactivos     = integrantes.filter(i => !i.activo).length;

  const maxEmp   = empresa?.maxEmpleados ?? null;
  const atLimit  = maxEmp !== null && totalIntegrantes >= maxEmp;
  const limitPct = maxEmp ? Math.min((totalIntegrantes / maxEmp) * 100, 100) : 0;

  // Filter state
  const [searchText,     setSearchText]     = useState('');
  const [filterSucursal, setFilterSucursal] = useState('');
  const [filterRol,      setFilterRol]      = useState('');
  const [filterEstado,   setFilterEstado]   = useState('');
  const [filterAcceso,   setFilterAcceso]   = useState('');

  // Client-side filtered list (used for the table)
  const filteredIntegrantes = integrantes.filter(i => {
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!i.nombre.toLowerCase().includes(q) && !(i.puesto?.toLowerCase().includes(q))) return false;
    }
    if (filterSucursal && i.sucursalId !== filterSucursal) return false;
    if (filterRol && (!i.usuario || i.usuario.rol.roleKey !== filterRol)) return false;
    if (filterEstado === 'activos' && !i.activo) return false;
    if (filterEstado === 'inactivos' && i.activo) return false;
    if (filterEstado === 'vacaciones' && !i.enVacaciones) return false;
    if (filterAcceso === 'con' && !i.usuario) return false;
    if (filterAcceso === 'sin' && i.usuario) return false;
    return true;
  });

  const hasFilters = !!(searchText || filterSucursal || filterRol || filterEstado || filterAcceso);

  // UI state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [drawerTarget, setDrawerTarget] = useState<DrawerState | null>(null);
  const [crearAccesoTarget, setCrearAccesoTarget] = useState<Integrante | null>(null);
  const [gestionarAccesoTarget, setGestionarAccesoTarget] = useState<Integrante | null>(null);
  const [tempPwd, setTempPwd] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ tipo: 'toggle' | 'delete'; integrante: Integrante } | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    function handle(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest(`.${styles.menuWrap}`)) setOpenMenuId(null);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [openMenuId]);

  const toggleActivo = useMutation({
    mutationFn: (i: Integrante) =>
      api.patch(`/empleados/${i.id}`, { activo: !i.activo }).then(r => r.data),
    onSuccess: (_, i) => {
      qc.invalidateQueries({ queryKey: ['equipo'] });
      showToast(i.activo ? 'Integrante desactivado.' : 'Integrante activado.');
      setConfirmTarget(null);
    },
    onError: (e) => { showToast(errMsg(e), false); setConfirmTarget(null); },
  });

  const eliminar = useMutation({
    mutationFn: (i: Integrante) => api.delete(`/empleados/${i.id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipo'] });
      qc.invalidateQueries({ queryKey: ['empresa-equipo'] });
      showToast('Integrante eliminado.');
      setConfirmTarget(null);
    },
    onError: (e) => { showToast(errMsg(e), false); setConfirmTarget(null); },
  });

  return (
    <div className={styles.page} onClick={() => setOpenMenuId(null)}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Equipo</div>
          <div className={styles.sub}>Gestiona a tu equipo de trabajo y sus accesos al sistema.</div>
        </div>
        {canWrite && (
          <button
            className={styles.btnNew}
            onClick={() => setDrawerTarget({ data: 'new', tab: 'datos' })}
            disabled={atLimit}
            title={atLimit ? 'Has alcanzado el límite de tu plan' : undefined}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo integrante
          </button>
        )}
      </div>

      {/* Limit bar */}
      {maxEmp !== null && (
        <div className={styles.limitBox}>
          <div className={styles.limitRow}>
            <span className={styles.limitLabel}>{totalIntegrantes} de {maxEmp} integrantes</span>
            {atLimit && <span className={styles.limitWarn}>Límite alcanzado — actualiza tu plan.</span>}
          </div>
          <div className={styles.limitTrack}>
            <div
              className={`${styles.limitFill} ${atLimit ? styles.limitFillFull : ''}`}
              style={{ width: `${limitPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Summary cards */}
      {!isLoading && totalIntegrantes > 0 && (
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={`${styles.summaryCardIcon} ${styles.summaryIconDefault}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                <path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </div>
            <div className={styles.summaryCardBody}>
              <div className={styles.summaryValue}>{totalIntegrantes}</div>
              <div className={styles.summaryLabel}>Total integrantes</div>
              <div className={styles.summarySubLabel}>En el equipo</div>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={`${styles.summaryCardIcon} ${styles.summaryIconGold}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
              </svg>
            </div>
            <div className={styles.summaryCardBody}>
              <div className={`${styles.summaryValue} ${styles.summaryGold}`}>{enAgenda}</div>
              <div className={styles.summaryLabel}>En agenda</div>
              <div className={styles.summarySubLabel}>Profesionales activos</div>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={`${styles.summaryCardIcon} ${styles.summaryIconGreen}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div className={styles.summaryCardBody}>
              <div className={`${styles.summaryValue} ${styles.summaryGreen}`}>{conAcceso}</div>
              <div className={styles.summaryLabel}>Con acceso</div>
              <div className={styles.summarySubLabel}>Al sistema</div>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={`${styles.summaryCardIcon} ${styles.summaryIconBlue}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3"/>
                <rect x="9" y="11" width="14" height="10" rx="2"/>
                <path d="M13 16h4m-2-2v4"/>
              </svg>
            </div>
            <div className={styles.summaryCardBody}>
              <div className={styles.summaryValue}>{enVacaciones}</div>
              <div className={styles.summaryLabel}>En vacaciones</div>
              <div className={styles.summarySubLabel}>Fuera del servicio</div>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={`${styles.summaryCardIcon} ${inactivos > 0 ? styles.summaryIconMuted : styles.summaryIconDefault}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
            </div>
            <div className={styles.summaryCardBody}>
              <div className={`${styles.summaryValue} ${inactivos > 0 ? styles.summaryMuted : ''}`}>{inactivos}</div>
              <div className={styles.summaryLabel}>Inactivos</div>
              <div className={styles.summarySubLabel}>No disponibles</div>
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      {!isLoading && integrantes.length > 0 && (
        <div className={styles.filterBar}>
          <div className={styles.filterSearch}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={styles.filterSearchIcon}>
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              className={styles.filterSearchInput}
              placeholder="Buscar integrante..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            {searchText && (
              <button type="button" className={styles.filterClear} onClick={() => setSearchText('')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>
          <div className={styles.filterSelects}>
            <select className={styles.filterSelect} value={filterSucursal} onChange={e => setFilterSucursal(e.target.value)}>
              <option value="">Todas las sucursales</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <select className={styles.filterSelect} value={filterRol} onChange={e => setFilterRol(e.target.value)}>
              <option value="">Todos los roles</option>
              {roles.map(r => <option key={r.id} value={r.roleKey}>{r.nombre}</option>)}
            </select>
            <select className={styles.filterSelect} value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="vacaciones">En vacaciones</option>
            </select>
            <select className={styles.filterSelect} value={filterAcceso} onChange={e => setFilterAcceso(e.target.value)}>
              <option value="">Todos los accesos</option>
              <option value="con">Con acceso</option>
              <option value="sin">Sin acceso</option>
            </select>
          </div>
        </div>
      )}

      {/* Table */}
      <div className={styles.tableCard}>
        {isLoading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : integrantes.length === 0 ? (
          <div className={styles.emptyMsg}>No hay integrantes registrados. ¡Agrega el primero!</div>
        ) : filteredIntegrantes.length === 0 ? (
          <div className={styles.emptyMsg}>
            No hay integrantes que coincidan con los filtros.{' '}
            {hasFilters && (
              <button
                type="button"
                className={styles.clearFiltersBtn}
                onClick={() => { setSearchText(''); setFilterSucursal(''); setFilterRol(''); setFilterEstado(''); setFilterAcceso(''); }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className={styles.tableDesktop}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Integrante</th>
                    <th>Rol / Acceso</th>
                    <th>Sucursal</th>
                    <th>Especialidades</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredIntegrantes.map(i => (
                    <IntegranteRow
                      key={i.id}
                      integrante={i}
                      canWrite={canWrite}
                      canDelete={canDelete}
                      canManageAcceso={canManageAcceso}
                      currentUserId={currentUserId}
                      openMenuId={openMenuId}
                      onMenuToggle={setOpenMenuId}
                      onEdit={() => { setDrawerTarget({ data: i, tab: 'datos' }); setOpenMenuId(null); }}
                      onHorarios={() => { setDrawerTarget({ data: i, tab: 'horarios' }); setOpenMenuId(null); }}
                      onEspecialidades={() => { setDrawerTarget({ data: i, tab: 'especialidades' }); setOpenMenuId(null); }}
                      onComision={() => { setDrawerTarget({ data: i, tab: 'comision' }); setOpenMenuId(null); }}
                      onCrearAcceso={() => { setCrearAccesoTarget(i); setOpenMenuId(null); }}
                      onGestionarAcceso={() => { setGestionarAccesoTarget(i); setOpenMenuId(null); }}
                      onToggleActivo={() => { setConfirmTarget({ tipo: 'toggle', integrante: i }); setOpenMenuId(null); }}
                      onDelete={() => { setConfirmTarget({ tipo: 'delete', integrante: i }); setOpenMenuId(null); }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile */}
            <div className={styles.mobileCards}>
              {filteredIntegrantes.map(i => (
                <MobileIntegranteCard
                  key={i.id}
                  integrante={i}
                  canWrite={canWrite}
                  canDelete={canDelete}
                  canManageAcceso={canManageAcceso}
                  currentUserId={currentUserId}
                  onEdit={() => setDrawerTarget({ data: i, tab: 'datos' })}
                  onHorarios={() => setDrawerTarget({ data: i, tab: 'horarios' })}
                  onEspecialidades={() => setDrawerTarget({ data: i, tab: 'especialidades' })}
                  onComision={() => setDrawerTarget({ data: i, tab: 'comision' })}
                  onCrearAcceso={() => setCrearAccesoTarget(i)}
                  onGestionarAcceso={() => setGestionarAccesoTarget(i)}
                  onToggleActivo={() => setConfirmTarget({ tipo: 'toggle', integrante: i })}
                  onDelete={() => setConfirmTarget({ tipo: 'delete', integrante: i })}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Sin acceso banner */}
      {!isLoading && integrantes.some(i => !i.usuario) && (
        <div className={styles.sinAccesoBanner}>
          <div className={styles.sinAccesoBannerIco}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
            </svg>
          </div>
          <div className={styles.sinAccesoBannerBody}>
            <strong>¿Sin acceso al sistema?</strong>
            <span>Algunos integrantes aún no tienen cuenta. Usa el menú ••• de cada uno para crear su acceso y compartir su contraseña temporal.</span>
          </div>
        </div>
      )}

      {/* Drawer */}
      {drawerTarget !== null && (
        <IntegranteDrawer
          data={drawerTarget.data !== 'new' ? drawerTarget.data : undefined}
          initialTab={drawerTarget.tab}
          sucursales={sucursales}
          servicios={servicios}
          onClose={() => setDrawerTarget(null)}
          onSuccess={() => {
            showToast(drawerTarget.data === 'new' ? 'Integrante creado.' : 'Integrante actualizado.');
            setDrawerTarget(null);
          }}
        />
      )}

      {/* Crear acceso */}
      {crearAccesoTarget && (
        <CrearAccesoModal
          integrante={crearAccesoTarget}
          roles={roles}
          currentRol={currentRol}
          onClose={() => setCrearAccesoTarget(null)}
          onSuccess={(pwd) => {
            setCrearAccesoTarget(null);
            showToast('Acceso creado.');
            setTempPwd(pwd);
          }}
        />
      )}

      {/* Gestionar acceso */}
      {gestionarAccesoTarget?.usuario && (
        <GestionarAccesoModal
          integrante={gestionarAccesoTarget}
          roles={roles}
          currentRol={currentRol}
          currentUserId={currentUserId}
          onClose={() => setGestionarAccesoTarget(null)}
          onRefresh={() => qc.invalidateQueries({ queryKey: ['equipo'] })}
          onTempPwd={(pwd) => {
            setGestionarAccesoTarget(null);
            showToast('Contraseña restablecida.');
            setTempPwd(pwd);
          }}
        />
      )}

      {/* Temp password */}
      {tempPwd && (
        <TempPasswordModal password={tempPwd} onClose={() => setTempPwd(null)} />
      )}

      {/* Confirm toggle */}
      {confirmTarget?.tipo === 'toggle' && (
        <ConfirmModal
          title={confirmTarget.integrante.activo ? 'Desactivar integrante' : 'Activar integrante'}
          message={confirmTarget.integrante.activo
            ? `¿Desactivar a ${confirmTarget.integrante.nombre}? No aparecerá en la agenda ni en el POS.`
            : `¿Activar a ${confirmTarget.integrante.nombre}?`}
          confirmLabel={confirmTarget.integrante.activo ? 'Desactivar' : 'Activar'}
          danger={confirmTarget.integrante.activo}
          loading={toggleActivo.isPending}
          onConfirm={() => toggleActivo.mutate(confirmTarget.integrante)}
          onClose={() => setConfirmTarget(null)}
        />
      )}

      {/* Confirm delete */}
      {confirmTarget?.tipo === 'delete' && (
        <ConfirmModal
          title="Eliminar integrante"
          message={`¿Eliminar a ${confirmTarget.integrante.nombre}? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          danger
          loading={eliminar.isPending}
          onConfirm={() => eliminar.mutate(confirmTarget.integrante)}
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
