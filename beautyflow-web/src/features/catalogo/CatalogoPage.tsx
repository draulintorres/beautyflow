import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { formatMoney } from '../../lib/format';
import styles from './CatalogoPage.module.css';

/* ─── Types ─── */
interface Categoria {
  id: string; nombre: string; descripcion?: string; icono?: string;
  vertical?: string; orden: number; activo: boolean;
  _count?: { servicios: number };
}
interface Servicio {
  id: string; nombre: string; categoriaId: string;
  categoria?: { id: string; nombre: string };
  vertical?: string; descripcion?: string;
  precio: string | number; duracionMin: number;
  comisionPct?: string | number | null;
  requiereCabina?: boolean; activo: boolean;
}
interface PaqueteLineaItem { servicioId: string; cantidad: number; }
interface PaqServicio { servicioId: string; nombre?: string; precio?: number; cantidad: number; }
interface Paquete {
  id: string; nombre: string; descripcion?: string;
  precio: number; precioSuelto?: number; ahorro?: number;
  activo: boolean; servicios: PaqServicio[];
}

/* ─── Constants ─── */
const VERTICALES = ['SALON', 'BARBERIA', 'NAIL_BAR', 'ESTETICA', 'SPA', 'MIXTO'] as const;
const VERT_LBL: Record<string, string> = {
  SALON: 'Salón', BARBERIA: 'Barbería', NAIL_BAR: 'Nail Bar',
  ESTETICA: 'Estética', SPA: 'Spa', MIXTO: 'Mixto',
};

const num = (v: unknown) => Number(v) || 0;
const fmtRD = (v: unknown) => `RD$ ${formatMoney(num(v))}`;
const errMsg = (e: unknown) => {
  const msg = (e as any)?.response?.data?.message;
  return msg ? (Array.isArray(msg) ? msg.join(' · ') : String(msg)) : 'Error inesperado.';
};

const OWNER_ADMIN = new Set(['OWNER', 'ADMIN']);
const OWNER_ADMIN_MANAGER = new Set(['OWNER', 'ADMIN', 'MANAGER']);

function useRol() { return useAuthStore(s => s.user?.rol ?? ''); }

type TabKey = 'servicios' | 'categorias' | 'paquetes';

/* ════════════════════════════════════════════════
   PAGE
════════════════════════════════════════════════ */
export function CatalogoPage() {
  const [tab, setTab] = useState<TabKey>('servicios');
  const TAB_LABELS: Record<TabKey, string> = { servicios: 'Servicios', categorias: 'Categorías', paquetes: 'Paquetes' };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Catálogo</h1>
          <p className={styles.sub}>Servicios, categorías y paquetes de tu negocio.</p>
        </div>
      </div>
      <div className={styles.tabs}>
        {(['servicios', 'categorias', 'paquetes'] as TabKey[]).map(t => (
          <button key={t} className={tab === t ? styles.tabOn : styles.tab} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {tab === 'servicios'  && <TabServicios />}
      {tab === 'categorias' && <TabCategorias />}
      {tab === 'paquetes'   && <TabPaquetes />}
    </div>
  );
}

/* ════════════════════════════════════════════════
   TAB SERVICIOS
════════════════════════════════════════════════ */
function TabServicios() {
  const qc = useQueryClient();
  const rol = useRol();
  const puedeBorrar = OWNER_ADMIN.has(rol);
  const puedeEditar = OWNER_ADMIN_MANAGER.has(rol);

  const [q, setQ] = useState('');
  const [catFil, setCatFil] = useState('');
  const [verActivos, setVerActivos] = useState(true);
  const [modal, setModal] = useState<{ mode: 'crear' | 'editar'; data?: Servicio } | null>(null);
  const [toast, setToast] = useState('');

  const { data: servicios = [], isLoading } = useQuery<Servicio[]>({
    queryKey: ['cat-servicios'],
    queryFn: () => api.get('/servicios').then(r => r.data),
  });
  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ['cat-categorias'],
    queryFn: () => api.get('/categorias').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const filtrados = servicios.filter(s =>
    (!q || s.nombre.toLowerCase().includes(q.toLowerCase())) &&
    (!catFil || s.categoriaId === catFil) &&
    (verActivos ? s.activo : !s.activo),
  );

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  const borrar = useMutation({
    mutationFn: (id: string) => api.delete(`/servicios/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cat-servicios'] }); showToast('Servicio eliminado'); },
    onError: (e: unknown) => showToast(errMsg(e)),
  });

  function confirmarBorrar(s: Servicio) {
    if (!window.confirm(`¿Eliminar "${s.nombre}"?`)) return;
    borrar.mutate(s.id);
  }

  return (
    <div className={styles.tabBody}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.toolRow}>
        <div className={styles.searchBox}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>
          </svg>
          <input placeholder="Buscar servicio…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className={styles.filterChips}>
          <button className={!catFil ? styles.chipOn : styles.chip} onClick={() => setCatFil('')}>Todos</button>
          {categorias.filter(c => c.activo).map(c => (
            <button key={c.id} className={catFil === c.id ? styles.chipOn : styles.chip} onClick={() => setCatFil(c.id)}>
              {c.icono ? `${c.icono} ` : ''}{c.nombre}
            </button>
          ))}
          <button className={`${styles.chip} ${!verActivos ? styles.chipOn : ''}`} onClick={() => setVerActivos(v => !v)}>
            {verActivos ? 'Ver inactivos' : 'Ver activos'}
          </button>
        </div>
        {puedeEditar && (
          <button className={styles.btnNew} onClick={() => setModal({ mode: 'crear' })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Nuevo servicio
          </button>
        )}
      </div>

      <div className={styles.tableCard}>
        {isLoading ? (
          <div className={styles.loadWrap}><span className={styles.spinner} /></div>
        ) : filtrados.length === 0 ? (
          <p className={styles.emptyMsg}>No se encontraron servicios.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Duración</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className={styles.nameCell}>
                      <b>{s.nombre}</b>
                      {s.vertical && <span className={styles.vertTag}>{VERT_LBL[s.vertical] ?? s.vertical}</span>}
                      {s.descripcion && <small>{s.descripcion}</small>}
                    </div>
                  </td>
                  <td className={styles.mutedCell}>{s.categoria?.nombre ?? '—'}</td>
                  <td className={styles.priceCell}>{fmtRD(s.precio)}</td>
                  <td className={styles.monoCell}>{s.duracionMin} min</td>
                  <td><span className={s.activo ? styles.badgeOn : styles.badgeOff}>{s.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td className={styles.actCell}>
                    {puedeEditar && (
                      <button className={styles.iconBtn} onClick={() => setModal({ mode: 'editar', data: s })} title="Editar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
                      </button>
                    )}
                    {puedeBorrar && (
                      <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => confirmarBorrar(s)} title="Eliminar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <ServicioModal
          mode={modal.mode}
          data={modal.data}
          categorias={categorias}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            qc.invalidateQueries({ queryKey: ['cat-servicios'] });
            showToast(modal.mode === 'crear' ? 'Servicio creado' : 'Servicio actualizado');
          }}
        />
      )}
    </div>
  );
}

/* ─── Servicio Modal ─── */
function ServicioModal({
  mode, data, categorias, onClose, onSaved,
}: {
  mode: 'crear' | 'editar'; data?: Servicio;
  categorias: Categoria[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    nombre:       data?.nombre ?? '',
    categoriaId:  data?.categoriaId ?? '',
    vertical:     data?.vertical ?? '',
    descripcion:  data?.descripcion ?? '',
    precio:       data ? num(data.precio) : ('' as number | ''),
    duracionMin:  data?.duracionMin ?? 30,
    comisionPct:  data?.comisionPct != null ? num(data.comisionPct) : ('' as number | ''),
    requiereCabina: data?.requiereCabina ?? false,
    activo:       data?.activo ?? true,
  });
  const [err, setErr] = useState('');

  const f = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  const guardar = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        nombre:       form.nombre,
        categoriaId:  form.categoriaId || undefined,
        vertical:     form.vertical || undefined,
        descripcion:  form.descripcion || undefined,
        precio:       Number(form.precio),
        duracionMin:  Math.round(Number(form.duracionMin)),
        comisionPct:  form.comisionPct !== '' ? Number(form.comisionPct) : undefined,
        requiereCabina: form.requiereCabina,
        activo:       form.activo,
      };
      if (mode === 'editar' && data) return api.patch(`/servicios/${data.id}`, body).then(r => r.data);
      return api.post('/servicios', body).then(r => r.data);
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setErr(errMsg(e)),
  });

  const disabled = !form.nombre.trim() || !form.categoriaId || form.precio === '' || Number(form.precio) < 0 || Number(form.duracionMin) < 1 || guardar.isPending;

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>{mode === 'crear' ? 'Nuevo servicio' : 'Editar servicio'}</h3>
          <button type="button" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <L label="Nombre *" full>
              <input value={form.nombre} onChange={e => f('nombre', e.target.value)} maxLength={150} placeholder="Ej. Corte de dama" />
            </L>
            <L label="Categoría *">
              <select value={form.categoriaId} onChange={e => f('categoriaId', e.target.value)}>
                <option value="">— Selecciona —</option>
                {categorias.filter(c => c.activo).map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </L>
            <L label="Tipo de negocio">
              <select value={form.vertical} onChange={e => f('vertical', e.target.value)}>
                <option value="">—</option>
                {VERTICALES.map(v => <option key={v} value={v}>{VERT_LBL[v]}</option>)}
              </select>
            </L>
            <L label="Precio (RD$) *">
              <input type="number" min={0} step={0.01} value={form.precio}
                onChange={e => f('precio', e.target.value === '' ? '' : Number(e.target.value))} />
            </L>
            <L label="Duración (min) *">
              <input type="number" min={1} max={1440} step={1} value={form.duracionMin}
                onChange={e => f('duracionMin', Number(e.target.value))} />
            </L>
            <L label="Descripción" full>
              <textarea value={form.descripcion} onChange={e => f('descripcion', e.target.value)}
                rows={2} maxLength={500} placeholder="Descripción opcional" />
            </L>
            <div className={styles.checkRow}>
              <label><input type="checkbox" checked={form.requiereCabina} onChange={e => f('requiereCabina', e.target.checked)} />Requiere cabina</label>
              <label><input type="checkbox" checked={form.activo} onChange={e => f('activo', e.target.checked)} />Activo</label>
            </div>
          </div>
          {err && <p className={styles.modalErr}>{err}</p>}
        </div>
        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button type="button" className={styles.btnSave} disabled={disabled} onClick={() => guardar.mutate()}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   TAB CATEGORIAS
════════════════════════════════════════════════ */
function TabCategorias() {
  const qc = useQueryClient();
  const rol = useRol();
  const puedeBorrar = OWNER_ADMIN.has(rol);
  const puedeEditar = OWNER_ADMIN_MANAGER.has(rol);
  const [modal, setModal] = useState<{ mode: 'crear' | 'editar'; data?: Categoria } | null>(null);
  const [toast, setToast] = useState('');

  const { data: categorias = [], isLoading } = useQuery<Categoria[]>({
    queryKey: ['cat-categorias'],
    queryFn: () => api.get('/categorias').then(r => r.data),
  });

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  const borrar = useMutation({
    mutationFn: (id: string) => api.delete(`/categorias/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cat-categorias'] }); showToast('Categoría eliminada'); },
    onError: (e: unknown) => showToast(errMsg(e)),
  });

  function confirmarBorrar(c: Categoria) {
    if (!window.confirm(`¿Eliminar "${c.nombre}"?`)) return;
    borrar.mutate(c.id);
  }

  const sorted = [...categorias].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));

  return (
    <div className={styles.tabBody}>
      {toast && <div className={styles.toast}>{toast}</div>}
      <div className={styles.toolRow}>
        <span className={styles.countLabel}>{categorias.length} categoría{categorias.length !== 1 ? 's' : ''}</span>
        {puedeEditar && (
          <button className={styles.btnNew} onClick={() => setModal({ mode: 'crear' })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14"/></svg>
            Nueva categoría
          </button>
        )}
      </div>

      <div className={styles.tableCard}>
        {isLoading ? (
          <div className={styles.loadWrap}><span className={styles.spinner} /></div>
        ) : sorted.length === 0 ? (
          <p className={styles.emptyMsg}>No hay categorías. Crea una para organizar tus servicios.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Servicios</th>
                <th>Orden</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className={styles.nameCell}>
                      {c.icono && <span className={styles.catIcon}>{c.icono}</span>}
                      <b>{c.nombre}</b>
                      {c.descripcion && <small>{c.descripcion}</small>}
                    </div>
                  </td>
                  <td className={styles.mutedCell}>{c.vertical ? (VERT_LBL[c.vertical] ?? c.vertical) : '—'}</td>
                  <td className={styles.monoCell}>{c._count?.servicios ?? 0}</td>
                  <td className={styles.monoCell}>{c.orden}</td>
                  <td><span className={c.activo ? styles.badgeOn : styles.badgeOff}>{c.activo ? 'Activa' : 'Inactiva'}</span></td>
                  <td className={styles.actCell}>
                    {puedeEditar && (
                      <button className={styles.iconBtn} onClick={() => setModal({ mode: 'editar', data: c })} title="Editar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
                      </button>
                    )}
                    {puedeBorrar && (
                      <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => confirmarBorrar(c)} title="Eliminar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <CategoriaModal
          mode={modal.mode}
          data={modal.data}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            qc.invalidateQueries({ queryKey: ['cat-categorias'] });
            showToast(modal.mode === 'crear' ? 'Categoría creada' : 'Categoría actualizada');
          }}
        />
      )}
    </div>
  );
}

/* ─── Categoria Modal ─── */
function CategoriaModal({
  mode, data, onClose, onSaved,
}: {
  mode: 'crear' | 'editar'; data?: Categoria; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    nombre:      data?.nombre ?? '',
    descripcion: data?.descripcion ?? '',
    icono:       data?.icono ?? '',
    vertical:    data?.vertical ?? '',
    orden:       data?.orden ?? 0,
    activo:      data?.activo ?? true,
  });
  const [err, setErr] = useState('');

  const f = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  const guardar = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        nombre:      form.nombre,
        descripcion: form.descripcion || undefined,
        icono:       form.icono || undefined,
        vertical:    form.vertical || undefined,
        orden:       Number(form.orden),
        activo:      form.activo,
      };
      if (mode === 'editar' && data) return api.patch(`/categorias/${data.id}`, body).then(r => r.data);
      return api.post('/categorias', body).then(r => r.data);
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setErr(errMsg(e)),
  });

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>{mode === 'crear' ? 'Nueva categoría' : 'Editar categoría'}</h3>
          <button type="button" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <L label="Nombre *" full>
              <input value={form.nombre} onChange={e => f('nombre', e.target.value)} maxLength={100} placeholder="Ej. Cabello" />
            </L>
            <L label="Icono (emoji o texto)">
              <input value={form.icono} onChange={e => f('icono', e.target.value)} maxLength={60} placeholder="✂️" />
            </L>
            <L label="Tipo de negocio">
              <select value={form.vertical} onChange={e => f('vertical', e.target.value)}>
                <option value="">—</option>
                {VERTICALES.map(v => <option key={v} value={v}>{VERT_LBL[v]}</option>)}
              </select>
            </L>
            <L label="Orden (número)">
              <input type="number" min={0} value={form.orden} onChange={e => f('orden', Number(e.target.value))} />
            </L>
            <L label="Descripción" full>
              <textarea value={form.descripcion} onChange={e => f('descripcion', e.target.value)} rows={2} maxLength={255} />
            </L>
            <div className={styles.checkRow}>
              <label><input type="checkbox" checked={form.activo} onChange={e => f('activo', e.target.checked)} />Activa</label>
            </div>
          </div>
          {err && <p className={styles.modalErr}>{err}</p>}
        </div>
        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button type="button" className={styles.btnSave} disabled={!form.nombre.trim() || guardar.isPending} onClick={() => guardar.mutate()}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   TAB PAQUETES
════════════════════════════════════════════════ */
function TabPaquetes() {
  const qc = useQueryClient();
  const rol = useRol();
  const puedeBorrar = OWNER_ADMIN.has(rol);
  const puedeEditar = OWNER_ADMIN_MANAGER.has(rol);
  const [modal, setModal] = useState<{ mode: 'crear' | 'editar'; data?: Paquete } | null>(null);
  const [toast, setToast] = useState('');

  const { data: paquetes = [], isLoading } = useQuery<Paquete[]>({
    queryKey: ['cat-paquetes'],
    queryFn: () => api.get('/paquetes').then(r => r.data),
  });

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  const borrar = useMutation({
    mutationFn: (id: string) => api.delete(`/paquetes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cat-paquetes'] }); showToast('Paquete eliminado'); },
    onError: (e: unknown) => showToast(errMsg(e)),
  });

  function confirmarBorrar(p: Paquete) {
    if (!window.confirm(`¿Eliminar paquete "${p.nombre}"?`)) return;
    borrar.mutate(p.id);
  }

  return (
    <div className={styles.tabBody}>
      {toast && <div className={styles.toast}>{toast}</div>}
      <div className={styles.toolRow}>
        <span className={styles.countLabel}>{paquetes.length} paquete{paquetes.length !== 1 ? 's' : ''}</span>
        {puedeEditar && (
          <button className={styles.btnNew} onClick={() => setModal({ mode: 'crear' })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14"/></svg>
            Nuevo paquete
          </button>
        )}
      </div>

      <div className={styles.tableCard}>
        {isLoading ? (
          <div className={styles.loadWrap}><span className={styles.spinner} /></div>
        ) : paquetes.length === 0 ? (
          <p className={styles.emptyMsg}>No hay paquetes. Crea combos de servicios con precio especial.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Precio combo</th>
                <th>Precio suelto</th>
                <th>Ahorro</th>
                <th>Servicios</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paquetes.map(p => (
                <tr key={p.id}>
                  <td>
                    <div className={styles.nameCell}>
                      <b>{p.nombre}</b>
                      {p.descripcion && <small>{p.descripcion}</small>}
                    </div>
                  </td>
                  <td className={styles.priceCell}>{fmtRD(p.precio)}</td>
                  <td className={styles.strikePriceCell}>{fmtRD(p.precioSuelto ?? 0)}</td>
                  <td className={styles.savingCell}>
                    {(p.ahorro ?? 0) > 0 ? `Ahorra ${fmtRD(p.ahorro)}` : '—'}
                  </td>
                  <td className={styles.monoCell}>{p.servicios.length}</td>
                  <td><span className={p.activo ? styles.badgeOn : styles.badgeOff}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td className={styles.actCell}>
                    {puedeEditar && (
                      <button className={styles.iconBtn} onClick={() => setModal({ mode: 'editar', data: p })} title="Editar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
                      </button>
                    )}
                    {puedeBorrar && (
                      <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => confirmarBorrar(p)} title="Eliminar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <PaqueteModal
          mode={modal.mode}
          data={modal.data}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            qc.invalidateQueries({ queryKey: ['cat-paquetes'] });
            showToast(modal.mode === 'crear' ? 'Paquete creado' : 'Paquete actualizado');
          }}
        />
      )}
    </div>
  );
}

/* ─── Paquete Modal ─── */
function PaqueteModal({
  mode, data, onClose, onSaved,
}: {
  mode: 'crear' | 'editar'; data?: Paquete; onClose: () => void; onSaved: () => void;
}) {
  const { data: servicios = [] } = useQuery<Servicio[]>({
    queryKey: ['cat-servicios'],
    queryFn: () => api.get('/servicios').then(r => r.data),
  });

  const [form, setForm] = useState({
    nombre:      data?.nombre ?? '',
    descripcion: data?.descripcion ?? '',
    precio:      data?.precio != null ? num(data.precio) : ('' as number | ''),
    activo:      data?.activo ?? true,
  });
  const [lineas, setLineas] = useState<PaqueteLineaItem[]>(
    data?.servicios.map(s => ({ servicioId: s.servicioId, cantidad: s.cantidad })) ?? [],
  );
  const [err, setErr] = useState('');

  const f = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  const precioSuelto = lineas.reduce((acc, l) => {
    const svc = servicios.find(s => s.id === l.servicioId);
    return acc + num(svc?.precio ?? 0) * l.cantidad;
  }, 0);
  const ahorro = Math.max(0, precioSuelto - Number(form.precio));

  const selectedIds = new Set(lineas.map(l => l.servicioId));

  function addLinea() {
    const disponible = servicios.find(s => s.activo && !selectedIds.has(s.id));
    if (!disponible) return;
    setLineas(prev => [...prev, { servicioId: disponible.id, cantidad: 1 }]);
  }

  function removeLinea(i: number) { setLineas(prev => prev.filter((_, idx) => idx !== i)); }

  function updateLinea(i: number, k: keyof PaqueteLineaItem, v: string | number) {
    setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  }

  const guardar = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        nombre:      form.nombre,
        descripcion: form.descripcion || undefined,
        precio:      Number(form.precio),
        activo:      form.activo,
        servicios:   lineas.map(l => ({ servicioId: l.servicioId, cantidad: Number(l.cantidad) })),
      };
      if (mode === 'editar' && data) return api.patch(`/paquetes/${data.id}`, body).then(r => r.data);
      return api.post('/paquetes', body).then(r => r.data);
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setErr(errMsg(e)),
  });

  const disabled = !form.nombre.trim() || lineas.length === 0 || form.precio === '' || Number(form.precio) < 0 || guardar.isPending;

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>{mode === 'crear' ? 'Nuevo paquete' : 'Editar paquete'}</h3>
          <button type="button" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <L label="Nombre *" full>
              <input value={form.nombre} onChange={e => f('nombre', e.target.value)} maxLength={150} placeholder="Ej. Paquete Novias" />
            </L>
            <L label="Precio del combo (RD$) *">
              <input type="number" min={0} step={0.01} value={form.precio}
                onChange={e => f('precio', e.target.value === '' ? '' : Number(e.target.value))} />
            </L>
            <L label="Precio suelto (referencia)">
              <div className={styles.refPrice}>
                {fmtRD(precioSuelto)}
                {ahorro > 0 && <span className={styles.savingTag}>Ahorra {fmtRD(ahorro)}</span>}
              </div>
            </L>
            <L label="Descripción" full>
              <textarea value={form.descripcion} onChange={e => f('descripcion', e.target.value)} rows={2} maxLength={500} />
            </L>
          </div>

          <div className={styles.lineasHead}>
            <span>Servicios del paquete *</span>
            <button className={styles.btnAddLinea} onClick={addLinea} type="button">+ Agregar</button>
          </div>

          {lineas.length === 0 ? (
            <p className={styles.lineasEmpty}>Agrega al menos un servicio al paquete.</p>
          ) : (
            <div className={styles.lineasList}>
              {lineas.map((l, i) => {
                const svc = servicios.find(s => s.id === l.servicioId);
                const subtotal = num(svc?.precio ?? 0) * l.cantidad;
                const opciones = servicios.filter(s =>
                  s.activo && (s.id === l.servicioId || !selectedIds.has(s.id)),
                );
                return (
                  <div key={i} className={styles.lineaRow}>
                    <select
                      className={styles.lineaSelect}
                      value={l.servicioId}
                      onChange={e => updateLinea(i, 'servicioId', e.target.value)}
                    >
                      {opciones.map(s => (
                        <option key={s.id} value={s.id}>{s.nombre} — {fmtRD(s.precio)}</option>
                      ))}
                    </select>
                    <input
                      type="number" min={1} value={l.cantidad}
                      className={styles.lineaCant}
                      onChange={e => updateLinea(i, 'cantidad', Math.max(1, Number(e.target.value)))}
                    />
                    <span className={styles.lineaPrice}>{fmtRD(subtotal)}</span>
                    <button type="button" className={styles.lineaDel} onClick={() => removeLinea(i)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className={styles.checkRow} style={{ marginTop: 14 }}>
            <label><input type="checkbox" checked={form.activo} onChange={e => f('activo', e.target.checked)} />Activo</label>
          </div>

          {err && <p className={styles.modalErr}>{err}</p>}
        </div>
        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button type="button" className={styles.btnSave} disabled={disabled} onClick={() => guardar.mutate()}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Form field wrapper ─── */
function L({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}
