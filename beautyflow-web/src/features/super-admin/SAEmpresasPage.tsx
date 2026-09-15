import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { saApi } from '../../lib/saApi';
import { formatMoney } from '../../lib/format';
import styles from './SAEmpresasPage.module.css';

/* ─── Tipos ─── */
interface Empresa {
  id: string; nombre: string; slug: string;
  estado: 'ACTIVE' | 'SUSPENDED' | 'CANCELED';
  plan: string; usuarios: number; sucursales: number; empleados: number;
  createdAt: string;
}
interface Plan { id: string; nombre: string; tipo: string; precio: number | string; }

const ESTADO_INFO: Record<string, { label: string; cls: string }> = {
  ACTIVE:    { label: 'Activa',     cls: 'stActive' },
  SUSPENDED: { label: 'Suspendida', cls: 'stSusp' },
  CANCELED:  { label: 'Cancelada',  cls: 'stCanc' },
};
const VERTICALES = ['SALON', 'BARBERIA', 'NAIL_BAR', 'ESTETICA', 'SPA', 'MIXTO'] as const;
const VERTICAL_LABEL: Record<string, string> = {
  SALON: 'Salón', BARBERIA: 'Barbería', NAIL_BAR: 'Nail Bar',
  ESTETICA: 'Estética', SPA: 'Spa', MIXTO: 'Mixto',
};

function fmtFecha(iso: string) {
  const d = new Date(iso);
  const m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
}
function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* ─── Página principal ─── */
export function SAEmpresasPage() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<'TODAS' | 'ACTIVE' | 'SUSPENDED'>('TODAS');
  const [modalCrear, setModalCrear]     = useState(false);
  const [editando, setEditando]         = useState<Empresa | null>(null);
  const [suspendiendo, setSuspendiendo] = useState<Empresa | null>(null);

  const { data: empresas = [], isLoading } = useQuery<Empresa[]>({
    queryKey: ['sa-empresas', filtro],
    queryFn: () => saApi.get('/admin/empresas', {
      params: filtro === 'TODAS' ? {} : { estado: filtro },
    }).then(r => r.data),
  });

  const { data: planes = [] } = useQuery<Plan[]>({
    queryKey: ['sa-planes'],
    queryFn: () => saApi.get('/admin/planes').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const reactivar = useMutation({
    mutationFn: (id: string) => saApi.patch(`/admin/empresas/${id}/reactivar`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sa-empresas'] }),
  });

  function invalidarEmpresas() {
    qc.invalidateQueries({ queryKey: ['sa-empresas'] });
    qc.invalidateQueries({ queryKey: ['sa-dashboard'] });
  }

  return (
    <div className={styles.page}>

      {/* ── Topbar ── */}
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Empresas</h1>
          <p className={styles.sub}>Gestiona los negocios de la plataforma</p>
        </div>
        <button className={styles.btnNew} onClick={() => setModalCrear(true)}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Nueva empresa
        </button>
      </div>

      {/* ── Filtros ── */}
      <div className={styles.filters}>
        {(['TODAS', 'ACTIVE', 'SUSPENDED'] as const).map((f) => (
          <button
            key={f}
            className={filtro === f ? styles.fActive : ''}
            onClick={() => setFiltro(f)}
          >
            {f === 'TODAS' ? 'Todas' : f === 'ACTIVE' ? 'Activas' : 'Suspendidas'}
          </button>
        ))}
      </div>

      {/* ── Tabla ── */}
      <div className={styles.tableCard}>
        {isLoading ? (
          <div className={styles.loadWrap}><span className={styles.spinner} /></div>
        ) : empresas.length === 0 ? (
          <p className={styles.emptyMsg}>No hay empresas en esta vista.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Plan</th>
                  <th>Estado</th>
                  <th>Usuarios</th>
                  <th>Sucursales</th>
                  <th>Empleados</th>
                  <th>Registro</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {empresas.map(e => {
                  const est = ESTADO_INFO[e.estado] ?? ESTADO_INFO.ACTIVE;
                  return (
                    <tr key={e.id}>
                      <td>
                        <div className={styles.empCell}>
                          <div className={styles.empAv}>
                            {e.nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                          </div>
                          <div>
                            <b>{e.nombre}</b>
                            <small>{e.slug}</small>
                          </div>
                        </div>
                      </td>
                      <td><span className={styles.planBadge}>{e.plan}</span></td>
                      <td>
                        <span className={`${styles.stBadge} ${styles[est.cls as keyof typeof styles]}`}>
                          {est.label}
                        </span>
                      </td>
                      <td className={styles.num}>{e.usuarios}</td>
                      <td className={styles.num}>{e.sucursales}</td>
                      <td className={styles.num}>{e.empleados}</td>
                      <td className={styles.fecha}>{fmtFecha(e.createdAt)}</td>
                      <td>
                        <div className={styles.actions}>
                          <button className={styles.actBtn} title="Editar" onClick={() => setEditando(e)}>
                            <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
                          </button>
                          {e.estado === 'ACTIVE' && (
                            <button
                              className={`${styles.actBtn} ${styles.actDanger}`}
                              title="Suspender"
                              onClick={() => setSuspendiendo(e)}
                            >
                              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>
                            </button>
                          )}
                          {e.estado === 'SUSPENDED' && (
                            <button
                              className={`${styles.actBtn} ${styles.actOk}`}
                              title="Reactivar"
                              disabled={reactivar.isPending && reactivar.variables === e.id}
                              onClick={() => reactivar.mutate(e.id)}
                            >
                              <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modales ── */}
      {modalCrear && (
        <CrearEmpresaModal
          planes={planes}
          onClose={() => setModalCrear(false)}
          onSaved={() => { setModalCrear(false); invalidarEmpresas(); }}
        />
      )}
      {editando && (
        <EditarEmpresaModal
          empresa={editando}
          planes={planes}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); invalidarEmpresas(); }}
        />
      )}
      {suspendiendo && (
        <SuspenderModal
          empresa={suspendiendo}
          onClose={() => setSuspendiendo(null)}
          onSaved={() => { setSuspendiendo(null); invalidarEmpresas(); }}
        />
      )}
    </div>
  );
}

/* ─── Modal CREAR ─── */
function CrearEmpresaModal({ planes, onClose, onSaved }: {
  planes: Plan[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    nombre: '', slug: '', planId: '',
    ownerNombre: '', ownerEmail: '', ownerPassword: '',
    verticales: [] as string[],
  });
  const [slugTocado, setSlugTocado] = useState(false);
  const [err, setErr]               = useState<string | null>(null);
  const [creada, setCreada]         = useState<{ ownerEmail: string; passTemporal?: string } | null>(null);
  const [copiado, setCopiado]       = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  useEffect(() => {
    if (!slugTocado) set('slug', slugify(form.nombre));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.nombre, slugTocado]);

  function toggleVertical(v: string) {
    setForm(f => ({
      ...f,
      verticales: f.verticales.includes(v)
        ? f.verticales.filter(x => x !== v)
        : [...f.verticales, v],
    }));
  }

  const crear = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        nombre: form.nombre, slug: form.slug, planId: form.planId,
        ownerNombre: form.ownerNombre, ownerEmail: form.ownerEmail,
      };
      if (form.verticales.length) body.verticales = form.verticales;
      if (form.ownerPassword.trim()) body.ownerPassword = form.ownerPassword.trim();
      return saApi.post('/admin/empresas', body).then(r => r.data);
    },
    onSuccess: (res: { ownerEmail?: string; ownerPasswordTemporal?: string }) => {
      setCreada({
        ownerEmail:   res.ownerEmail ?? form.ownerEmail,
        passTemporal: res.ownerPasswordTemporal,
      });
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { message?: string | string[] } } };
      const msg = ax?.response?.data?.message;
      setErr(Array.isArray(msg) ? msg.join(' · ') : (msg ?? 'No se pudo crear la empresa.'));
    },
  });

  function copiar() {
    if (creada?.passTemporal) {
      navigator.clipboard?.writeText(creada.passTemporal);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  }

  /* Vista de éxito con credenciales */
  if (creada) {
    return (
      <div className={styles.overlay} onClick={onSaved}>
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          <div className={styles.modalHead}><h3>Empresa creada ✓</h3></div>
          <div className={styles.modalBody}>
            <p className={styles.successText}>
              La empresa se creó correctamente. Comparte estas credenciales con el dueño:
            </p>
            <div className={styles.credBox}>
              <div className={styles.credRow}>
                <span>Correo del dueño</span>
                <b>{creada.ownerEmail}</b>
              </div>
              {creada.passTemporal ? (
                <>
                  <div className={styles.credRow}>
                    <span>Contraseña temporal</span>
                    <div className={styles.passReveal}>
                      <code>{creada.passTemporal}</code>
                      <button onClick={copiar}>{copiado ? '¡Copiada!' : 'Copiar'}</button>
                    </div>
                  </div>
                  <p className={styles.credWarn}>
                    ⚠ Guárdala ahora. Por seguridad, esta contraseña no se volverá a mostrar.
                  </p>
                </>
              ) : (
                <div className={styles.credRow}>
                  <span>Contraseña</span><b>La que definiste al crear</b>
                </div>
              )}
            </div>
          </div>
          <div className={styles.modalFoot}>
            <button className={styles.btnSave} onClick={onSaved}>Entendido</button>
          </div>
        </div>
      </div>
    );
  }

  const canSubmit = form.nombre.trim() && form.slug.trim() && form.planId
    && form.ownerNombre.trim() && form.ownerEmail.trim() && !crear.isPending;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>Nueva empresa</h3>
          <button onClick={onClose}><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div className={styles.modalBody}>

          <div className={styles.sectionLbl}>Datos de la empresa</div>
          <div className={styles.formGrid}>
            <L label="Nombre del negocio *">
              <input value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Beauty Glam" />
            </L>
            <L label="Identificador web *">
              <>
                <input
                  value={form.slug}
                  onChange={e => { setSlugTocado(true); set('slug', e.target.value); }}
                  placeholder="beauty-glam"
                />
                <p className={styles.slugHint}>
                  Nombre corto único del negocio, en minúsculas y sin espacios.
                  Se usa en el acceso y la dirección web. Ej: beauty-glam
                </p>
              </>
            </L>
            <L label="Plan *" full>
              <select value={form.planId} onChange={e => set('planId', e.target.value)}>
                <option value="">Selecciona un plan</option>
                {planes.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} — RD$ {formatMoney(Number(p.precio))}
                  </option>
                ))}
              </select>
            </L>
          </div>

          <div className={styles.sectionLbl}>Verticales (opcional)</div>
          <div className={styles.chips}>
            {VERTICALES.map(v => (
              <button
                key={v} type="button"
                className={`${styles.chip} ${form.verticales.includes(v) ? styles.chipOn : ''}`}
                onClick={() => toggleVertical(v)}
              >
                {VERTICAL_LABEL[v]}
              </button>
            ))}
          </div>

          <div className={styles.sectionLbl}>Dueño (se crea su acceso)</div>
          <div className={styles.formGrid}>
            <L label="Nombre del dueño *">
              <input value={form.ownerNombre} onChange={e => set('ownerNombre', e.target.value)} />
            </L>
            <L label="Correo del dueño *">
              <input type="email" value={form.ownerEmail} onChange={e => set('ownerEmail', e.target.value)} />
            </L>
            <L label="Contraseña (opcional)" full>
              <input
                type="text"
                value={form.ownerPassword}
                onChange={e => set('ownerPassword', e.target.value)}
                placeholder="Déjala vacía para generar una automática"
              />
            </L>
          </div>
          <p className={styles.hint}>
            Si dejas la contraseña vacía, el sistema generará una temporal y te la mostrará
            una sola vez para que se la entregues al dueño.
          </p>

          {err && <p className={styles.modalErr}>{err}</p>}
        </div>
        <div className={styles.modalFoot}>
          <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button
            className={styles.btnSave}
            disabled={!canSubmit}
            onClick={() => { setErr(null); crear.mutate(); }}
          >
            {crear.isPending ? 'Creando…' : 'Crear empresa'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Modal EDITAR ─── */
function EditarEmpresaModal({ empresa, planes, onClose, onSaved }: {
  empresa: Empresa; planes: Plan[]; onClose: () => void; onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(empresa.nombre);
  const [planId, setPlanId] = useState('');
  const [err, setErr]       = useState<string | null>(null);

  const editar = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      if (nombre.trim() && nombre !== empresa.nombre) body.nombre = nombre.trim();
      if (planId) body.planId = planId;
      return saApi.patch(`/admin/empresas/${empresa.id}`, body).then(r => r.data);
    },
    onSuccess: onSaved,
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { message?: string | string[] } } };
      const msg = ax?.response?.data?.message;
      setErr(Array.isArray(msg) ? msg.join(' · ') : (msg ?? 'No se pudo guardar.'));
    },
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>Editar empresa</h3>
          <button onClick={onClose}><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <L label="Nombre" full>
              <input value={nombre} onChange={e => setNombre(e.target.value)} />
            </L>
            <L label="Cambiar plan" full>
              <select value={planId} onChange={e => setPlanId(e.target.value)}>
                <option value="">Mantener plan actual ({empresa.plan})</option>
                {planes.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} — RD$ {formatMoney(Number(p.precio))}
                  </option>
                ))}
              </select>
            </L>
          </div>
          {err && <p className={styles.modalErr}>{err}</p>}
        </div>
        <div className={styles.modalFoot}>
          <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button
            className={styles.btnSave}
            disabled={editar.isPending}
            onClick={() => { setErr(null); editar.mutate(); }}
          >
            {editar.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Modal SUSPENDER ─── */
function SuspenderModal({ empresa, onClose, onSaved }: {
  empresa: Empresa; onClose: () => void; onSaved: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [err, setErr]       = useState<string | null>(null);

  const suspender = useMutation({
    mutationFn: () =>
      saApi.patch(
        `/admin/empresas/${empresa.id}/suspender`,
        motivo.trim() ? { motivo: motivo.trim() } : {},
      ).then(r => r.data),
    onSuccess: onSaved,
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { message?: string | string[] } } };
      const msg = ax?.response?.data?.message;
      setErr(Array.isArray(msg) ? msg.join(' · ') : (msg ?? 'No se pudo suspender.'));
    },
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>Suspender empresa</h3>
          <button onClick={onClose}><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.suspWarn}>
            Vas a suspender <b>{empresa.nombre}</b>. Sus usuarios no podrán acceder
            hasta que la reactives.
          </p>
          <L label="Motivo (opcional)" full>
            <textarea
              rows={3}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: Falta de pago, solicitud del cliente…"
            />
          </L>
          {err && <p className={styles.modalErr}>{err}</p>}
        </div>
        <div className={styles.modalFoot}>
          <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button
            className={styles.btnDanger}
            disabled={suspender.isPending}
            onClick={() => { setErr(null); suspender.mutate(); }}
          >
            {suspender.isPending ? 'Suspendiendo…' : 'Suspender'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Helper: campo de formulario con label ─── */
function L({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined} className={styles.fieldWrap}>
      <div className={styles.fieldLbl}>{label}</div>
      {children}
    </div>
  );
}
