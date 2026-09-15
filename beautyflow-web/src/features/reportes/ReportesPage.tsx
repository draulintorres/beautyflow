import { useEffect, useState } from 'react';
import { type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth';
import { api } from '../../lib/api';
import styles from './ReportesPage.module.css';

type ReporteId =
  | 'ventas' | 'servicios-vendidos' | 'flujo-caja' | 'cortes-caja' | 'citas' | 'agenda-diaria'
  | 'cuentas-por-cobrar' | 'inventario' | 'kardex' | 'comisiones';

type FiltroTipo = 'fechas' | 'agendaDia' | 'empleado' | 'sucursal' | 'producto';

interface ReporteDef {
  id: ReporteId;
  nombre: string;
  desc: string;
  filtros: FiltroTipo[];
}

interface Categoria {
  cat: string;
  icono: ReactElement;
  reportes: ReporteDef[];
}

interface Columna { key: string; label: string; tipo?: 'dinero' | 'fecha' | 'texto'; }
interface ReporteTabular {
  titulo: string;
  subtitulo?: string;
  columnas: Columna[];
  filas: Record<string, unknown>[];
  totales?: Record<string, unknown>;
}

interface CatalogoEmpleado { id: string; nombre: string; activo: boolean; }
interface CatalogoSucursal { id: string; nombre: string; }
interface CatalogoProducto  { id: string; nombre: string; activo: boolean; }

const ALLOWED_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER']);

const fmtDinero = (v: unknown) =>
  `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const primerDiaMes = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const IconVentas = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23"/>
    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
  </svg>
);

const IconAgenda = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <path d="M16 2v4M8 2v4M3 10h18"/>
  </svg>
);

const IconCobros = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2"/>
    <line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
);

const IconInventario = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
    <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>
  </svg>
);

const IconEmpleados = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
  </svg>
);

const CATEGORIAS: Categoria[] = [
  {
    cat: 'Ventas', icono: IconVentas, reportes: [
      { id: 'ventas',      nombre: 'Reporte de Ventas', desc: 'Ventas por factura en un período', filtros: ['fechas', 'sucursal'] },
      { id: 'servicios-vendidos', nombre: 'Servicios y Productos Vendidos', desc: 'Ranking completo de ítems vendidos, con cantidad y total', filtros: ['fechas', 'sucursal'] },
      { id: 'flujo-caja',  nombre: 'Flujo de Caja',     desc: 'Entradas agrupadas por día',        filtros: ['fechas'] },
      { id: 'cortes-caja', nombre: 'Historial de Cortes de Caja', desc: 'Arqueo y desglose por forma de pago de cada sesión de caja cerrada', filtros: ['fechas', 'sucursal'] },
    ],
  },
  {
    cat: 'Agenda', icono: IconAgenda, reportes: [
      { id: 'citas',         nombre: 'Reporte de Citas', desc: 'Citas en un período',          filtros: ['fechas', 'empleado'] },
      { id: 'agenda-diaria', nombre: 'Agenda del Día',   desc: 'Citas de un día específico',   filtros: ['agendaDia', 'empleado'] },
    ],
  },
  {
    cat: 'Cobros', icono: IconCobros, reportes: [
      { id: 'cuentas-por-cobrar', nombre: 'Cuentas por Cobrar', desc: 'Facturas con saldo pendiente', filtros: ['sucursal'] },
    ],
  },
  {
    cat: 'Inventario', icono: IconInventario, reportes: [
      { id: 'inventario', nombre: 'Reporte de Inventario', desc: 'Existencias y valoración', filtros: [] },
      { id: 'kardex',     nombre: 'Kardex de Producto',    desc: 'Movimientos de un producto', filtros: ['producto', 'fechas'] },
    ],
  },
  {
    cat: 'Empleados', icono: IconEmpleados, reportes: [
      { id: 'comisiones', nombre: 'Comisiones', desc: 'Comisiones generadas por empleado', filtros: ['fechas', 'sucursal', 'empleado'] },
    ],
  },
];

const TODOS_REPORTES = CATEGORIAS.flatMap(c => c.reportes);

export function ReportesPage() {
  const user = useAuthStore(s => s.user);
  const [sel, setSel] = useState<ReporteDef | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: /reportes?r=servicios-vendidos abre ese reporte directamente
  // (lo usa el "Ver todos →" de la tarjeta del Dashboard). Se limpia el
  // query param para que "atrás" no reabra el mismo reporte.
  useEffect(() => {
    const r = searchParams.get('r');
    if (!r) return;
    const def = TODOS_REPORTES.find(d => d.id === r);
    if (def) { setSel(def); setAutoRun(true); }
    searchParams.delete('r');
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ALLOWED_ROLES.has(user?.rol ?? '')) {
    return (
      <div className={styles.denied}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M4.93 4.93l14.14 14.14"/>
        </svg>
        <p>No tienes acceso al módulo de Reportes.</p>
        <small>Se requiere rol OWNER, ADMIN o MANAGER.</small>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>Reportes</h1>
        <p className={styles.sub}>Analiza la información de tu negocio. Exporta a CSV, Excel o PDF.</p>
      </div>

      {sel ? (
        <VisorReporte def={sel} autoRun={autoRun} onBack={() => { setSel(null); setAutoRun(false); }} />
      ) : (
        <div className={styles.cats}>
          {CATEGORIAS.map(c => (
            <div key={c.cat} className={styles.catCard}>
              <div className={styles.catHead}>
                <span className={styles.catIco}>{c.icono}</span>
                <div>
                  <div className={styles.catNom}>{c.cat}</div>
                  <div className={styles.catCount}>
                    {c.reportes.length} reporte{c.reportes.length > 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <div className={styles.repList}>
                {c.reportes.map(r => (
                  <button key={r.id} className={styles.repItem} onClick={() => setSel(r)}>
                    <span className={styles.repNom}>{r.nombre}</span>
                    <span className={styles.repDesc}>{r.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VisorReporte({ def, autoRun = false, onBack }: { def: ReporteDef; autoRun?: boolean; onBack: () => void }) {
  const [desde,    setDesde]    = useState(primerDiaMes());
  const [hasta,    setHasta]    = useState(hoyISO());
  const [diaAgenda, setDiaAgenda] = useState(hoyISO());
  const [empleadoId, setEmpleadoId] = useState('');
  const [sucursalId, setSucursalId] = useState('');
  const [productoId, setProductoId] = useState('');
  // autoRun: llegó por deep-link desde el Dashboard ("Ver todos") → genera solo.
  const [run, setRun] = useState(autoRun ? 1 : 0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const tiene = (f: FiltroTipo) => def.filtros.includes(f);

  const { data: empleados = [] } = useQuery<CatalogoEmpleado[]>({
    queryKey: ['rep-empleados'],
    queryFn: () => api.get('/empleados').then(r => r.data),
    enabled: tiene('empleado'),
  });
  const { data: sucursales = [] } = useQuery<CatalogoSucursal[]>({
    queryKey: ['rep-sucursales'],
    queryFn: () => api.get('/sucursales').then(r => r.data),
    enabled: tiene('sucursal'),
  });
  const { data: productos = [] } = useQuery<CatalogoProducto[]>({
    queryKey: ['rep-productos'],
    queryFn: () => api.get('/productos').then(r => r.data),
    enabled: tiene('producto'),
  });

  function buildParams(formato?: string) {
    const p: Record<string, string> = {};
    if (tiene('fechas'))    { p.desde = desde; p.hasta = hasta; }
    if (tiene('agendaDia')) { p.desde = diaAgenda; }
    if (tiene('empleado')  && empleadoId) p.empleadoId = empleadoId;
    if (tiene('sucursal')  && sucursalId) p.sucursalId = sucursalId;
    if (tiene('producto')  && productoId) p.productoId = productoId;
    if (formato) p.formato = formato;
    return p;
  }

  const necesitaProducto = tiene('producto') && !productoId;

  const { data, isFetching, error } = useQuery<ReporteTabular>({
    queryKey: ['reporte', def.id, run],
    queryFn: () => api.get(`/reportes/${def.id}`, { params: buildParams() }).then(r => r.data),
    enabled: run > 0 && !necesitaProducto,
  });

  async function exportar(formato: 'csv' | 'excel' | 'pdf') {
    const ext: Record<typeof formato, string> = { csv: 'csv', excel: 'xlsx', pdf: 'pdf' };
    const filename = `reporte-${def.id}.${ext[formato]}`;
    setExportError(null);
    setExporting(true);
    try {
      const resp = await api.get(`/reportes/${def.id}`, {
        params: buildParams(formato),
        responseType: 'blob',
      });
      const url = URL.createObjectURL(resp.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setExportError(`No se pudo descargar el archivo ${filename}. Intenta de nuevo.`);
    } finally {
      setExporting(false);
    }
  }

  function celda(col: Columna, val: unknown) {
    if (col.tipo === 'dinero') return fmtDinero(val);
    return val != null ? String(val) : '—';
  }

  const IconDownload = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3M6 9l6 6 6-6"/><path d="M3 18h18v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z"/>
    </svg>
  );

  return (
    <div className={styles.visor}>
      <button className={styles.back} onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        Reportes
      </button>

      <h2 className={styles.visorTitle}>{def.nombre}</h2>

      <div className={styles.filtros}>
        {tiene('fechas') && (
          <>
            <label className={styles.filtroLabel}>
              Desde
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={styles.filtroInput} />
            </label>
            <label className={styles.filtroLabel}>
              Hasta
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={styles.filtroInput} />
            </label>
          </>
        )}
        {tiene('agendaDia') && (
          <label className={styles.filtroLabel}>
            Fecha
            <input type="date" value={diaAgenda} onChange={e => setDiaAgenda(e.target.value)} className={styles.filtroInput} />
          </label>
        )}
        {tiene('empleado') && (
          <label className={styles.filtroLabel}>
            Empleado
            <select value={empleadoId} onChange={e => setEmpleadoId(e.target.value)} className={styles.filtroSelect}>
              <option value="">Todos</option>
              {empleados.filter(e => e.activo).map(e => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </label>
        )}
        {tiene('sucursal') && (
          <label className={styles.filtroLabel}>
            Sucursal
            <select value={sucursalId} onChange={e => setSucursalId(e.target.value)} className={styles.filtroSelect}>
              <option value="">Todas</option>
              {sucursales.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </label>
        )}
        {tiene('producto') && (
          <label className={styles.filtroLabel}>
            Producto *
            <select value={productoId} onChange={e => setProductoId(e.target.value)} className={styles.filtroSelect}>
              <option value="">Selecciona un producto…</option>
              {productos.filter(p => p.activo).map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </label>
        )}
        <button className={styles.generar} disabled={necesitaProducto} onClick={() => setRun(x => x + 1)}>
          Generar
        </button>
      </div>

      {necesitaProducto && (
        <div className={styles.hint}>Selecciona un producto para ver su kardex.</div>
      )}

      {isFetching && (
        <div className={styles.estado}>
          <div className={styles.spinner}/>
          Generando reporte…
        </div>
      )}

      {!isFetching && error && (
        <div className={styles.estadoErr}>No se pudo generar el reporte. Intenta de nuevo.</div>
      )}

      {exportError && (
        <div className={styles.estadoErr}>{exportError}</div>
      )}

      {data && !isFetching && (
        <>
          <div className={styles.exportBar}>
            {data.subtitulo && <span className={styles.subt}>{data.subtitulo}</span>}
            <div className={styles.exportBtns}>
              <button className={styles.expBtn} disabled={exporting} onClick={() => exportar('csv')}>
                {IconDownload} CSV
              </button>
              <button className={styles.expBtn} disabled={exporting} onClick={() => exportar('excel')}>
                {IconDownload} Excel
              </button>
              <button className={styles.expBtn} disabled={exporting} onClick={() => exportar('pdf')}>
                {IconDownload} PDF
              </button>
            </div>
          </div>

          {data.filas.length === 0 ? (
            <div className={styles.vacio}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
              No hay datos para los filtros seleccionados.
            </div>
          ) : (
            <div className={styles.tablaWrap}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    {data.columnas.map(c => (
                      <th key={c.key} className={c.tipo === 'dinero' ? styles.num : ''}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.filas.map((fila, i) => (
                    <tr key={i}>
                      {data.columnas.map(c => (
                        <td key={c.key} className={c.tipo === 'dinero' ? styles.num : ''}>
                          {celda(c, fila[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {data.totales && (
                  <tfoot>
                    <tr>
                      {data.columnas.map((c, idx) => {
                        const v = data.totales![c.key];
                        return (
                          <td key={c.key} className={c.tipo === 'dinero' ? styles.num : ''}>
                            {v !== undefined
                              ? (c.tipo === 'dinero' ? fmtDinero(v) : String(v))
                              : (idx === 0 ? 'TOTAL' : '')}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}