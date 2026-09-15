import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { initiales } from '../../lib/format';
import styles from './UsuariosPage.module.css';

// ── Types ─────────────────────────────────────────────
interface Rol { id: string; roleKey: string; nombre: string; }
interface Usuario {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  rolId: string;
  rol: string;
  rolNombre: string;
  activo: boolean;
  debeChangePassword: boolean;
  ultimoLogin: string | null;
  createdAt: string;
}
interface EmpresaInfo { totalUsuarios: number; maxUsuarios: number | null; }

// ── Helpers ────────────────────────────────────────────
const OWNER_ADMIN = new Set(['OWNER', 'ADMIN']);

const errMsg = (e: unknown) => {
  const msg = (e as any)?.response?.data?.message;
  return msg ? (Array.isArray(msg) ? msg.join(' · ') : String(msg)) : 'Error inesperado.';
};

function relative(iso: string | null): string {
  if (!iso) return 'Nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Hace un momento';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `Hace ${d}d`;
  return new Date(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
}

const AVATAR_COLORS = ['#7c5cbf', '#2d7dd2', '#3bb273', '#c9952b', '#c44536', '#2a9d8f', '#c0803a'];
function avatarBg(nombre: string): string {
  const hash = nombre.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Dueño', ADMIN: 'Admin', MANAGER: 'Encargado', CASHIER: 'Cajero',
  RECEPCION: 'Recepción', BARBERO: 'Barbero', ESTILISTA: 'Estilista',
  MANICURISTA: 'Manicurista', ESTETICISTA: 'Esteticista', MASAJISTA: 'Masajista',
};

// ── TempPasswordModal ──────────────────────────────────
function TempPasswordModal({ password, onClose }: { password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>Contraseña temporal</h3>
          <button type="button" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.tempNote}>
            Comparte esta contraseña con el usuario. No podrás verla de nuevo; el usuario deberá cambiarla al iniciar sesión.
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

// ── UsuarioModal (crear / editar) ──────────────────────
function UsuarioModal({
  data, roles, currentUserId, currentRol, onClose, onSuccess,
}: {
  data?: Usuario;
  roles: Rol[];
  currentUserId: string;
  currentRol: string;
  onClose: () => void;
  onSuccess: (tempPassword?: string) => void;
}) {
  const isEdit = !!data;
  const esPropioCambioRol = isEdit && data!.id === currentUserId;

  const [form, setForm] = useState({
    nombre: data?.nombre ?? '',
    email: data?.email ?? '',
    telefono: data?.telefono ?? '',
    rolId: data?.rolId ?? '',
  });
  const [err, setErr] = useState('');
  const qc = useQueryClient();

  const rolesDisponibles = currentRol === 'OWNER'
    ? roles
    : roles.filter((r) => r.roleKey !== 'OWNER');

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const isValid = form.nombre.trim() && (isEdit || (form.email.trim() && form.rolId));

  const guardar = useMutation({
    mutationFn: () => {
      if (isEdit) {
        const patch: Record<string, unknown> = { nombre: form.nombre };
        if (form.telefono !== (data!.telefono ?? '')) patch.telefono = form.telefono || undefined;
        if (!esPropioCambioRol && form.rolId && form.rolId !== data!.rolId) patch.rolId = form.rolId;
        return api.patch(`/usuarios/${data!.id}`, patch).then((r) => r.data);
      }
      return api.post('/usuarios', {
        nombre: form.nombre,
        email: form.email,
        ...(form.telefono && { telefono: form.telefono }),
        rolId: form.rolId,
      }).then((r) => r.data);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      qc.invalidateQueries({ queryKey: ['empresa-info'] });
      onSuccess(res?.passwordTemporal);
    },
    onError: (e) => setErr(errMsg(e)),
  });

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h3>
          <button type="button" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label>Nombre *</label>
              <input
                value={form.nombre}
                onChange={(e) => set('nombre', e.target.value)}
                placeholder="Nombre completo"
                maxLength={150}
              />
            </div>

            <div className={styles.formField}>
              <label>Email {!isEdit && '*'}</label>
              <input
                value={form.email}
                onChange={isEdit ? undefined : (e) => set('email', e.target.value)}
                readOnly={isEdit}
                className={isEdit ? styles.fieldReadonly : ''}
                placeholder={isEdit ? '' : 'correo@ejemplo.com'}
                type="email"
              />
              {isEdit && <span className={styles.fieldHint}>El email no se puede cambiar</span>}
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

            <div className={styles.formField}>
              <label>Rol *</label>
              {esPropioCambioRol ? (
                <>
                  <input
                    value={roles.find((r) => r.id === form.rolId)?.nombre ?? ''}
                    readOnly
                    className={styles.fieldReadonly}
                  />
                  <span className={styles.fieldHint}>No puedes cambiar tu propio rol</span>
                </>
              ) : (
                <select value={form.rolId} onChange={(e) => set('rolId', e.target.value)}>
                  <option value="">Seleccionar rol...</option>
                  {rolesDisponibles.map((r) => (
                    <option key={r.id} value={r.id}>{r.nombre}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {!isEdit && (
            <p className={styles.pwdNote}>
              Se generará una contraseña temporal automáticamente. La verás una sola vez al crear al usuario.
            </p>
          )}
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
            {guardar.isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── UserRow (desktop) ──────────────────────────────────
const APPROX_MENU_H = 130;

function UserRow({
  u, currentUserId, canDesactivar, menuOpen, onMenuToggle, onEdit, onDesactivar, onActivar, onReset,
}: {
  u: Usuario;
  currentUserId: string;
  canDesactivar: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onEdit: () => void;
  onDesactivar: () => void;
  onActivar: () => void;
  onReset: () => void;
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
      <td>
        <div className={styles.userCell}>
          <div className={styles.avatar} style={{ backgroundColor: avatarBg(u.nombre) }}>
            {initiales(u.nombre)}
          </div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>
              {u.nombre}
              {u.id === currentUserId && <span className={styles.selfTag}>Tú</span>}
            </span>
            <span className={styles.userEmail}>{u.email}</span>
            {u.debeChangePassword && (
              <span className={styles.changePwdBadge}>Debe cambiar contraseña</span>
            )}
          </div>
        </div>
      </td>
      <td>
        <span className={`${styles.roleBadge} ${styles[`role_${u.rol}`] ?? ''}`}>
          {u.rolNombre ?? ROLE_LABELS[u.rol] ?? u.rol}
        </span>
      </td>
      <td className={styles.mutedCell}>{u.telefono ?? '—'}</td>
      <td className={styles.mutedCell}>{relative(u.ultimoLogin)}</td>
      <td>
        <span className={u.activo ? styles.badgeOn : styles.badgeOff}>
          {u.activo ? 'Activo' : 'Desactivado'}
        </span>
      </td>
      <td>
        <div className={styles.menuWrap} onClick={(e) => e.stopPropagation()}>
          <button ref={btnRef} type="button" className={styles.menuBtn} onClick={handleToggle}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
              <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
          {menuOpen && dropPos && (
            <div
              className={styles.menuDropdown}
              style={{ top: dropPos.top, right: dropPos.right }}
            >
              <button type="button" onClick={onEdit}>Editar</button>
              <button type="button" onClick={onReset}>Restablecer contraseña</button>
              {u.activo ? (
                canDesactivar && (
                  <button type="button" className={styles.menuItemDanger} onClick={onDesactivar}>
                    Desactivar
                  </button>
                )
              ) : (
                <button type="button" onClick={onActivar}>Activar</button>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── MobileUserCard ─────────────────────────────────────
function MobileUserCard({
  u, currentUserId, canDesactivar, onEdit, onDesactivar, onActivar, onReset,
}: {
  u: Usuario;
  currentUserId: string;
  canDesactivar: boolean;
  onEdit: () => void;
  onDesactivar: () => void;
  onActivar: () => void;
  onReset: () => void;
}) {
  return (
    <div className={styles.mobileCard}>
      <div className={styles.mobileCardTop}>
        <div className={styles.avatar} style={{ backgroundColor: avatarBg(u.nombre) }}>
          {initiales(u.nombre)}
        </div>
        <div className={styles.mobileCardInfo}>
          <div className={styles.mobileCardName}>
            {u.nombre}
            {u.id === currentUserId && <span className={styles.selfTag}>Tú</span>}
          </div>
          <div className={styles.mobileCardEmail}>{u.email}</div>
        </div>
        <div className={styles.mobileCardBadges}>
          <span className={`${styles.roleBadge} ${styles[`role_${u.rol}`] ?? ''}`}>
            {u.rolNombre ?? ROLE_LABELS[u.rol] ?? u.rol}
          </span>
          <span className={u.activo ? styles.badgeOn : styles.badgeOff}>
            {u.activo ? 'Activo' : 'Desactivado'}
          </span>
        </div>
      </div>

      {(u.telefono || u.debeChangePassword || u.ultimoLogin !== undefined) && (
        <div className={styles.mobileCardMeta}>
          {u.telefono && <span>{u.telefono}</span>}
          <span className={styles.mutedCell}>Último acceso: {relative(u.ultimoLogin)}</span>
          {u.debeChangePassword && (
            <span className={styles.changePwdBadge}>Debe cambiar contraseña</span>
          )}
        </div>
      )}

      <div className={styles.mobileCardActions}>
        <button type="button" className={styles.mobileActionBtn} onClick={onEdit}>Editar</button>
        <button type="button" className={styles.mobileActionBtn} onClick={onReset}>Restablecer pwd</button>
        {u.activo ? (
          canDesactivar && (
            <button type="button" className={`${styles.mobileActionBtn} ${styles.mobileActionDanger}`} onClick={onDesactivar}>
              Desactivar
            </button>
          )
        ) : (
          <button type="button" className={styles.mobileActionBtn} onClick={onActivar}>Activar</button>
        )}
      </div>
    </div>
  );
}

// ── UsuariosPage ───────────────────────────────────────
export function UsuariosPage() {
  const currentUserId = useAuthStore((s) => s.user?.id ?? '');
  const currentRol = useAuthStore((s) => s.user?.rol ?? '');
  const qc = useQueryClient();

  const [modalCreate, setModalCreate] = useState(false);
  const [editUser, setEditUser] = useState<Usuario | null>(null);
  const [tempPwd, setTempPwd] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ type: 'activar' | 'desactivar' | 'reset'; user: Usuario } | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const { data: usuarios = [], isLoading } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get('/usuarios').then((r) => r.data),
  });

  const { data: roles = [] } = useQuery<Rol[]>({
    queryKey: ['usuarios-roles'],
    queryFn: () => api.get('/usuarios/roles').then((r) => r.data),
  });

  const { data: empresa } = useQuery<EmpresaInfo>({
    queryKey: ['empresa-info'],
    queryFn: () => api.get('/empresa').then((r) => r.data),
  });

  if (!OWNER_ADMIN.has(currentRol)) {
    return (
      <div className={styles.page}>
        <div className={styles.noAccess}>No tienes permiso para acceder a esta sección.</div>
      </div>
    );
  }

  const totalUsuarios = empresa?.totalUsuarios ?? usuarios.length;
  const maxUsuarios = empresa?.maxUsuarios ?? null;
  const limitReached = maxUsuarios !== null && totalUsuarios >= maxUsuarios;
  const limitPct = maxUsuarios ? Math.min(100, (totalUsuarios / maxUsuarios) * 100) : 0;

  const activeOwners = usuarios.filter((u) => u.rol === 'OWNER' && u.activo);
  function canDesactivar(u: Usuario): boolean {
    if (u.id === currentUserId) return false;
    if (u.rol === 'OWNER' && activeOwners.length <= 1) return false;
    return true;
  }

  async function handleToggle(u: Usuario, activar: boolean) {
    setActionLoading(true);
    try {
      await api.patch(`/usuarios/${u.id}/${activar ? 'activar' : 'desactivar'}`);
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      qc.invalidateQueries({ queryKey: ['empresa-info'] });
      showToast(`Usuario ${activar ? 'activado' : 'desactivado'} correctamente.`);
    } catch (e) {
      showToast(errMsg(e), false);
    } finally {
      setActionLoading(false);
      setConfirm(null);
    }
  }

  async function handleReset(u: Usuario) {
    setActionLoading(true);
    try {
      const res = await api.patch(`/usuarios/${u.id}/reset-password`, {});
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      setConfirm(null);
      if (res.data?.passwordTemporal) {
        setTempPwd(res.data.passwordTemporal);
      } else {
        showToast('Contraseña restablecida. Sesiones revocadas.');
      }
    } catch (e) {
      showToast(errMsg(e), false);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className={styles.page} onClick={() => setMenuOpen(null)}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Usuarios</h1>
          <p className={styles.sub}>Cuentas de acceso al sistema</p>
        </div>
        <button
          type="button"
          className={styles.btnNew}
          disabled={limitReached}
          title={limitReached ? 'Has alcanzado el límite de usuarios de tu plan' : undefined}
          onClick={() => setModalCreate(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo usuario
        </button>
      </div>

      {/* Indicador de límite */}
      {empresa && (
        <div className={styles.limitBox}>
          <div className={styles.limitRow}>
            <span className={styles.limitLabel}>
              {maxUsuarios !== null
                ? `${totalUsuarios} de ${maxUsuarios} usuarios`
                : `${totalUsuarios} usuario${totalUsuarios !== 1 ? 's' : ''} · Sin límite`}
            </span>
            {limitReached && (
              <span className={styles.limitWarn}>Límite del plan alcanzado</span>
            )}
          </div>
          {maxUsuarios !== null && (
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
        ) : usuarios.length === 0 ? (
          <div className={styles.emptyMsg}>No hay usuarios registrados.</div>
        ) : (
          <>
            {/* Desktop */}
            <table className={`${styles.table} ${styles.tableDesktop}`}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Teléfono</th>
                  <th>Último acceso</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <UserRow
                    key={u.id}
                    u={u}
                    currentUserId={currentUserId}
                    canDesactivar={canDesactivar(u)}
                    menuOpen={menuOpen === u.id}
                    onMenuToggle={() => setMenuOpen((prev) => (prev === u.id ? null : u.id))}
                    onEdit={() => { setEditUser(u); setMenuOpen(null); }}
                    onDesactivar={() => { setConfirm({ type: 'desactivar', user: u }); setMenuOpen(null); }}
                    onActivar={() => { setConfirm({ type: 'activar', user: u }); setMenuOpen(null); }}
                    onReset={() => { setConfirm({ type: 'reset', user: u }); setMenuOpen(null); }}
                  />
                ))}
              </tbody>
            </table>

            {/* Mobile */}
            <div className={styles.mobileCards}>
              {usuarios.map((u) => (
                <MobileUserCard
                  key={u.id}
                  u={u}
                  currentUserId={currentUserId}
                  canDesactivar={canDesactivar(u)}
                  onEdit={() => setEditUser(u)}
                  onDesactivar={() => setConfirm({ type: 'desactivar', user: u })}
                  onActivar={() => setConfirm({ type: 'activar', user: u })}
                  onReset={() => setConfirm({ type: 'reset', user: u })}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal crear / editar */}
      {(modalCreate || editUser) && (
        <UsuarioModal
          data={editUser ?? undefined}
          roles={roles}
          currentUserId={currentUserId}
          currentRol={currentRol}
          onClose={() => { setModalCreate(false); setEditUser(null); }}
          onSuccess={(pwd) => {
            setModalCreate(false);
            setEditUser(null);
            showToast(editUser ? 'Usuario actualizado.' : 'Usuario creado.');
            if (pwd) setTempPwd(pwd);
          }}
        />
      )}

      {/* Modal confirmar acción */}
      {confirm && (
        <ConfirmModal
          title={
            confirm.type === 'reset' ? 'Restablecer contraseña'
              : confirm.type === 'desactivar' ? 'Desactivar usuario'
              : 'Activar usuario'
          }
          message={
            confirm.type === 'reset'
              ? `¿Restablecer la contraseña de ${confirm.user.nombre}? Se generará una contraseña temporal y se cerrarán todas sus sesiones activas.`
              : confirm.type === 'desactivar'
              ? `¿Desactivar a ${confirm.user.nombre}? Perderá el acceso al sistema de inmediato.`
              : `¿Activar a ${confirm.user.nombre}? Recuperará el acceso al sistema.`
          }
          confirmLabel={
            confirm.type === 'reset' ? 'Restablecer'
              : confirm.type === 'desactivar' ? 'Desactivar'
              : 'Activar'
          }
          danger={confirm.type === 'desactivar'}
          loading={actionLoading}
          onConfirm={() => {
            if (confirm.type === 'reset') handleReset(confirm.user);
            else handleToggle(confirm.user, confirm.type === 'activar');
          }}
          onClose={() => setConfirm(null)}
        />
      )}

      {/* Modal contraseña temporal */}
      {tempPwd && (
        <TempPasswordModal password={tempPwd} onClose={() => setTempPwd(null)} />
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
