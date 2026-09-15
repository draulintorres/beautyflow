import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import styles from './InventarioPage.module.css';
import { InventarioMobile } from './InventarioMobile';

/* ─── Tipos ─── */
interface Producto {
  id: string; codigo: string; codigoBarra: string | null; nombre: string;
  descripcion: string | null; marca: string | null; categoriaId: string | null;
  tipo: 'VENTA' | 'CONSUMO_INTERNO'; unidadMedida: string;
  costo: string; precio: string; existencia: number; stockMinimo: number;
  permiteVentaSinStock: boolean; activo: boolean;
  categoriaRef: { id: string; nombre: string } | null;
}
interface Categoria { id: string; nombre: string; }
interface MovKardex {
  id: string; fecha: string; tipo: string; cantidad: number;
  existenciaResultante: number; nota?: string;
}
interface Kardex { producto: any; existenciaActual: number; movimientos: MovKardex[]; }

const TIPO_LABEL: Record<string, string> = {
  VENTA: 'Venta',
  CONSUMO_INTERNO: 'Consumo interno',
};

/* ─── Helpers de código sugerido ─── */
function quitarAcentos(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function prefijoDeCategoria(nombreCat: string): string {
  return quitarAcentos(nombreCat).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}
function siguienteCodigo(productos: Producto[], categoriaId: string, categorias: Categoria[]): string {
  const cat = categorias.find(c => c.id === categoriaId);
  if (!cat) return '';
  const prefijo = prefijoDeCategoria(cat.nombre);
  let max = 0;
  for (const p of productos) {
    if (!p.codigo) continue;
    const m = p.codigo.match(new RegExp('^' + prefijo + '-(\\d+)$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefijo + '-' + String(max + 1).padStart(3, '0');
}

function stockNivel(p: Producto): 'ok' | 'low' | 'out' {
  if (p.existencia <= 0) return 'out';
  if (p.existencia <= p.stockMinimo) return 'low';
  return 'ok';
}

export function InventarioPage() {
  const [topTab, setTopTab] = useState<'PRODUCTOS' | 'PROVEEDORES' | 'COMPRAS'>('PRODUCTOS');
  return (
    <>
      <div className={styles.mobileOnly}><InventarioMobile /></div>
      <div className={styles.desktopOnly}><div className={styles.page}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Inventario</h1>
            <p className={styles.sub}>Control de productos, proveedores y compras</p>
          </div>
        </div>
        <div className={styles.tabs}>
          <button className={topTab === 'PRODUCTOS' ? styles.tabActive : ''} onClick={() => setTopTab('PRODUCTOS')}>Productos</button>
          <button className={topTab === 'PROVEEDORES' ? styles.tabActive : ''} onClick={() => setTopTab('PROVEEDORES')}>Proveedores</button>
          <button className={topTab === 'COMPRAS' ? styles.tabActive : ''} onClick={() => setTopTab('COMPRAS')}>Compras</button>
        </div>
        {topTab === 'PRODUCTOS' && <ProductosTab />}
        {topTab === 'PROVEEDORES' && <ProveedoresTab />}
        {topTab === 'COMPRAS' && <ComprasTab />}
      </div></div>
    </>
  );
}

function ProductosTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [qDeb, setQDeb] = useState('');
  const [catId, setCatId] = useState<string | null>(null);
  const [soloBajo, setSoloBajo] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDeb(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: productos = [], isLoading } = useQuery<Producto[]>({
    queryKey: ['productos', qDeb, catId],
    queryFn: () =>
      api
        .get('/productos', { params: { q: qDeb || undefined, categoriaId: catId || undefined } })
        .then(r => r.data),
  });

  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ['categorias-producto'],
    queryFn: () => api.get('/categorias-producto').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const { data: stockBajo = [] } = useQuery<Producto[]>({
    queryKey: ['stock-bajo'],
    queryFn: () => api.get('/inventario/stock-bajo').then(r => r.data),
  });

  // Lista completa sin filtros — solo para calcular el siguiente correlativo de código
  const { data: allProductos = [] } = useQuery<Producto[]>({
    queryKey: ['productos', 'all'],
    queryFn: () => api.get('/productos').then(r => r.data),
    staleTime: 30_000,
  });

  const sel = productos.find(p => p.id === selId) ?? null;

  const { data: kardex } = useQuery<Kardex>({
    queryKey: ['kardex', selId],
    queryFn: () => api.get(`/inventario/kardex/${selId}`).then(r => r.data),
    enabled: !!selId,
  });

  const lista = soloBajo ? productos.filter(p => stockNivel(p) !== 'ok') : productos;

  const totalProductos = productos.length;
  const valorInventario = productos.reduce(
    (s, p) => s + Number(p.costo) * p.existencia,
    0,
  );
  const numBajo = stockBajo.length;

  function abrirNuevo() { setEditando(null); setModalOpen(true); }
  function abrirEditar(p: Producto) { setEditando(p); setModalOpen(true); }

  return (
    <>
      <div className={styles.tabHeadRow}>
        <span />
        <button className={styles.btnNew} onClick={abrirNuevo}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
          Nuevo producto
        </button>
      </div>

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statLbl}>Productos</span>
          <span className={styles.statVal}>{totalProductos}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLbl}>Valor del inventario (costo)</span>
          <span className={styles.statVal}>RD$ {formatMoney(valorInventario)}</span>
        </div>
        <div className={`${styles.statCard} ${numBajo > 0 ? styles.statWarn : ''}`}>
          <span className={styles.statLbl}>Stock bajo</span>
          <span className={styles.statVal}>{numBajo}</span>
        </div>
      </div>

      <div className={styles.body}>
        {/* ── Lista ── */}
        <div className={styles.listCol}>
          <div className={styles.search}>
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
            <input
              placeholder="Buscar producto o código..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>

          <div className={styles.filters}>
            <button
              className={!catId && !soloBajo ? styles.fActive : ''}
              onClick={() => { setCatId(null); setSoloBajo(false); }}
            >
              Todos
            </button>
            {categorias.map(c => (
              <button
                key={c.id}
                className={catId === c.id ? styles.fActive : ''}
                onClick={() => { setCatId(c.id); setSoloBajo(false); }}
              >
                {c.nombre}
              </button>
            ))}
            <button
              className={`${styles.chipBajo} ${soloBajo ? styles.chipBajoActive : ''}`}
              onClick={() => { setSoloBajo(v => !v); setCatId(null); }}
            >
              Stock bajo {numBajo > 0 && <b>{numBajo}</b>}
            </button>
          </div>

          <div className={styles.tableWrap}>
            {isLoading ? (
              <div className={styles.loadWrap}><span className={styles.spinner} /></div>
            ) : lista.length === 0 ? (
              <p className={styles.emptyMsg}>No se encontraron productos</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Stock</th>
                    <th>Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map(p => {
                    const nivel = stockNivel(p);
                    return (
                      <tr
                        key={p.id}
                        className={p.id === selId ? styles.rowActive : ''}
                        onClick={() => setSelId(p.id)}
                      >
                        <td>
                          <div className={styles.prodCell}>
                            <b>{p.nombre}</b>
                            <small>{p.codigo} · {p.categoriaRef?.nombre ?? 'Sin categoría'}</small>
                          </div>
                        </td>
                        <td>
                          <span className={`${styles.stockBadge} ${styles[`st_${nivel}`]}`}>
                            {p.existencia} {p.unidadMedida}
                          </span>
                        </td>
                        <td className={styles.priceCell}>RD$ {formatMoney(Number(p.precio))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Detalle ── */}
        <div className={styles.detailCol}>
          {!sel ? (
            <div className={styles.detailEmpty}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
              </svg>
              <p>Selecciona un producto para ver su detalle</p>
            </div>
          ) : (
            <>
              <div className={styles.detHead}>
                <div>
                  <h2>{sel.nombre}</h2>
                  <p className={styles.detCode}>
                    {sel.codigo}{sel.marca ? ` · ${sel.marca}` : ''}
                  </p>
                </div>
                <button className={styles.editBtn} onClick={() => abrirEditar(sel)}>
                  <svg viewBox="0 0 24 24">
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                  </svg>
                  Editar
                </button>
              </div>

              <div className={styles.detStats}>
                <div className={styles.dStat}>
                  <small>Existencia</small>
                  <span className={styles[`txt_${stockNivel(sel)}`]}>
                    {sel.existencia} {sel.unidadMedida}
                  </span>
                </div>
                <div className={styles.dStat}>
                  <small>Stock mínimo</small>
                  <span>{sel.stockMinimo}</span>
                </div>
                <div className={styles.dStat}>
                  <small>Costo</small>
                  <span>RD$ {formatMoney(Number(sel.costo))}</span>
                </div>
                <div className={styles.dStat}>
                  <small>Precio</small>
                  <span className={styles.gold}>RD$ {formatMoney(Number(sel.precio))}</span>
                </div>
              </div>

              <div className={styles.detInfo}>
                <Row label="Categoría" value={sel.categoriaRef?.nombre ?? '—'} />
                <Row label="Tipo" value={TIPO_LABEL[sel.tipo] ?? sel.tipo} />
                <Row label="Unidad de medida" value={sel.unidadMedida} />
                <Row label="Código de barra" value={sel.codigoBarra ?? '—'} />
                <Row
                  label="Margen"
                  value={`RD$ ${formatMoney(Number(sel.precio) - Number(sel.costo))}`}
                />
                {sel.descripcion && (
                  <Row label="Descripción" value={sel.descripcion} full />
                )}
              </div>

              {/* Kardex */}
              <div className={styles.kardex}>
                <div className={styles.kardexHead}>Movimientos de stock (kardex)</div>
                {!kardex || kardex.movimientos.length === 0 ? (
                  <p className={styles.emptyMsg}>Sin movimientos registrados todavía</p>
                ) : (
                  <div className={styles.kardexList}>
                    {kardex.movimientos.map(m => (
                      <div key={m.id} className={styles.kRow}>
                        <span className={styles.kDate}>{m.fecha}</span>
                        <span className={styles.kTipo}>{m.tipo}</span>
                        <span
                          className={`${styles.kCant} ${m.cantidad < 0 ? styles.kNeg : styles.kPos}`}
                        >
                          {m.cantidad > 0 ? '+' : ''}{m.cantidad}
                        </span>
                        <span className={styles.kResult}>{m.existenciaResultante}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {modalOpen && (
        <ProductoModal
          producto={editando}
          productos={allProductos}
          categorias={categorias}
          onClose={() => setModalOpen(false)}
          onSaved={p => {
            setModalOpen(false);
            qc.invalidateQueries({ queryKey: ['productos'] });
            qc.invalidateQueries({ queryKey: ['stock-bajo'] });
            setSelId(p?.id ?? null);
          }}
        />
      )}
    </>
  );
}

function Row({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={styles.infoRow} style={full ? { gridColumn: '1 / -1' } : undefined}>
      <span className={styles.infoLbl}>{label}</span>
      <span className={styles.infoVal}>{value}</span>
    </div>
  );
}

/* ─── Modal crear/editar ─── */
function ProductoModal({
  producto,
  productos,
  categorias,
  onClose,
  onSaved,
}: {
  producto: Producto | null;
  productos: Producto[];
  categorias: Categoria[];
  onClose: () => void;
  onSaved: (p: any) => void;
}) {
  const [form, setForm] = useState({
    codigo:       producto?.codigo ?? '',
    nombre:       producto?.nombre ?? '',
    marca:        producto?.marca ?? '',
    descripcion:  producto?.descripcion ?? '',
    categoriaId:  producto?.categoriaId ?? '',
    tipo:         (producto?.tipo ?? 'VENTA') as 'VENTA' | 'CONSUMO_INTERNO',
    unidadMedida: producto?.unidadMedida ?? 'unidad',
    costo:        producto ? Number(producto.costo) : 0,
    precio:       producto ? Number(producto.precio) : 0,
    stockActual:  producto?.existencia ?? 0,
    stockMinimo:  producto?.stockMinimo ?? 0,
  });
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  useEffect(() => {
    if (!producto && form.categoriaId) {
      setForm(f => ({ ...f, codigo: siguienteCodigo(productos, form.categoriaId, categorias) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.categoriaId, producto]);

  const guardar = useMutation({
    mutationFn: () => {
      const body: Record<string, any> = {
        codigo:       form.codigo || undefined,
        nombre:       form.nombre,
        marca:        form.marca || undefined,
        descripcion:  form.descripcion || undefined,
        categoriaId:  form.categoriaId || undefined,
        tipo:         form.tipo,
        unidadMedida: form.unidadMedida || undefined,
        costo:        Number(form.costo) || 0,
        precio:       Number(form.precio) || 0,
        stockMinimo:  Number(form.stockMinimo) || 0,
      };
      if (!producto) body.stockActual = Number(form.stockActual) || 0;
      if (producto) return api.patch(`/productos/${producto.id}`, body).then(r => r.data);
      return api.post('/productos', body).then(r => r.data);
    },
    onSuccess: p => onSaved(p),
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setErr(
        msg
          ? (Array.isArray(msg) ? msg.join(' · ') : msg)
          : 'No se pudo guardar. Verifica los datos.',
      );
    },
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>{producto ? 'Editar producto' : 'Nuevo producto'}</h3>
          <button onClick={onClose}>
            <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <L label="Código">
              <input value={form.codigo} onChange={e => set('codigo', e.target.value)} placeholder="CAB-001" />
            </L>
            <L label="Nombre *">
              <input value={form.nombre} onChange={e => set('nombre', e.target.value)} />
            </L>
            <L label="Marca">
              <input value={form.marca} onChange={e => set('marca', e.target.value)} />
            </L>
            <L label="Categoría">
              <select value={form.categoriaId} onChange={e => set('categoriaId', e.target.value)}>
                <option value="">—</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </L>
            <L label="Tipo">
              <select value={form.tipo} onChange={e => set('tipo', e.target.value as 'VENTA' | 'CONSUMO_INTERNO')}>
                <option value="VENTA">Venta</option>
                <option value="CONSUMO_INTERNO">Consumo interno</option>
              </select>
            </L>
            <L label="Unidad de medida">
              <input value={form.unidadMedida} onChange={e => set('unidadMedida', e.target.value)} placeholder="unidad" />
            </L>
            <L label="Costo (RD$)">
              <input type="number" min={0} value={form.costo} onChange={e => set('costo', Number(e.target.value))} />
            </L>
            <L label="Precio (RD$)">
              <input type="number" min={0} value={form.precio} onChange={e => set('precio', Number(e.target.value))} />
            </L>
            {!producto && (
              <L label="Existencia inicial">
                <input type="number" min={0} value={form.stockActual} onChange={e => set('stockActual', Number(e.target.value))} />
              </L>
            )}
            <L label="Stock mínimo">
              <input type="number" min={0} value={form.stockMinimo} onChange={e => set('stockMinimo', Number(e.target.value))} />
            </L>
            <L label="Descripción" full>
              <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)} rows={2} />
            </L>
          </div>
          {producto && (
            <p className={styles.modalHint}>
              La existencia se ajusta mediante movimientos de stock, no se edita directamente aquí.
            </p>
          )}
          {err && <p className={styles.modalErr}>{err}</p>}
        </div>

        <div className={styles.modalFoot}>
          <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button
            className={styles.btnSave}
            disabled={!form.nombre.trim() || guardar.isPending}
            onClick={() => guardar.mutate()}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function L({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

/* ═══════════════════ PROVEEDORES ═══════════════════ */
interface Proveedor {
  id: string; nombre: string; rnc: string | null; telefono: string | null;
  email: string | null; direccion: string | null; contacto: string | null; activo: boolean;
}

function ProveedoresTab() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Proveedor | null>(null);

  const { data: proveedores = [], isLoading } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/proveedores').then(r => r.data),
  });

  const eliminar = useMutation({
    mutationFn: (id: string) => api.delete(`/proveedores/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedores'] }),
  });

  return (
    <>
      <div className={styles.tabHeadRow}>
        <span />
        <button className={styles.btnNew} onClick={() => { setEditando(null); setModalOpen(true); }}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
          Nuevo proveedor
        </button>
      </div>

      <div className={styles.tableWrap}>
        {isLoading ? (
          <div className={styles.loadWrap}><span className={styles.spinner} /></div>
        ) : proveedores.length === 0 ? (
          <p className={styles.emptyMsg}>Sin proveedores registrados</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Proveedor</th><th>Contacto</th><th>RNC</th><th></th></tr>
            </thead>
            <tbody>
              {proveedores.map(p => (
                <tr key={p.id}>
                  <td>
                    <div className={styles.prodCell}>
                      <b>{p.nombre}</b>
                      <small>{p.telefono ?? '—'}{p.email ? ` · ${p.email}` : ''}</small>
                    </div>
                  </td>
                  <td>{p.contacto ?? '—'}</td>
                  <td>{p.rnc ?? '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className={styles.editBtn} onClick={() => { setEditando(p); setModalOpen(true); }}>
                        <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
                      </button>
                      <button
                        className={styles.editBtn}
                        onClick={() => { if (confirm(`¿Desactivar a ${p.nombre}?`)) eliminar.mutate(p.id); }}
                      >
                        <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <ProveedorModal
          proveedor={editando}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); qc.invalidateQueries({ queryKey: ['proveedores'] }); }}
        />
      )}
    </>
  );
}

function ProveedorModal({ proveedor, onClose, onSaved }: { proveedor: Proveedor | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    nombre: proveedor?.nombre ?? '',
    rnc: proveedor?.rnc ?? '',
    telefono: proveedor?.telefono ?? '',
    email: proveedor?.email ?? '',
    direccion: proveedor?.direccion ?? '',
    contacto: proveedor?.contacto ?? '',
  });
  const [err, setErr] = useState<string | null>(null);
  function set<K extends keyof typeof form>(k: K, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const guardar = useMutation({
    mutationFn: () => {
      const body: Record<string, any> = {
        nombre: form.nombre,
        rnc: form.rnc || undefined,
        telefono: form.telefono || undefined,
        email: form.email || undefined,
        direccion: form.direccion || undefined,
        contacto: form.contacto || undefined,
      };
      return proveedor
        ? api.patch(`/proveedores/${proveedor.id}`, body)
        : api.post('/proveedores', body);
    },
    onSuccess: onSaved,
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setErr(msg ? (Array.isArray(msg) ? msg.join(' · ') : msg) : 'No se pudo guardar.');
    },
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>{proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
          <button onClick={onClose}><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <L label="Nombre *"><input value={form.nombre} onChange={e => set('nombre', e.target.value)} /></L>
            <L label="RNC"><input value={form.rnc} onChange={e => set('rnc', e.target.value)} /></L>
            <L label="Teléfono"><input value={form.telefono} onChange={e => set('telefono', e.target.value)} /></L>
            <L label="Email"><input value={form.email} onChange={e => set('email', e.target.value)} /></L>
            <L label="Persona de contacto"><input value={form.contacto} onChange={e => set('contacto', e.target.value)} /></L>
            <L label="Dirección" full><input value={form.direccion} onChange={e => set('direccion', e.target.value)} /></L>
          </div>
          {err && <p className={styles.modalErr}>{err}</p>}
        </div>
        <div className={styles.modalFoot}>
          <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button className={styles.btnSave} disabled={!form.nombre.trim() || guardar.isPending} onClick={() => guardar.mutate()}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ COMPRAS ═══════════════════ */
interface CompraListItem {
  id: string; numero: number; numeroFactura: string | null; proveedor: string;
  total: number; confirmada: boolean; fecha: string; items: number;
}

function ComprasTab() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: compras = [], isLoading } = useQuery<CompraListItem[]>({
    queryKey: ['compras'],
    queryFn: () => api.get('/compras').then(r => r.data),
  });

  const confirmar = useMutation({
    mutationFn: (id: string) => api.patch(`/compras/${id}/confirmar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['stock-bajo'] });
    },
  });

  return (
    <>
      <div className={styles.tabHeadRow}>
        <span />
        <button className={styles.btnNew} onClick={() => setModalOpen(true)}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
          Nueva compra
        </button>
      </div>

      <div className={styles.tableWrap}>
        {isLoading ? (
          <div className={styles.loadWrap}><span className={styles.spinner} /></div>
        ) : compras.length === 0 ? (
          <p className={styles.emptyMsg}>Sin compras registradas</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>#</th><th>Proveedor</th><th>Ítems</th><th>Total</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {compras.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className={styles.prodCell}>
                      <b>#{c.numero}</b>
                      <small>{c.numeroFactura ?? '—'} · {new Date(c.fecha).toLocaleDateString('es-DO')}</small>
                    </div>
                  </td>
                  <td>{c.proveedor}</td>
                  <td>{c.items}</td>
                  <td className={styles.priceCell}>RD$ {formatMoney(c.total)}</td>
                  <td>
                    <span className={`${styles.stockBadge} ${c.confirmada ? styles.st_ok : styles.st_low}`}>
                      {c.confirmada ? 'Confirmada' : 'Pendiente'}
                    </span>
                  </td>
                  <td>
                    {!c.confirmada && (
                      <button
                        className={styles.editBtn}
                        disabled={confirmar.isPending}
                        onClick={() => { if (confirm('¿Confirmar esta compra? Esto sumará el stock de los productos.')) confirmar.mutate(c.id); }}
                      >
                        Confirmar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <CompraModal
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); qc.invalidateQueries({ queryKey: ['compras'] }); }}
        />
      )}
    </>
  );
}

interface CompraLinea { key: string; productoId: string; nombre: string; cantidad: number; costo: number; itbis: number; }

function CompraModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [proveedorId, setProveedorId] = useState('');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [lineas, setLineas] = useState<CompraLinea[]>([]);
  const [productoSel, setProductoSel] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const { data: proveedores = [] } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/proveedores').then(r => r.data),
  });
  const { data: productos = [] } = useQuery<Producto[]>({
    queryKey: ['productos', 'all'],
    queryFn: () => api.get('/productos').then(r => r.data),
    staleTime: 30_000,
  });

  function agregarLinea() {
    const p = productos.find(x => x.id === productoSel);
    if (!p) return;
    setLineas(ls => [...ls, {
      key: `${p.id}-${Date.now()}`, productoId: p.id, nombre: p.nombre,
      cantidad: 1, costo: Number(p.costo), itbis: 0,
    }]);
    setProductoSel('');
  }
  function quitarLinea(key: string) { setLineas(ls => ls.filter(l => l.key !== key)); }
  function cambiarLinea(key: string, campo: 'cantidad' | 'costo' | 'itbis', valor: number) {
    setLineas(ls => ls.map(l => l.key === key ? { ...l, [campo]: valor } : l));
  }

  const total = lineas.reduce((s, l) => s + l.cantidad * l.costo + l.itbis, 0);

  const guardar = useMutation({
    mutationFn: () => api.post('/compras', {
      proveedorId,
      numeroFactura: numeroFactura || undefined,
      items: lineas.map(l => ({ productoId: l.productoId, cantidad: l.cantidad, costo: l.costo, itbis: l.itbis || undefined })),
    }),
    onSuccess: onSaved,
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setErr(msg ? (Array.isArray(msg) ? msg.join(' · ') : msg) : 'No se pudo registrar la compra.');
    },
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className={styles.modalHead}>
          <h3>Nueva compra a proveedor</h3>
          <button onClick={onClose}><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <L label="Proveedor *">
              <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
                <option value="">—</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </L>
            <L label="N.° de factura del proveedor">
              <input value={numeroFactura} onChange={e => setNumeroFactura(e.target.value)} />
            </L>
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <select style={{ flex: 1 }} value={productoSel} onChange={e => setProductoSel(e.target.value)}>
              <option value="">Elegir producto para agregar…</option>
              {productos.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <button className={styles.btnCancel} disabled={!productoSel} onClick={agregarLinea}>Agregar</button>
          </div>

          {lineas.length > 0 && (
            <table className={styles.table} style={{ marginTop: 12 }}>
              <thead><tr><th>Producto</th><th>Cant.</th><th>Costo</th><th>ITBIS</th><th></th></tr></thead>
              <tbody>
                {lineas.map(l => (
                  <tr key={l.key}>
                    <td>{l.nombre}</td>
                    <td><input type="number" min={1} style={{ width: 60 }} value={l.cantidad} onChange={e => cambiarLinea(l.key, 'cantidad', Number(e.target.value) || 1)} /></td>
                    <td><input type="number" min={0} style={{ width: 80 }} value={l.costo} onChange={e => cambiarLinea(l.key, 'costo', Number(e.target.value) || 0)} /></td>
                    <td><input type="number" min={0} style={{ width: 70 }} value={l.itbis} onChange={e => cambiarLinea(l.key, 'itbis', Number(e.target.value) || 0)} /></td>
                    <td>
                      <button className={styles.editBtn} onClick={() => quitarLinea(l.key)}>
                        <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ textAlign: 'right', marginTop: 10, fontWeight: 700 }}>
            Total: RD$ {formatMoney(total)}
          </div>
          <p className={styles.modalHint}>
            La compra se crea como pendiente — el stock solo se actualiza al confirmarla desde la lista.
          </p>
          {err && <p className={styles.modalErr}>{err}</p>}
        </div>
        <div className={styles.modalFoot}>
          <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button
            className={styles.btnSave}
            disabled={!proveedorId || lineas.length === 0 || guardar.isPending}
            onClick={() => guardar.mutate()}
          >
            {guardar.isPending ? 'Guardando…' : 'Registrar compra'}
          </button>
        </div>
      </div>
    </div>
  );
}
