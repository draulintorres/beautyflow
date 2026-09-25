import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import styles from './SucursalesPage.module.css';

// ── Types ──────────────────────────────────────────────
interface Sucursal {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  esPrincipal: boolean;
  activo: boolean;
  createdAt: string;
}
interface EmpresaInfo {
  totalSucursales: number;
  maxSucursales: number | null;
}
interface Cabina {
  id: string;
  nombre: string;
  sucursalId: string;
  activa: boolean;
  sucursal?: { id: string; nombre: string };
}

// ── Helpers ────────────────────────────────────────────
const OWNER_ADMIN = new Set(['OWNER', 'ADMIN']);
const APPROX_MENU_H = 160;

const errMsg = (e: unknown) => {
  const msg = (e as any)?.response?.data?.message;
  return msg ? (Array.isArray(msg) ? msg.join(' · ') : String(msg)) : 'Error inesperado.';
};

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
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={loading}>Cancelar</button>
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

// ── SucursalModal (crear / editar) ─────────────────────
function SucursalModal({
  data, isFirst, onClose, onSuccess,
}: {
  data?: Sucursal;
  isFirst: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!data;
  const [form, setForm] = useState({
    nombre: data?.nombre ?? '',
    direccion: data?.direccion ?? '',
    telefono: data?.telefono ?? '',
    esPrincipal: data?.esPrincipal ?? isFirst,
    activo: data?.activo ?? true,
  });
  const [err, setErr] = useState('');
  const qc = useQueryClient();

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const guardar = useMutation({
    mutationFn: () => {
      const body = {
        nombre: form.nombre,
        ...(form.direccion && { direccion: form.direccion }),
        ...(form.telefono && { telefono: form.telefono }),
        esPrincipal: form.esPrincipal,
        ...(isEdit && { activo: form.activo }),
      };
      return isEdit
        ? api.patch(`/sucursales/${data!.id}`, body).then((r) => r.data)
        : api.post('/sucursales', body).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sucursales'] });
      qc.invalidateQueries({ queryKey: ['empresa-info'] });
      onSuccess();
    },
    onError: (e) => setErr(errMsg(e)),
  });

  const isValid = form.nombre.trim().length > 0;

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>{isEdit ? 'Editar sucursal' : 'Nueva sucursal'}</h3>
          <button type="button" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <div className={`${styles.formField} ${styles.fieldFull}`}>
              <label>Nombre *</label>
              <input
                value={form.nombre}
                onChange={(e) => set('nombre', e.target.value)}
                placeholder="Ej. Sucursal Naco"
                maxLength={120}
              />
            </div>
            <div className={`${styles.formField} ${styles.fieldFull}`}>
              <label>Dirección</label>
              <input
                value={form.direccion}
                onChange={(e) => set('direccion', e.target.value)}
                placeholder="Ej. Av. Winston Churchill, Santo Domingo"
                maxLength={255}
              />
            </div>
            <div className={styles.formField}>
              <label>Teléfono</label>
              <input
                value={form.telefono}
                onChange={(e) => set('telefono', e.target.value)}
                placeholder="809-000-0000"
                maxLength={30}
              />
            </div>
          </div>

          <div className={styles.checkRow}>
            <label>
              <input
                type="checkbox"
                checked={form.esPrincipal}
                onChange={(e) => set('esPrincipal', e.target.checked)}
                disabled={isFirst || (isEdit && data!.esPrincipal)}
              />
              Es la sucursal principal
            </label>
            {(isFirst || (isEdit && data!.esPrincipal)) && (
              <span className={styles.fieldHint}>
                {isFirst ? 'La primera sucursal siempre es principal' : 'Para cambiar de principal, marca otra sucursal como principal'}
              </span>
            )}
          </div>

          {err && <div className={styles.modalErr}>{err}</div>}
        </div>

        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={guardar.isPending}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnSave}
            onClick={() => guardar.mutate()}
            disabled={!isValid || guardar.isPending}
          >
            {guardar.isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear sucursal'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CabinaModal (crear / editar) ───────────────────────
function CabinaModal({
  data, sucursales, onClose, onSuccess,
}: {
  data?: Cabina;
  sucursales: Sucursal[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!data;
  const [form, setForm] = useState({
    nombre: data?.nombre ?? '',
    sucursalId: data?.sucursalId ?? sucursales.find((s) => s.esPrincipal)?.id ?? sucursales[0]?.id ?? '',
  });
  const [err, setErr] = useState('');
  const qc = useQueryClient();

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const guardar = useMutation({
    mutationFn: () => {
      const body = { nombre: form.nombre, sucursalId: form.sucursalId };
      return isEdit
        ? api.patch(`/cabinas/${data!.id}`, { nombre: body.nombre }).then((r) => r.data)
        : api.post('/cabinas', body).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cabinas'] });
      onSuccess();
    },
    onError: (e) => setErr(errMsg(e)),
  });

  const isValid = form.nombre.trim().length > 0 && !!form.sucursalId;

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`${styles.modal} ${styles.modalSm}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>{isEdit ? 'Editar cabina' : 'Nueva cabina'}</h3>
          <button type="button" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.formField}>
            <label>Nombre *</label>
            <input
              value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              placeholder="Ej. Cabina 1, Sala facial"
              maxLength={100}
            />
          </div>
          <div className={styles.formField}>
            <label>Sucursal *</label>
            <select
              className={styles.selectInput}
              value={form.sucursalId}
              onChange={(e) => set('sucursalId', e.target.value)}
              disabled={isEdit}
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
            {isEdit && <span className={styles.fieldHint}>Para cambiarla de sucursal, elimina esta cabina y crea una nueva.</span>}
          </div>

          {err && <div className={styles.modalErr}>{err}</div>}
        </div>

        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={guardar.isPending}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnSave}
            onClick={() => guardar.mutate()}
            disabled={!isValid || guardar.isPending}
          >
            {guardar.isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cabina'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CabinaRow (desktop) ─────────────────────────────────
function CabinaRow({
  c, canWrite, menuOpen, onMenuToggle, onEdit, onToggleActiva, onEliminar,
}: {
  c: Cabina;
  canWrite: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onEdit: () => void;
  onToggleActiva: () => void;
  onEliminar: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);

  function handleToggle() {
    if (!menuOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < APPROX_MENU_H ? rect.top - APPROX_MENU_H - 4 : rect.bottom + 4;
      setDropPos({ top, right: window.innerWidth - rect.right });
    }
    onMenuToggle();
  }

  return (
    <tr>
      <td><span className={styles.sucursalNombre}>{c.nombre}</span></td>
      <td className={styles.mutedCell}>{c.sucursal?.nombre ?? '—'}</td>
      <td>
        <span className={c.activa ? styles.badgeOn : styles.badgeOff}>
          {c.activa ? 'Activa' : 'Desactivada'}
        </span>
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
                <button type="button" onClick={onEdit}>Editar</button>
                <button type="button" onClick={onToggleActiva}>
                  {c.activa ? 'Desactivar' : 'Activar'}
                </button>
                <div className={styles.menuDivider} />
                <button type="button" className={styles.menuItemDanger} onClick={onEliminar}>
                  Eliminar
                </button>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ── MobileCabinaCard ────────────────────────────────────
function MobileCabinaCard({
  c, canWrite, onEdit, onToggleActiva, onEliminar,
}: {
  c: Cabina;
  canWrite: boolean;
  onEdit: () => void;
  onToggleActiva: () => void;
  onEliminar: () => void;
}) {
  return (
    <div className={styles.mobileCard}>
      <div className={styles.mobileCardTop}>
        <div className={styles.mobileCardLeft}>
          <div className={styles.mobileCardName}>{c.nombre}</div>
          <div className={styles.mobileCardDir}>{c.sucursal?.nombre ?? '—'}</div>
        </div>
        <span className={c.activa ? styles.badgeOn : styles.badgeOff}>
          {c.activa ? 'Activa' : 'Desactivada'}
        </span>
      </div>
      {canWrite && (
        <div className={styles.mobileCardActions}>
          <button type="button" className={styles.mobileActionBtn} onClick={onEdit}>Editar</button>
          <button type="button" className={styles.mobileActionBtn} onClick={onToggleActiva}>
            {c.activa ? 'Desactivar' : 'Activar'}
          </button>
          <button
            type="button"
            className={`${styles.mobileActionBtn} ${styles.mobileActionDanger}`}
            onClick={onEliminar}
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

// ── SucursalRow (desktop) ──────────────────────────────
function SucursalRow({
  s, isOnly, canWrite, menuOpen, onMenuToggle, onEdit, onSetPrincipal,
  onToggleActivo, onEliminar,
}: {
  s: Sucursal;
  isOnly: boolean;
  canWrite: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onEdit: () => void;
  onSetPrincipal: () => void;
  onToggleActivo: () => void;
  onEliminar: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);

  function handleToggle() {
    if (!menuOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < APPROX_MENU_H ? rect.top - APPROX_MENU_H - 4 : rect.bottom + 4;
      setDropPos({ top, right: window.innerWidth - rect.right });
    }
    onMenuToggle();
  }

  const deleteDisabled = s.esPrincipal || isOnly;
  const deleteTip = s.esPrincipal
    ? 'Marca otra como principal primero'
    : isOnly
    ? 'No puedes eliminar la única sucursal'
    : undefined;

  return (
    <tr>
      <td>
        <div className={styles.nameCell}>
          <span className={styles.sucursalNombre}>{s.nombre}</span>
          {s.esPrincipal && <span className={styles.principalBadge}>Principal</span>}
        </div>
      </td>
      <td className={styles.mutedCell}>{s.direccion ?? '—'}</td>
      <td className={styles.mutedCell}>{s.telefono ?? '—'}</td>
      <td>
        <span className={s.activo ? styles.badgeOn : styles.badgeOff}>
          {s.activo ? 'Activa' : 'Desactivada'}
        </span>
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
                <button type="button" onClick={onEdit}>Editar</button>
                {!s.esPrincipal && (
                  <button type="button" onClick={onSetPrincipal}>Marcar como principal</button>
                )}
                <button type="button" onClick={onToggleActivo}>
                  {s.activo ? 'Desactivar' : 'Activar'}
                </button>
                <div className={styles.menuDivider} />
                <button
                  type="button"
                  className={deleteDisabled ? styles.menuItemDisabled : styles.menuItemDanger}
                  onClick={deleteDisabled ? undefined : onEliminar}
                  title={deleteTip}
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ── MobileSucursalCard ─────────────────────────────────
function MobileSucursalCard({
  s, isOnly, canWrite, onEdit, onSetPrincipal, onToggleActivo, onEliminar,
}: {
  s: Sucursal;
  isOnly: boolean;
  canWrite: boolean;
  onEdit: () => void;
  onSetPrincipal: () => void;
  onToggleActivo: () => void;
  onEliminar: () => void;
}) {
  const deleteDisabled = s.esPrincipal || isOnly;

  return (
    <div className={styles.mobileCard}>
      <div className={styles.mobileCardTop}>
        <div className={styles.mobileCardLeft}>
          <div className={styles.mobileCardName}>
            {s.nombre}
            {s.esPrincipal && <span className={styles.principalBadge}>Principal</span>}
          </div>
          {s.direccion && <div className={styles.mobileCardDir}>{s.direccion}</div>}
          {s.telefono && <div className={styles.mobileCardTel}>{s.telefono}</div>}
        </div>
        <span className={s.activo ? styles.badgeOn : styles.badgeOff}>
          {s.activo ? 'Activa' : 'Desactivada'}
        </span>
      </div>

      {canWrite && (
        <div className={styles.mobileCardActions}>
          <button type="button" className={styles.mobileActionBtn} onClick={onEdit}>Editar</button>
          {!s.esPrincipal && (
            <button type="button" className={styles.mobileActionBtn} onClick={onSetPrincipal}>
              Marcar principal
            </button>
          )}
          <button type="button" className={styles.mobileActionBtn} onClick={onToggleActivo}>
            {s.activo ? 'Desactivar' : 'Activar'}
          </button>
          <button
            type="button"
            className={
              deleteDisabled
                ? `${styles.mobileActionBtn} ${styles.mobileActionDisabled}`
                : `${styles.mobileActionBtn} ${styles.mobileActionDanger}`
            }
            onClick={deleteDisabled ? undefined : onEliminar}
            title={
              s.esPrincipal
                ? 'Marca otra como principal primero'
                : isOnly
                ? 'No puedes eliminar la única sucursal'
                : undefined
            }
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

// ── SucursalesPage ─────────────────────────────────────
export function SucursalesPage() {
  const currentRol = useAuthStore((s) => s.user?.rol ?? '');
  const canWrite = OWNER_ADMIN.has(currentRol);
  const qc = useQueryClient();

  const [modalCreate, setModalCreate] = useState(false);
  const [editSucursal, setEditSucursal] = useState<Sucursal | null>(null);
  const [confirm, setConfirm] = useState<{
    type: 'principal' | 'desactivar-principal' | 'desactivar' | 'activar' | 'eliminar';
    sucursal: Sucursal;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Cabinas ──
  const [modalCreateCabina, setModalCreateCabina] = useState(false);
  const [editCabina, setEditCabina] = useState<Cabina | null>(null);
  const [confirmCabina, setConfirmCabina] = useState<{
    type: 'desactivar' | 'activar' | 'eliminar';
    cabina: Cabina;
  } | null>(null);
  const [menuOpenCabina, setMenuOpenCabina] = useState<string | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3800);
  };

  const { data: sucursales = [], isLoading } = useQuery<Sucursal[]>({
    queryKey: ['sucursales'],
    queryFn: () => api.get('/sucursales').then((r) => r.data),
  });

  const { data: empresa } = useQuery<EmpresaInfo>({
    queryKey: ['empresa-info'],
    queryFn: () => api.get('/empresa').then((r) => r.data),
  });

  const { data: cabinas = [], isLoading: isLoadingCabinas } = useQuery<Cabina[]>({
    queryKey: ['cabinas'],
    queryFn: () => api.get('/cabinas').then((r) => r.data),
  });

  const totalSucursales = empresa?.totalSucursales ?? sucursales.length;
  const maxSucursales = empresa?.maxSucursales ?? null;
  const limitReached = maxSucursales !== null && totalSucursales >= maxSucursales;
  const limitPct = maxSucursales ? Math.min(100, (totalSucursales / maxSucursales) * 100) : 0;
  const isOnly = sucursales.length <= 1;

  async function handleAction(
    fn: () => Promise<unknown>,
    successMsg: string,
  ) {
    setActionLoading(true);
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ['sucursales'] });
      qc.invalidateQueries({ queryKey: ['empresa-info'] });
      showToast(successMsg);
    } catch (e) {
      showToast(errMsg(e), false);
    } finally {
      setActionLoading(false);
      setConfirm(null);
    }
  }

  function requestToggleActivo(s: Sucursal) {
    if (s.activo && s.esPrincipal) {
      setConfirm({ type: 'desactivar-principal', sucursal: s });
    } else if (s.activo) {
      setConfirm({ type: 'desactivar', sucursal: s });
    } else {
      setConfirm({ type: 'activar', sucursal: s });
    }
  }

  function requestSetPrincipal(s: Sucursal) {
    setConfirm({ type: 'principal', sucursal: s });
  }

  function requestEliminar(s: Sucursal) {
    setConfirm({ type: 'eliminar', sucursal: s });
  }

  function confirmTitle() {
    if (!confirm) return '';
    switch (confirm.type) {
      case 'principal': return 'Cambiar sucursal principal';
      case 'desactivar-principal': return 'Desactivar la sucursal principal';
      case 'desactivar': return 'Desactivar sucursal';
      case 'activar': return 'Activar sucursal';
      case 'eliminar': return 'Eliminar sucursal';
    }
  }

  function confirmMessage() {
    if (!confirm) return '';
    const n = confirm.sucursal.nombre;
    switch (confirm.type) {
      case 'principal':
        return `¿Marcar "${n}" como la sucursal principal? La sucursal actual dejará de serlo.`;
      case 'desactivar-principal':
        return `"${n}" es la sucursal principal. ¿Desactivarla de todas formas? Continuará siendo la principal, pero aparecerá como desactivada.`;
      case 'desactivar':
        return `¿Desactivar "${n}"? Seguirá en el sistema pero no estará disponible para nuevas citas o ventas.`;
      case 'activar':
        return `¿Activar "${n}"?`;
      case 'eliminar':
        return `Esta acción eliminará "${n}" del sistema. La sucursal puede tener empleados, citas o ventas asociadas — el historial se conserva, pero la sucursal no será visible. ¿Continuar?`;
    }
  }

  function confirmLabel() {
    if (!confirm) return '';
    switch (confirm.type) {
      case 'principal': return 'Marcar como principal';
      case 'desactivar-principal':
      case 'desactivar': return 'Desactivar';
      case 'activar': return 'Activar';
      case 'eliminar': return 'Eliminar';
    }
  }

  async function executeConfirm() {
    if (!confirm) return;
    const s = confirm.sucursal;
    switch (confirm.type) {
      case 'principal':
        await handleAction(
          () => api.patch(`/sucursales/${s.id}`, { esPrincipal: true }),
          `"${s.nombre}" es ahora la sucursal principal.`,
        );
        break;
      case 'desactivar-principal':
      case 'desactivar':
        await handleAction(
          () => api.patch(`/sucursales/${s.id}`, { activo: false }),
          `"${s.nombre}" desactivada.`,
        );
        break;
      case 'activar':
        await handleAction(
          () => api.patch(`/sucursales/${s.id}`, { activo: true }),
          `"${s.nombre}" activada.`,
        );
        break;
      case 'eliminar':
        await handleAction(
          () => api.delete(`/sucursales/${s.id}`),
          `"${s.nombre}" eliminada correctamente.`,
        );
        break;
    }
  }

  // ── Cabinas: handlers ──
  async function handleActionCabina(fn: () => Promise<unknown>, successMsg: string) {
    setActionLoading(true);
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ['cabinas'] });
      showToast(successMsg);
    } catch (e) {
      showToast(errMsg(e), false);
    } finally {
      setActionLoading(false);
      setConfirmCabina(null);
    }
  }

  function requestToggleActivaCabina(c: Cabina) {
    setConfirmCabina({ type: c.activa ? 'desactivar' : 'activar', cabina: c });
  }
  function requestEliminarCabina(c: Cabina) {
    setConfirmCabina({ type: 'eliminar', cabina: c });
  }

  function confirmTitleCabina() {
    if (!confirmCabina) return '';
    switch (confirmCabina.type) {
      case 'desactivar': return 'Desactivar cabina';
      case 'activar': return 'Activar cabina';
      case 'eliminar': return 'Eliminar cabina';
    }
  }
  function confirmMessageCabina() {
    if (!confirmCabina) return '';
    const n = confirmCabina.cabina.nombre;
    switch (confirmCabina.type) {
      case 'desactivar':
        return `¿Desactivar "${n}"? No se podrá elegir para nuevas citas mientras esté desactivada.`;
      case 'activar':
        return `¿Activar "${n}"?`;
      case 'eliminar':
        return `¿Eliminar "${n}"? Las citas que ya la usaron conservan el registro, pero no se podrá volver a elegir.`;
    }
  }
  function confirmLabelCabina() {
    if (!confirmCabina) return '';
    switch (confirmCabina.type) {
      case 'desactivar': return 'Desactivar';
      case 'activar': return 'Activar';
      case 'eliminar': return 'Eliminar';
    }
  }

  async function executeConfirmCabina() {
    if (!confirmCabina) return;
    const c = confirmCabina.cabina;
    switch (confirmCabina.type) {
      case 'desactivar':
        await handleActionCabina(
          () => api.patch(`/cabinas/${c.id}`, { activa: false }),
          `"${c.nombre}" desactivada.`,
        );
        break;
      case 'activar':
        await handleActionCabina(
          () => api.patch(`/cabinas/${c.id}`, { activa: true }),
          `"${c.nombre}" activada.`,
        );
        break;
      case 'eliminar':
        await handleActionCabina(
          () => api.delete(`/cabinas/${c.id}`),
          `"${c.nombre}" eliminada correctamente.`,
        );
        break;
    }
  }

  return (
    <div className={styles.page} onClick={() => { setMenuOpen(null); setMenuOpenCabina(null); }}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Sucursales</h1>
          <p className={styles.sub}>Ubicaciones físicas del negocio</p>
        </div>
        {canWrite && (
          <button
            type="button"
            className={styles.btnNew}
            disabled={limitReached}
            title={limitReached ? 'Has alcanzado el límite de sucursales de tu plan' : undefined}
            onClick={() => setModalCreate(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva sucursal
          </button>
        )}
      </div>

      {/* Indicador de límite */}
      {empresa && (
        <div className={styles.limitBox}>
          <div className={styles.limitRow}>
            <span className={styles.limitLabel}>
              {maxSucursales !== null
                ? `${totalSucursales} de ${maxSucursales} sucursales`
                : `${totalSucursales} sucursal${totalSucursales !== 1 ? 'es' : ''} · Sin límite`}
            </span>
            {limitReached && (
              <span className={styles.limitWarn}>Límite del plan alcanzado</span>
            )}
          </div>
          {maxSucursales !== null && (
            <div className={styles.limitTrack}>
              <div
                className={`${styles.limitFill} ${limitReached ? styles.limitFillFull : ''}`}
                style={{ width: `${limitPct}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Tabla */}
      <div className={styles.tableCard}>
        {isLoading ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : sucursales.length === 0 ? (
          <div className={styles.emptyMsg}>No hay sucursales registradas.</div>
        ) : (
          <>
            {/* Desktop */}
            <table className={`${styles.table} ${styles.tableDesktop}`}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Dirección</th>
                  <th>Teléfono</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sucursales.map((s) => (
                  <SucursalRow
                    key={s.id}
                    s={s}
                    isOnly={isOnly}
                    canWrite={canWrite}
                    menuOpen={menuOpen === s.id}
                    onMenuToggle={() => setMenuOpen((prev) => (prev === s.id ? null : s.id))}
                    onEdit={() => { setEditSucursal(s); setMenuOpen(null); }}
                    onSetPrincipal={() => { requestSetPrincipal(s); setMenuOpen(null); }}
                    onToggleActivo={() => { requestToggleActivo(s); setMenuOpen(null); }}
                    onEliminar={() => { requestEliminar(s); setMenuOpen(null); }}
                  />
                ))}
              </tbody>
            </table>

            {/* Mobile */}
            <div className={styles.mobileCards}>
              {sucursales.map((s) => (
                <MobileSucursalCard
                  key={s.id}
                  s={s}
                  isOnly={isOnly}
                  canWrite={canWrite}
                  onEdit={() => setEditSucursal(s)}
                  onSetPrincipal={() => requestSetPrincipal(s)}
                  onToggleActivo={() => requestToggleActivo(s)}
                  onEliminar={() => requestEliminar(s)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Cabinas ── */}
      <div className={styles.header} style={{ marginTop: 8 }}>
        <div>
          <h2 className={styles.title} style={{ fontSize: 19 }}>Cabinas</h2>
          <p className={styles.sub}>Salas o cubículos privados que algunos servicios requieren</p>
        </div>
        {canWrite && (
          <button
            type="button"
            className={styles.btnNew}
            disabled={sucursales.length === 0}
            title={sucursales.length === 0 ? 'Crea primero una sucursal' : undefined}
            onClick={() => setModalCreateCabina(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva cabina
          </button>
        )}
      </div>

      <div className={styles.tableCard}>
        {isLoadingCabinas ? (
          <div className={styles.loadWrap}><div className={styles.spinner} /></div>
        ) : cabinas.length === 0 ? (
          <div className={styles.emptyMsg}>
            No hay cabinas registradas. Solo hacen falta si algún servicio del Catálogo tiene marcado "Requiere cabina".
          </div>
        ) : (
          <>
            {/* Desktop */}
            <table className={`${styles.table} ${styles.tableDesktop}`}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Sucursal</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cabinas.map((c) => (
                  <CabinaRow
                    key={c.id}
                    c={c}
                    canWrite={canWrite}
                    menuOpen={menuOpenCabina === c.id}
                    onMenuToggle={() => setMenuOpenCabina((prev) => (prev === c.id ? null : c.id))}
                    onEdit={() => { setEditCabina(c); setMenuOpenCabina(null); }}
                    onToggleActiva={() => { requestToggleActivaCabina(c); setMenuOpenCabina(null); }}
                    onEliminar={() => { requestEliminarCabina(c); setMenuOpenCabina(null); }}
                  />
                ))}
              </tbody>
            </table>

            {/* Mobile */}
            <div className={styles.mobileCards}>
              {cabinas.map((c) => (
                <MobileCabinaCard
                  key={c.id}
                  c={c}
                  canWrite={canWrite}
                  onEdit={() => setEditCabina(c)}
                  onToggleActiva={() => requestToggleActivaCabina(c)}
                  onEliminar={() => requestEliminarCabina(c)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal crear / editar */}
      {(modalCreate || editSucursal) && (
        <SucursalModal
          data={editSucursal ?? undefined}
          isFirst={sucursales.length === 0}
          onClose={() => { setModalCreate(false); setEditSucursal(null); }}
          onSuccess={() => {
            showToast(editSucursal ? 'Sucursal actualizada.' : 'Sucursal creada.');
            setModalCreate(false);
            setEditSucursal(null);
          }}
        />
      )}

      {/* Modal de confirmación */}
      {confirm && (
        <ConfirmModal
          title={confirmTitle()}
          message={confirmMessage()}
          confirmLabel={confirmLabel()}
          danger={confirm.type === 'eliminar' || confirm.type === 'desactivar-principal'}
          loading={actionLoading}
          onConfirm={executeConfirm}
          onClose={() => setConfirm(null)}
        />
      )}

      {/* Modal crear / editar cabina */}
      {(modalCreateCabina || editCabina) && (
        <CabinaModal
          data={editCabina ?? undefined}
          sucursales={sucursales}
          onClose={() => { setModalCreateCabina(false); setEditCabina(null); }}
          onSuccess={() => {
            showToast(editCabina ? 'Cabina actualizada.' : 'Cabina creada.');
            setModalCreateCabina(false);
            setEditCabina(null);
          }}
        />
      )}

      {/* Modal de confirmación (cabina) */}
      {confirmCabina && (
        <ConfirmModal
          title={confirmTitleCabina()}
          message={confirmMessageCabina()}
          confirmLabel={confirmLabelCabina()}
          danger={confirmCabina.type === 'eliminar'}
          loading={actionLoading}
          onConfirm={executeConfirmCabina}
          onClose={() => setConfirmCabina(null)}
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
