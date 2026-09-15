import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import styles from './InventarioMobile.module.css';

interface Producto {
  id: string; codigo?: string; nombre: string; marca?: string; descripcion?: string;
  categoriaRef?: { id: string; nombre: string }; categoriaId?: string; tipo?: string;
  unidadMedida?: string; costo: string; precio: string; existencia: number;
  stockMinimo: number; permiteVentaSinStock?: boolean;
}
interface Categoria { id: string; nombre: string; _count?: { productos: number }; }

const num = (v: string | number) => Number(v) || 0;
const fmt = (v: string | number) => formatMoney(num(v));

function stockNivel(p: Producto): 'ok' | 'bajo' | 'agotado' {
  if (p.existencia <= 0) return 'agotado';
  if (p.existencia <= p.stockMinimo) return 'bajo';
  return 'ok';
}

export function InventarioMobile() {
  const [topTab, setTopTab] = useState<'PRODUCTOS' | 'PROVEEDORES' | 'COMPRAS'>('PRODUCTOS');
  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1>Inventario</h1>
      </div>
      <div className={styles.filtros}>
        <button className={`${styles.filtro} ${topTab === 'PRODUCTOS' ? styles.filtroOn : ''}`} onClick={() => setTopTab('PRODUCTOS')}>Productos</button>
        <button className={`${styles.filtro} ${topTab === 'PROVEEDORES' ? styles.filtroOn : ''}`} onClick={() => setTopTab('PROVEEDORES')}>Proveedores</button>
        <button className={`${styles.filtro} ${topTab === 'COMPRAS' ? styles.filtroOn : ''}`} onClick={() => setTopTab('COMPRAS')}>Compras</button>
      </div>
      {topTab === 'PRODUCTOS' && <ProductosTabMobile />}
      {topTab === 'PROVEEDORES' && <ProveedoresTabMobile />}
      {topTab === 'COMPRAS' && <ComprasTabMobile />}
    </div>
  );
}

function ProductosTabMobile() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [catId, setCatId] = useState('');
  const [soloBajo, setSoloBajo] = useState(false);
  const [sel, setSel] = useState<Producto | null>(null);
  const [editar, setEditar] = useState<Producto | null>(null);
  const [crear, setCrear] = useState(false);
  const [ajuste, setAjuste] = useState<Producto | null>(null);

  const { data: productos = [], isLoading } = useQuery<Producto[]>({
    queryKey: ['inv-productos'],
    queryFn: () => api.get('/productos').then(r => r.data),
  });
  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ['inv-categorias'],
    queryFn: () => api.get('/categorias-producto').then(r => r.data),
  });

  const filtrados = useMemo(() => productos.filter(p => {
    if (q && !`${p.nombre} ${p.codigo ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (catId && p.categoriaRef?.id !== catId && p.categoriaId !== catId) return false;
    if (soloBajo && p.existencia > p.stockMinimo) return false;
    return true;
  }), [productos, q, catId, soloBajo]);

  const bajos = productos.filter(p => p.existencia <= p.stockMinimo).length;
  const valorInv = productos.reduce((s, p) => s + num(p.costo) * p.existencia, 0);

  return (
    <>
      <div className={styles.miniStatsWrap}>
        <div className={styles.miniStats}>
          <span>{productos.length} productos</span>
          <span>·</span>
          <span>Valor: RD$ {fmt(valorInv)}</span>
        </div>
        <input
          className={styles.search}
          placeholder="Buscar producto o código…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      <div className={styles.filtros}>
        <button
          className={`${styles.filtro} ${catId === '' && !soloBajo ? styles.filtroOn : ''}`}
          onClick={() => { setCatId(''); setSoloBajo(false); }}
        >Todos</button>
        <button
          className={`${styles.filtro} ${styles.filtroBajo} ${soloBajo ? styles.filtroOn : ''}`}
          onClick={() => { setSoloBajo(b => !b); setCatId(''); }}
        >
          Stock bajo {bajos > 0 && <span className={styles.filtroNum}>{bajos}</span>}
        </button>
        {categorias.map(c => (
          <button
            key={c.id}
            className={`${styles.filtro} ${catId === c.id ? styles.filtroOn : ''}`}
            onClick={() => { setCatId(c.id); setSoloBajo(false); }}
          >{c.nombre}</button>
        ))}
      </div>

      <div className={styles.list}>
        {isLoading ? (
          <div className={styles.loadWrap}><span className={styles.spinner} /></div>
        ) : filtrados.length === 0 ? (
          <div className={styles.empty}>No hay productos con ese criterio</div>
        ) : (
          filtrados.map(p => {
            const nivel = stockNivel(p);
            return (
              <div key={p.id} className={styles.card} onClick={() => setSel(p)}>
                <div className={styles.cardInfo}>
                  <div className={styles.cardNom}>{p.nombre}</div>
                  <div className={styles.cardCod}>{p.codigo ?? '—'} · {p.categoriaRef?.nombre ?? 'Sin categoría'}</div>
                </div>
                <div className={styles.cardRight}>
                  <span className={`${styles.stockBadge} ${styles[nivel]}`}>{p.existencia} und</span>
                  <span className={styles.cardPrecio}>RD$ {fmt(p.precio)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button className={styles.fab} onClick={() => setCrear(true)}>+ Nuevo producto</button>

      {sel && !editar && !ajuste && (
        <ProductoDetalle
          producto={sel}
          onClose={() => setSel(null)}
          onEditar={() => setEditar(sel)}
          onAjustar={() => setAjuste(sel)}
        />
      )}
      {ajuste && (
        <AjusteSheet
          producto={ajuste}
          onClose={() => setAjuste(null)}
          onDone={() => {
            setAjuste(null);
            setSel(null);
            qc.invalidateQueries({ queryKey: ['inv-productos'] });
          }}
        />
      )}
      {crear && (
        <ProductoForm
          categorias={categorias}
          productos={productos}
          onClose={() => setCrear(false)}
          onSaved={() => {
            setCrear(false);
            qc.invalidateQueries({ queryKey: ['inv-productos'] });
          }}
        />
      )}
      {editar && (
        <ProductoForm
          producto={editar}
          categorias={categorias}
          productos={productos}
          onClose={() => setEditar(null)}
          onSaved={() => {
            setEditar(null);
            setSel(null);
            qc.invalidateQueries({ queryKey: ['inv-productos'] });
          }}
        />
      )}
    </>
  );
}

/* ── Detalle + kardex ── */
function ProductoDetalle({ producto, onClose, onEditar, onAjustar }: {
  producto: Producto;
  onClose: () => void;
  onEditar: () => void;
  onAjustar: () => void;
}) {
  const { data: kardex } = useQuery<any>({
    queryKey: ['inv-kardex', producto.id],
    queryFn: () => api.get(`/inventario/kardex/${producto.id}`).then(r => r.data),
  });
  const margen = num(producto.precio) - num(producto.costo);
  const margenPct = num(producto.costo) > 0 ? Math.round((margen / num(producto.costo)) * 100) : 0;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.handle} />
        <div className={styles.detHead}>
          <div>
            <div className={styles.detNom}>{producto.nombre}</div>
            <div className={styles.detCod}>{producto.codigo ?? '—'} · {producto.categoriaRef?.nombre ?? ''}</div>
          </div>
          <button className={styles.editBtn} onClick={onEditar}>Editar</button>
        </div>

        <div className={styles.detStats}>
          <div className={styles.dStat}><b>{producto.existencia}</b><span>Existencia</span></div>
          <div className={styles.dStat}><b>{producto.stockMinimo}</b><span>Mínimo</span></div>
          <div className={styles.dStat}><b>RD$ {fmt(producto.costo)}</b><span>Costo</span></div>
          <div className={styles.dStat}><b>RD$ {fmt(producto.precio)}</b><span>Precio</span></div>
        </div>

        <div className={styles.margen}>Margen: RD$ {fmt(margen)} ({margenPct}%)</div>

        <button className={styles.ajusteBtn} onClick={onAjustar}>± Ajustar existencia</button>

        <div className={styles.kardexTitle}>Movimientos</div>
        <div className={styles.kardex}>
          {!kardex ? (
            <div className={styles.tabEmpty}>Cargando…</div>
          ) : kardex.movimientos?.length === 0 ? (
            <div className={styles.tabEmpty}>Sin movimientos</div>
          ) : (
            kardex.movimientos.map((m: any, i: number) => (
              <div key={i} className={styles.movRow}>
                <div>
                  <b className={m.tipo === 'ENTRADA' ? styles.entrada : styles.salida}>
                    {m.tipo === 'ENTRADA' ? '+' : '−'}{Math.abs(m.cantidad)}
                  </b>
                  <span>{m.motivo}</span>
                </div>
                <span className={styles.movFecha}>
                  {new Date(m.fecha).toLocaleDateString('es-DO')}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Ajuste de stock ── */
function AjusteSheet({ producto, onClose, onDone }: {
  producto: Producto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [tipo, setTipo] = useState<'entrada' | 'salida'>('entrada');
  const [cantidad, setCantidad] = useState(0);
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const ajustar = useMutation({
    mutationFn: () => api.post('/inventario/ajustes', {
      productoId: producto.id,
      cantidad: tipo === 'entrada' ? Math.abs(cantidad) : -Math.abs(cantidad),
      motivo: motivo.trim(),
    }),
    onSuccess: () => onDone(),
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setErr(msg ? (Array.isArray(msg) ? msg[0] : msg) : 'No se pudo aplicar el ajuste.');
    },
  });

  const nuevoStock = tipo === 'entrada'
    ? producto.existencia + cantidad
    : producto.existencia - cantidad;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.handle} />
        <h3>Ajustar existencia</h3>
        <div className={styles.detCod}>{producto.nombre} · actual: {producto.existencia} und</div>

        <div className={styles.tipoToggle}>
          <button
            className={tipo === 'entrada' ? styles.tipoOn : styles.tipo}
            onClick={() => setTipo('entrada')}
          >+ Entrada</button>
          <button
            className={tipo === 'salida' ? styles.tipoOn : styles.tipo}
            onClick={() => setTipo('salida')}
          >− Salida</button>
        </div>

        <div className={styles.inWrap}>
          <div className={styles.inLbl}>Cantidad</div>
          <input
            className={styles.inInput}
            type="number"
            min={0}
            value={cantidad || ''}
            onChange={e => setCantidad(Math.abs(Number(e.target.value)))}
          />
        </div>
        <div className={styles.inWrap}>
          <div className={styles.inLbl}>Motivo *</div>
          <input
            className={styles.inInput}
            placeholder="Ej: compra a proveedor, merma…"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
          />
        </div>

        {cantidad > 0 && (
          <div className={`${styles.previewStock} ${nuevoStock < 0 ? styles.previewErr : ''}`}>
            Existencia quedará en: <b>{nuevoStock}</b> und
          </div>
        )}
        {err && <div className={styles.err}>{err}</div>}

        <button
          className={styles.saveBtn}
          disabled={cantidad <= 0 || !motivo.trim() || nuevoStock < 0 || ajustar.isPending}
          onClick={() => { setErr(null); ajustar.mutate(); }}
        >
          {ajustar.isPending ? 'Aplicando…' : 'Aplicar ajuste'}
        </button>
      </div>
    </div>
  );
}

/* ── Crear / Editar producto ── */
function ProductoForm({ producto, categorias, productos, onClose, onSaved }: {
  producto?: Producto;
  categorias: Categoria[];
  productos: Producto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const esEditar = !!producto;
  const [f, setF] = useState({
    nombre:      producto?.nombre                            ?? '',
    codigo:      producto?.codigo                           ?? '',
    marca:       producto?.marca                            ?? '',
    categoriaId: producto?.categoriaRef?.id ?? producto?.categoriaId ?? '',
    costo:       producto ? num(producto.costo)             : 0,
    precio:      producto ? num(producto.precio)            : 0,
    stockActual: 0,
    stockMinimo: producto?.stockMinimo                      ?? 0,
    descripcion: producto?.descripcion                      ?? '',
  });
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF(s => ({ ...s, [k]: v }));
  }

  function sugerirCodigo(categoriaId: string) {
    const cat = categorias.find(c => c.id === categoriaId);
    if (!cat) return;
    const pref = cat.nombre.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
    const mismos = productos.filter(p => p.codigo?.startsWith(pref + '-'));
    const next = String(mismos.length + 1).padStart(3, '0');
    set('codigo', `${pref}-${next}`);
  }

  const guardar = useMutation({
    mutationFn: () => {
      const body: any = {
        nombre: f.nombre,
        costo:  Number(f.costo),
        precio: Number(f.precio),
      };
      if (f.codigo.trim())      body.codigo      = f.codigo.trim();
      if (f.categoriaId)        body.categoriaId = f.categoriaId;
      if (f.marca.trim())       body.marca       = f.marca.trim();
      if (f.descripcion.trim()) body.descripcion = f.descripcion.trim();
      if (Number(f.stockMinimo) >= 0) body.stockMinimo = Number(f.stockMinimo);
      // stockActual SOLO al crear — no al editar
      if (!esEditar && Number(f.stockActual) > 0) body.stockActual = Number(f.stockActual);
      return esEditar
        ? api.patch(`/productos/${producto!.id}`, body)
        : api.post('/productos', body);
    },
    onSuccess: () => onSaved(),
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setErr(msg ? (Array.isArray(msg) ? msg[0] : msg) : 'No se pudo guardar el producto.');
    },
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.handle} />
        <h3>{esEditar ? 'Editar producto' : 'Nuevo producto'}</h3>

        <div className={styles.form}>
          <div className={styles.inWrap}>
            <div className={styles.inLbl}>Nombre *</div>
            <input className={styles.inInput} value={f.nombre} onChange={e => set('nombre', e.target.value)} />
          </div>
          <div className={styles.inWrap}>
            <div className={styles.inLbl}>Categoría</div>
            <select
              className={styles.inInput}
              value={f.categoriaId}
              onChange={e => {
                set('categoriaId', e.target.value);
                if (!esEditar) sugerirCodigo(e.target.value);
              }}
            >
              <option value="">—</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className={styles.inWrap}>
            <div className={styles.inLbl}>Código</div>
            <input className={styles.inInput} value={f.codigo} onChange={e => set('codigo', e.target.value)} />
          </div>
          <div className={styles.inWrap}>
            <div className={styles.inLbl}>Marca</div>
            <input className={styles.inInput} value={f.marca} onChange={e => set('marca', e.target.value)} />
          </div>
          <div className={styles.row2}>
            <div className={styles.inWrap}>
              <div className={styles.inLbl}>Costo (RD$) *</div>
              <input className={styles.inInput} type="number" min={0} value={f.costo || ''} onChange={e => set('costo', Number(e.target.value))} />
            </div>
            <div className={styles.inWrap}>
              <div className={styles.inLbl}>Precio (RD$) *</div>
              <input className={styles.inInput} type="number" min={0} value={f.precio || ''} onChange={e => set('precio', Number(e.target.value))} />
            </div>
          </div>
          <div className={styles.row2}>
            {!esEditar && (
              <div className={styles.inWrap}>
                <div className={styles.inLbl}>Stock inicial</div>
                <input className={styles.inInput} type="number" min={0} value={f.stockActual || ''} onChange={e => set('stockActual', Number(e.target.value))} />
              </div>
            )}
            <div className={styles.inWrap}>
              <div className={styles.inLbl}>Stock mínimo</div>
              <input className={styles.inInput} type="number" min={0} value={f.stockMinimo || ''} onChange={e => set('stockMinimo', Number(e.target.value))} />
            </div>
          </div>
          <div className={styles.inWrap}>
            <div className={styles.inLbl}>Descripción</div>
            <input className={styles.inInput} value={f.descripcion} onChange={e => set('descripcion', e.target.value)} />
          </div>
        </div>

        {esEditar && (
          <div className={styles.hint}>
            La existencia no se edita aquí; usa "Ajustar existencia" en el detalle.
          </div>
        )}
        {err && <div className={styles.err}>{err}</div>}

        <button
          className={styles.saveBtn}
          disabled={!f.nombre.trim() || f.precio <= 0 || guardar.isPending}
          onClick={() => { setErr(null); guardar.mutate(); }}
        >
          {guardar.isPending ? 'Guardando…' : (esEditar ? 'Guardar cambios' : 'Crear producto')}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════ PROVEEDORES (mobile) ═══════════════════ */
interface Proveedor {
  id: string; nombre: string; rnc: string | null; telefono: string | null;
  email: string | null; direccion: string | null; contacto: string | null; activo: boolean;
}

function ProveedoresTabMobile() {
  const qc = useQueryClient();
  const [crear, setCrear] = useState(false);
  const [editar, setEditar] = useState<Proveedor | null>(null);

  const { data: proveedores = [], isLoading } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/proveedores').then(r => r.data),
  });

  return (
    <>
      <div className={styles.list}>
        {isLoading ? (
          <div className={styles.loadWrap}><span className={styles.spinner} /></div>
        ) : proveedores.length === 0 ? (
          <div className={styles.empty}>Sin proveedores registrados</div>
        ) : (
          proveedores.map(p => (
            <div key={p.id} className={styles.card} onClick={() => setEditar(p)}>
              <div className={styles.cardInfo}>
                <div className={styles.cardNom}>{p.nombre}</div>
                <div className={styles.cardCod}>{p.telefono ?? '—'}{p.email ? ` · ${p.email}` : ''}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <button className={styles.fab} onClick={() => setCrear(true)}>+ Nuevo proveedor</button>

      {(crear || editar) && (
        <ProveedorFormMobile
          proveedor={editar}
          onClose={() => { setCrear(false); setEditar(null); }}
          onSaved={() => {
            setCrear(false); setEditar(null);
            qc.invalidateQueries({ queryKey: ['proveedores'] });
          }}
        />
      )}
    </>
  );
}

function ProveedorFormMobile({ proveedor, onClose, onSaved }: { proveedor: Proveedor | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    nombre: proveedor?.nombre ?? '',
    rnc: proveedor?.rnc ?? '',
    telefono: proveedor?.telefono ?? '',
    email: proveedor?.email ?? '',
    direccion: proveedor?.direccion ?? '',
    contacto: proveedor?.contacto ?? '',
  });
  const [err, setErr] = useState<string | null>(null);
  function set<K extends keyof typeof f>(k: K, v: string) { setF(s => ({ ...s, [k]: v })); }

  const guardar = useMutation({
    mutationFn: () => {
      const body: Record<string, any> = {
        nombre: f.nombre,
        rnc: f.rnc || undefined,
        telefono: f.telefono || undefined,
        email: f.email || undefined,
        direccion: f.direccion || undefined,
        contacto: f.contacto || undefined,
      };
      return proveedor
        ? api.patch(`/proveedores/${proveedor.id}`, body)
        : api.post('/proveedores', body);
    },
    onSuccess: onSaved,
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setErr(msg ? (Array.isArray(msg) ? msg[0] : msg) : 'No se pudo guardar.');
    },
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.handle} />
        <h3>{proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
        <div className={styles.form}>
          <div className={styles.inWrap}>
            <div className={styles.inLbl}>Nombre *</div>
            <input className={styles.inInput} value={f.nombre} onChange={e => set('nombre', e.target.value)} />
          </div>
          <div className={styles.inWrap}>
            <div className={styles.inLbl}>RNC</div>
            <input className={styles.inInput} value={f.rnc} onChange={e => set('rnc', e.target.value)} />
          </div>
          <div className={styles.inWrap}>
            <div className={styles.inLbl}>Teléfono</div>
            <input className={styles.inInput} value={f.telefono} onChange={e => set('telefono', e.target.value)} />
          </div>
          <div className={styles.inWrap}>
            <div className={styles.inLbl}>Email</div>
            <input className={styles.inInput} value={f.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div className={styles.inWrap}>
            <div className={styles.inLbl}>Persona de contacto</div>
            <input className={styles.inInput} value={f.contacto} onChange={e => set('contacto', e.target.value)} />
          </div>
          <div className={styles.inWrap}>
            <div className={styles.inLbl}>Dirección</div>
            <input className={styles.inInput} value={f.direccion} onChange={e => set('direccion', e.target.value)} />
          </div>
        </div>
        {err && <div className={styles.err}>{err}</div>}
        <button
          className={styles.saveBtn}
          disabled={!f.nombre.trim() || guardar.isPending}
          onClick={() => { setErr(null); guardar.mutate(); }}
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════ COMPRAS (mobile) ═══════════════════ */
interface CompraListItem {
  id: string; numero: number; numeroFactura: string | null; proveedor: string;
  total: number; confirmada: boolean; fecha: string; items: number;
}
interface CompraLinea { key: string; productoId: string; nombre: string; cantidad: number; costo: number; itbis: number; }

function ComprasTabMobile() {
  const qc = useQueryClient();
  const [crear, setCrear] = useState(false);

  const { data: compras = [], isLoading } = useQuery<CompraListItem[]>({
    queryKey: ['compras'],
    queryFn: () => api.get('/compras').then(r => r.data),
  });

  const confirmar = useMutation({
    mutationFn: (id: string) => api.patch(`/compras/${id}/confirmar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['inv-productos'] });
    },
  });

  return (
    <>
      <div className={styles.list}>
        {isLoading ? (
          <div className={styles.loadWrap}><span className={styles.spinner} /></div>
        ) : compras.length === 0 ? (
          <div className={styles.empty}>Sin compras registradas</div>
        ) : (
          compras.map(c => (
            <div key={c.id} className={styles.card}>
              <div className={styles.cardInfo}>
                <div className={styles.cardNom}>#{c.numero} · {c.proveedor}</div>
                <div className={styles.cardCod}>{c.items} ítem(s) · {new Date(c.fecha).toLocaleDateString('es-DO')}</div>
              </div>
              <div className={styles.cardRight}>
                <span className={`${styles.stockBadge} ${c.confirmada ? styles.ok : styles.bajo}`}>
                  {c.confirmada ? 'Confirmada' : 'Pendiente'}
                </span>
                <span className={styles.cardPrecio}>RD$ {fmt(c.total)}</span>
                {!c.confirmada && (
                  <button
                    className={styles.editBtn}
                    disabled={confirmar.isPending}
                    onClick={() => { if (confirm('¿Confirmar esta compra? Sumará el stock de los productos.')) confirmar.mutate(c.id); }}
                  >
                    Confirmar
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <button className={styles.fab} onClick={() => setCrear(true)}>+ Nueva compra</button>

      {crear && (
        <CompraFormMobile
          onClose={() => setCrear(false)}
          onSaved={() => { setCrear(false); qc.invalidateQueries({ queryKey: ['compras'] }); }}
        />
      )}
    </>
  );
}

function CompraFormMobile({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
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
    queryKey: ['inv-productos'],
    queryFn: () => api.get('/productos').then(r => r.data),
  });

  function agregarLinea() {
    const p = productos.find(x => x.id === productoSel);
    if (!p) return;
    setLineas(ls => [...ls, {
      key: `${p.id}-${Date.now()}`, productoId: p.id, nombre: p.nombre,
      cantidad: 1, costo: num(p.costo), itbis: 0,
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
      setErr(msg ? (Array.isArray(msg) ? msg[0] : msg) : 'No se pudo registrar la compra.');
    },
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.handle} />
        <h3>Nueva compra a proveedor</h3>
        <div className={styles.form}>
          <div className={styles.inWrap}>
            <div className={styles.inLbl}>Proveedor *</div>
            <select className={styles.inInput} value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
              <option value="">—</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div className={styles.inWrap}>
            <div className={styles.inLbl}>N.° de factura del proveedor</div>
            <input className={styles.inInput} value={numeroFactura} onChange={e => setNumeroFactura(e.target.value)} />
          </div>

          <div className={styles.inWrap}>
            <div className={styles.inLbl}>Agregar producto</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select className={styles.inInput} style={{ flex: 1 }} value={productoSel} onChange={e => setProductoSel(e.target.value)}>
                <option value="">Elegir producto…</option>
                {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <button className={styles.editBtn} disabled={!productoSel} onClick={agregarLinea}>Agregar</button>
            </div>
          </div>

          {lineas.map(l => (
            <div key={l.key} className={styles.inWrap} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 10 }}>
              <div className={styles.cardNom} style={{ marginBottom: 6 }}>{l.nombre}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className={styles.inInput} type="number" min={1} placeholder="Cant." value={l.cantidad} onChange={e => cambiarLinea(l.key, 'cantidad', Number(e.target.value) || 1)} />
                <input className={styles.inInput} type="number" min={0} placeholder="Costo" value={l.costo} onChange={e => cambiarLinea(l.key, 'costo', Number(e.target.value) || 0)} />
                <button className={styles.editBtn} onClick={() => quitarLinea(l.key)}>✕</button>
              </div>
            </div>
          ))}

          {lineas.length > 0 && (
            <div className={styles.previewStock}>Total: RD$ {fmt(total)}</div>
          )}
          <div className={styles.hint}>
            La compra se crea como pendiente — el stock solo se actualiza al confirmarla desde la lista.
          </div>
        </div>
        {err && <div className={styles.err}>{err}</div>}
        <button
          className={styles.saveBtn}
          disabled={!proveedorId || lineas.length === 0 || guardar.isPending}
          onClick={() => { setErr(null); guardar.mutate(); }}
        >
          {guardar.isPending ? 'Guardando…' : 'Registrar compra'}
        </button>
      </div>
    </div>
  );
}
