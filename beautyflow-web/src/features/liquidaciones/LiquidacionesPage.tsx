import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, downloadPdf } from '../../lib/api';
import styles from './LiquidacionesPage.module.css';

// ── Types ──────────────────────────────────────────────────────────────────

interface EmpleadoPreview {
  empleadoId: string;
  nombre: string;
  modeloPago: string;
  cantidadLineas: number;
  totalBase: number;
  totalComision: number;
  lineasDeArrastre: number;
}

interface SueldoFijoInfo {
  empleadoId: string;
  nombre: string;
  sueldoMonto: number;
}

interface PreviewData {
  empleados: EmpleadoPreview[];
  fiaoPendiente: number;
  sueldoFijo: SueldoFijoInfo[];
}

interface LiqItem {
  id: string;
  empleadoId: string;
  empleadoNombre: string;
  periodoIni: string;
  periodoFin: string;
  totalPagar: number;
  pagada: boolean;
  pagadaAt: string | null;
  anuladaAt: string | null;
  nota: string | null;
  creadoPor: string | null;
  createdAt: string;
}

interface LiqLinea {
  id: string;
  factura: string;
  fecha: string;
  tipo: string;
  descripcion: string | null;
  cantidad: number;
  subtotal: number;
  comisionPct: number;
  comisionMonto: number;
}

interface LiqDetalle extends LiqItem {
  lineas: LiqLinea[];
}

interface Sucursal { id: string; nombre: string; }

type Preset = '1-15-actual' | '16-fin-actual' | '1-15-anterior' | '16-fin-anterior' | 'custom';
type EstadoFiltro = 'todos' | 'pendiente' | 'pagada' | 'anulada';

// ── Helpers ────────────────────────────────────────────────────────────────

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES_LONG   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmtM(n: number): string {
  return `RD$ ${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMShort(n: number): string {
  return `RD$ ${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function fmtPeriodo(ini: string, fin: string): string {
  const a = new Date(ini), b = new Date(fin);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${String(a.getDate()).padStart(2,'0')}–${String(b.getDate()).padStart(2,'0')} ${MESES_CORTOS[a.getMonth()]} ${a.getFullYear()}`;
  }
  return `${fmtFecha(ini)} – ${fmtFecha(fin)}`;
}

function presetLabel(p: Preset): string {
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth(); // 0-indexed
  const prev  = new Date(y, m - 1, 1);
  const pm    = prev.getMonth();
  const py    = prev.getFullYear();
  switch (p) {
    case '1-15-actual':   return `1–15 ${MESES_LONG[m]}`;
    case '16-fin-actual': return `16–fin ${MESES_LONG[m]}`;
    case '1-15-anterior': return `1–15 ${MESES_LONG[pm]} ${py < y ? py : ''}`.trim();
    case '16-fin-anterior': return `16–fin ${MESES_LONG[pm]} ${py < y ? py : ''}`.trim();
    case 'custom':        return 'Rango personalizado';
  }
}

function computePreset(p: Preset): { desde: string; hasta: string } {
  const now  = new Date();
  const y    = now.getFullYear();
  const m    = now.getMonth(); // 0-indexed
  const pad  = (n: number) => String(n).padStart(2, '0');

  if (p === '1-15-actual') {
    return { desde: `${y}-${pad(m+1)}-01`, hasta: `${y}-${pad(m+1)}-15` };
  }
  if (p === '16-fin-actual') {
    const last = new Date(y, m + 1, 0).getDate();
    return { desde: `${y}-${pad(m+1)}-16`, hasta: `${y}-${pad(m+1)}-${last}` };
  }
  const prev = new Date(y, m - 1, 1);
  const pm   = prev.getMonth();
  const py   = prev.getFullYear();
  if (p === '1-15-anterior') {
    return { desde: `${py}-${pad(pm+1)}-01`, hasta: `${py}-${pad(pm+1)}-15` };
  }
  if (p === '16-fin-anterior') {
    const last = new Date(py, pm + 1, 0).getDate();
    return { desde: `${py}-${pad(pm+1)}-16`, hasta: `${py}-${pad(pm+1)}-${last}` };
  }
  return { desde: '', hasta: '' };
}

function errMsg(e: unknown): string {
  const msg = (e as any)?.response?.data?.message;
  if (!msg) return 'Error inesperado.';
  return Array.isArray(msg) ? msg.join(' · ') : String(msg);
}

function estadoBadge(item: LiqItem): { label: string; cls: string } {
  if (item.anuladaAt)  return { label: 'Anulada',          cls: styles.badgeAnulada };
  if (item.pagada)     return { label: 'Pagada',           cls: styles.badgePagada };
  return               { label: 'Pendiente de pago',       cls: styles.badgePendiente };
}

// ── ConfirmModal ───────────────────────────────────────────────────────────

function ConfirmModal({
  title, message, confirmLabel, danger, loading, error, onConfirm, onClose,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>{title}</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} disabled={loading}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.confirmMsg}>{message}</div>
          {error && <div className={styles.modalErr}>{error}</div>}
        </div>
        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            type="button"
            className={danger ? styles.btnDanger : styles.btnGold}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PeriodoSelector ────────────────────────────────────────────────────────

function PeriodoSelector({
  preset, desde, hasta, sucursalId, sucursales, onChange, onSucursalChange,
}: {
  preset: Preset;
  desde: string;
  hasta: string;
  sucursalId: string;
  sucursales: Sucursal[];
  onChange: (p: Preset, d: string, h: string) => void;
  onSucursalChange: (id: string) => void;
}) {
  const presets: Preset[] = ['1-15-actual','16-fin-actual','1-15-anterior','16-fin-anterior','custom'];

  function handlePreset(p: Preset) {
    if (p === 'custom') {
      onChange('custom', desde, hasta);
    } else {
      const d = computePreset(p);
      onChange(p, d.desde, d.hasta);
    }
  }

  return (
    <div className={styles.periodoSelector}>
      <div className={styles.periodoLabel}>Período de liquidación</div>
      <div className={styles.presetRow}>
        {presets.map(p => (
          <button
            key={p}
            type="button"
            className={`${styles.presetBtn} ${preset === p ? styles.presetBtnActive : ''}`}
            onClick={() => handlePreset(p)}
          >
            {presetLabel(p)}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className={styles.customRangeRow}>
          <div className={styles.dateField}>
            <label>Desde</label>
            <input
              type="date"
              value={desde}
              onChange={e => onChange('custom', e.target.value, hasta)}
              className={styles.dateInput}
            />
          </div>
          <div className={styles.dateSep}>–</div>
          <div className={styles.dateField}>
            <label>Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={e => onChange('custom', desde, e.target.value)}
              className={styles.dateInput}
            />
          </div>
        </div>
      )}

      {sucursales.length > 1 && (
        <div className={styles.sucursalRow}>
          <label>Sucursal</label>
          <select
            value={sucursalId}
            onChange={e => onSucursalChange(e.target.value)}
            className={styles.select}
          >
            <option value="">Todas las sucursales</option>
            {sucursales.map(s => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// ── NuevaTab ───────────────────────────────────────────────────────────────

function NuevaTab({ onCorteCreado }: { onCorteCreado: () => void }) {
  const qc = useQueryClient();

  const [preset, setPreset]       = useState<Preset>('1-15-actual');
  const [desde, setDesde]         = useState(() => computePreset('1-15-actual').desde);
  const [hasta, setHasta]         = useState(() => computePreset('1-15-actual').hasta);
  const [sucursalId, setSucursalId] = useState('');
  const [nota, setNota]           = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [cerrarErr, setCerrarErr] = useState('');
  const [toast, setToast]         = useState('');

  const { data: sucursales = [] } = useQuery<Sucursal[]>({
    queryKey: ['sucursales'],
    queryFn: () => api.get('/sucursales').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const canPreview = desde.length === 10 && hasta.length === 10;

  const { data: preview, isLoading: loadingPreview, error: previewErr } = useQuery<PreviewData>({
    queryKey: ['liq-preview', desde, hasta, sucursalId],
    queryFn: () => api.get('/liquidaciones/preview', {
      params: { desde, hasta, ...(sucursalId ? { sucursalId } : {}) },
    }).then(r => r.data),
    enabled: canPreview,
    staleTime: 0,
  });

  const cerrar = useMutation({
    mutationFn: () =>
      api.post('/liquidaciones', {
        desde,
        hasta,
        ...(sucursalId ? { sucursalId } : {}),
        ...(nota.trim() ? { nota: nota.trim() } : {}),
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liq-preview'] });
      qc.invalidateQueries({ queryKey: ['liq-historial'] });
      setShowConfirm(false);
      setNota('');
      setToast('Liquidación creada. Puedes verla en el Historial.');
      setTimeout(() => setToast(''), 4000);
      onCorteCreado();
    },
    onError: (e) => {
      setCerrarErr(errMsg(e));
    },
  });

  function handlePeriodoChange(p: Preset, d: string, h: string) {
    setPreset(p);
    setDesde(d);
    setHasta(h);
  }

  const hayLiquidables = (preview?.empleados?.length ?? 0) > 0;
  const totalGeneral   = preview?.empleados.reduce((s, e) => s + e.totalComision, 0) ?? 0;

  const confirmMsg = (
    <div>
      <p>Se creará una liquidación para <strong>{preview?.empleados.length ?? 0} empleado(s)</strong>.</p>
      <div className={styles.confirmSummary}>
        <div className={styles.confirmSumRow}>
          <span>Período</span>
          <strong>{desde} → {hasta}</strong>
        </div>
        {preview?.empleados.map(e => (
          <div key={e.empleadoId} className={styles.confirmSumRow}>
            <span>{e.nombre}</span>
            <strong className={styles.monospace}>{fmtM(e.totalComision)}</strong>
          </div>
        ))}
        <div className={`${styles.confirmSumRow} ${styles.confirmSumTotal}`}>
          <span>Total a pagar</span>
          <strong className={styles.monospace}>{fmtM(totalGeneral)}</strong>
        </div>
      </div>
      <p className={styles.confirmWarning}>Las líneas quedarán marcadas como liquidadas y no podrán incluirse en otro corte.</p>
    </div>
  );

  return (
    <div className={styles.tabContent}>
      {toast && (
        <div className={styles.toast}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M20 6L9 17l-5-5"/></svg>
          {toast}
        </div>
      )}

      <PeriodoSelector
        preset={preset}
        desde={desde}
        hasta={hasta}
        sucursalId={sucursalId}
        sucursales={sucursales}
        onChange={handlePeriodoChange}
        onSucursalChange={setSucursalId}
      />

      {/* Fiao banner */}
      {canPreview && !loadingPreview && (preview?.fiaoPendiente ?? 0) > 0 && (
        <div className={styles.fiaoBanner}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="16" height="16">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          <div>
            <span className={styles.fiaoBannerTitle}>Comisiones en fiao pendiente de cobro: <span className={styles.monospace}>{fmtM(preview!.fiaoPendiente)}</span></span>
            <span className={styles.fiaoBannerSub}>Estas comisiones se liquidarán automáticamente cuando el cliente pague su factura.</span>
          </div>
        </div>
      )}

      {/* Preview loading */}
      {loadingPreview && (
        <div className={styles.loadWrap}>
          <span className={styles.spinner} />
          <span>Calculando comisiones…</span>
        </div>
      )}

      {/* Preview error */}
      {previewErr && !loadingPreview && (
        <div className={styles.errBanner}>{errMsg(previewErr)}</div>
      )}

      {/* Empty state */}
      {canPreview && !loadingPreview && !previewErr && !hayLiquidables && (
        <div className={styles.emptyState}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" width="38" height="38">
            <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
          </svg>
          <p>No hay comisiones pendientes de liquidar en este período.</p>
          {(preview?.fiaoPendiente ?? 0) === 0 && (
            <p className={styles.emptyStateSub}>Todas las comisiones ya fueron liquidadas o aún no hay ventas en este rango.</p>
          )}
        </div>
      )}

      {/* Preview table */}
      {canPreview && !loadingPreview && hayLiquidables && (
        <div className={styles.previewSection}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>Resumen por empleado</span>
            <span className={styles.totalChip}>{fmtM(totalGeneral)}</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th className={styles.tNum}>Líneas</th>
                  <th className={styles.tNum}>Base total</th>
                  <th className={`${styles.tNum} ${styles.thComision}`}>Comisión a pagar</th>
                </tr>
              </thead>
              <tbody>
                {preview!.empleados.map(e => (
                  <tr key={e.empleadoId}>
                    <td>
                      <div className={styles.empleadoCell}>
                        <div className={styles.empleadoAvatar}>
                          {e.nombre.charAt(0).toUpperCase()}
                        </div>
                        <span>{e.nombre}</span>
                        {e.lineasDeArrastre > 0 && (
                          <span className={styles.arrasteBadge} title={`${e.lineasDeArrastre} línea(s) de períodos anteriores (fiaos viejos cobrados)`}>
                            +{e.lineasDeArrastre} de períodos ant.
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={styles.tNum}>{e.cantidadLineas}</td>
                    <td className={`${styles.tNum} ${styles.monospace}`}>{fmtMShort(e.totalBase)}</td>
                    <td className={`${styles.tNum} ${styles.monospace} ${styles.comisionCell}`}>{fmtM(e.totalComision)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={styles.tfootRow}>
                  <td><strong>Total</strong></td>
                  <td className={styles.tNum}>{preview!.empleados.reduce((s,e) => s+e.cantidadLineas,0)}</td>
                  <td className={`${styles.tNum} ${styles.monospace}`}>{fmtMShort(preview!.empleados.reduce((s,e) => s+e.totalBase,0))}</td>
                  <td className={`${styles.tNum} ${styles.monospace} ${styles.comisionCell}`}><strong>{fmtM(totalGeneral)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Sueldo fijo informativo */}
      {canPreview && !loadingPreview && (preview?.sueldoFijo?.length ?? 0) > 0 && (
        <div className={styles.sueldoFijoSection}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>Empleados de sueldo fijo</span>
            <span className={styles.infoChip}>Informativo</span>
          </div>
          <div className={styles.sueldoFijoList}>
            {preview!.sueldoFijo.map(s => (
              <div key={s.empleadoId} className={styles.sueldoFijoRow}>
                <div className={styles.empleadoCell}>
                  <div className={styles.empleadoAvatar}>{s.nombre.charAt(0)}</div>
                  <span>{s.nombre}</span>
                </div>
                {s.sueldoMonto > 0
                  ? <span className={styles.monospace}>{fmtM(s.sueldoMonto)}/mes</span>
                  : <span className={styles.mutedText}>Monto no configurado</span>
                }
              </div>
            ))}
          </div>
          <p className={styles.sueldoFijoNote}>No generan comisión por venta — su pago es fijo y no entra en esta liquidación.</p>
        </div>
      )}

      {/* Nota + Cerrar */}
      {canPreview && !loadingPreview && hayLiquidables && (
        <div className={styles.cerrarSection}>
          <div className={styles.notaField}>
            <label>Nota <span className={styles.opcional}>(opcional)</span></label>
            <input
              type="text"
              placeholder="Ej: quincena julio, bonificación incluida…"
              value={nota}
              onChange={e => setNota(e.target.value)}
              maxLength={200}
              className={styles.inputText}
            />
          </div>
          <button
            type="button"
            className={styles.btnCerrar}
            onClick={() => { setCerrarErr(''); setShowConfirm(true); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
            Cerrar liquidación
          </button>
        </div>
      )}

      {showConfirm && (
        <ConfirmModal
          title="Confirmar cierre de liquidación"
          message={confirmMsg}
          confirmLabel="Confirmar y cerrar"
          loading={cerrar.isPending}
          error={cerrarErr}
          onConfirm={() => { setCerrarErr(''); cerrar.mutate(); }}
          onClose={() => { setShowConfirm(false); setCerrarErr(''); }}
        />
      )}
    </div>
  );
}

// ── HistorialRow ───────────────────────────────────────────────────────────

function HistorialRow({
  item, selected, onClick,
}: {
  item: LiqItem;
  selected: boolean;
  onClick: () => void;
}) {
  const badge = estadoBadge(item);
  return (
    <button
      type="button"
      className={`${styles.histRow} ${selected ? styles.histRowSelected : ''} ${item.anuladaAt ? styles.histRowAnulada : ''}`}
      onClick={onClick}
    >
      <div className={styles.histRowMain}>
        <div className={styles.histEmpleadoBlock}>
          <div className={styles.empleadoAvatar}>{item.empleadoNombre.charAt(0)}</div>
          <div>
            <span className={styles.histNombre}>{item.empleadoNombre}</span>
            <span className={styles.histPeriodo}>{fmtPeriodo(item.periodoIni, item.periodoFin)}</span>
          </div>
        </div>
        <div className={styles.histRight}>
          <span className={`${styles.histMonto} ${styles.monospace}`}>{fmtM(item.totalPagar)}</span>
          <span className={badge.cls}>{badge.label}</span>
        </div>
      </div>
      {item.pagada && item.pagadaAt && (
        <span className={styles.histFechaPago}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="10" height="10"><path d="M20 6L9 17l-5-5"/></svg>
          Pagada {fmtFecha(item.pagadaAt)}
        </span>
      )}
      <svg className={styles.histChevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="13" height="13">
        <path d="M9 6l6 6-6 6"/>
      </svg>
    </button>
  );
}

// ── DetallePanel ───────────────────────────────────────────────────────────

function DetallePanel({
  liqId, onClose, onMutated,
}: {
  liqId: string;
  onClose: () => void;
  onMutated: () => void;
}) {
  const qc = useQueryClient();

  const [showPagar, setShowPagar]   = useState(false);
  const [showAnular, setShowAnular] = useState(false);
  const [mutErr, setMutErr]         = useState('');

  const { data: det, isLoading } = useQuery<LiqDetalle>({
    queryKey: ['liq-detalle', liqId],
    queryFn: () => api.get(`/liquidaciones/${liqId}`).then(r => r.data),
    staleTime: 0,
  });

  const pagar = useMutation({
    mutationFn: () => api.patch(`/liquidaciones/${liqId}/pagar`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liq-detalle', liqId] });
      qc.invalidateQueries({ queryKey: ['liq-historial'] });
      setShowPagar(false);
      onMutated();
    },
    onError: (e) => setMutErr(errMsg(e)),
  });

  const anular = useMutation({
    mutationFn: () => api.patch(`/liquidaciones/${liqId}/anular`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liq-detalle', liqId] });
      qc.invalidateQueries({ queryKey: ['liq-historial'] });
      qc.invalidateQueries({ queryKey: ['liq-preview'] });
      setShowAnular(false);
      onMutated();
    },
    onError: (e) => setMutErr(errMsg(e)),
  });

  const esPendiente = det && !det.pagada && !det.anuladaAt;
  const esPagada    = det && det.pagada && !det.anuladaAt;
  const esAnulada   = det && !!det.anuladaAt;

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHead}>
        <div className={styles.detailHeadInfo}>
          {det && (
            <>
              <div className={styles.detailEmpleadoRow}>
                <div className={`${styles.empleadoAvatar} ${styles.avatarLg}`}>
                  {det.empleadoNombre.charAt(0)}
                </div>
                <div>
                  <span className={styles.detailEmpleado}>{det.empleadoNombre}</span>
                  <span className={styles.detailPeriodo}>{fmtPeriodo(det.periodoIni, det.periodoFin)}</span>
                </div>
              </div>
              <span className={estadoBadge(det).cls}>{estadoBadge(det).label}</span>
            </>
          )}
        </div>
        <button type="button" className={styles.detailClose} onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {isLoading && (
        <div className={styles.loadWrap}><span className={styles.spinner} /></div>
      )}

      {det && !isLoading && (
        <>
          {/* Meta */}
          <div className={styles.detailMeta}>
            <div className={styles.detailMetaRow}>
              <span>Creada</span>
              <span>{fmtFecha(det.createdAt)}</span>
            </div>
            {det.pagadaAt && (
              <div className={styles.detailMetaRow}>
                <span>Pagada</span>
                <span>{fmtFecha(det.pagadaAt)}</span>
              </div>
            )}
            {det.anuladaAt && (
              <div className={styles.detailMetaRow}>
                <span>Anulada</span>
                <span>{fmtFecha(det.anuladaAt)}</span>
              </div>
            )}
            {det.nota && (
              <div className={styles.detailMetaRow}>
                <span>Nota</span>
                <span>{det.nota}</span>
              </div>
            )}
          </div>

          {/* Total highlight */}
          <div className={styles.detailTotalBox}>
            <span className={styles.detailTotalLabel}>Total a pagar</span>
            <span className={`${styles.detailTotalMonto} ${styles.monospace}`}>{fmtM(det.totalPagar)}</span>
          </div>

          {/* Lines */}
          {det.lineas.length > 0 && (
            <div className={styles.lineasSection}>
              <div className={styles.lineasHead}>
                <span>{det.lineas.length} línea(s)</span>
              </div>
              <div className={styles.lineasTableWrap}>
                <table className={styles.lineasTable}>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Factura</th>
                      <th>Servicio</th>
                      <th className={styles.tNum}>Base</th>
                      <th className={styles.tNum}>%</th>
                      <th className={styles.tNum}>Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {det.lineas.map(l => (
                      <tr key={l.id}>
                        <td>{fmtFecha(l.fecha)}</td>
                        <td className={styles.monoSmall}>{l.factura}</td>
                        <td>{l.descripcion ?? '—'}</td>
                        <td className={`${styles.tNum} ${styles.monoSmall}`}>{fmtMShort(l.subtotal)}</td>
                        <td className={`${styles.tNum} ${styles.monoSmall}`}>{l.comisionPct}%</td>
                        <td className={`${styles.tNum} ${styles.monoSmall} ${styles.comisionCell}`}>{fmtM(l.comisionMonto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className={styles.detailActions}>
            <button
              type="button"
              className={styles.btnComprobante}
              onClick={() => downloadPdf(
                `/liquidaciones/${liqId}/comprobante`,
                `comprobante-${det.empleadoNombre.replace(/\s+/g,'-')}-${liqId.slice(0,8)}.pdf`,
              )}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Comprobante PDF
            </button>

            {esPendiente && (
              <>
                <button
                  type="button"
                  className={styles.btnPagar}
                  onClick={() => { setMutErr(''); setShowPagar(true); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                  Marcar como pagada
                </button>
                <button
                  type="button"
                  className={styles.btnAnular}
                  onClick={() => { setMutErr(''); setShowAnular(true); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                  Anular
                </button>
              </>
            )}

            {esPagada && (
              <span className={styles.infoNote}>Liquidación pagada — sin acciones disponibles.</span>
            )}

            {esAnulada && (
              <span className={styles.infoNote}>Liquidación anulada — las líneas volvieron al pool.</span>
            )}
          </div>
        </>
      )}

      {/* Modals */}
      {showPagar && det && (
        <ConfirmModal
          title="Marcar como pagada"
          message={
            <span>¿Confirmas que entregaste <strong className={styles.monospace}>{fmtM(det.totalPagar)}</strong> a <strong>{det.empleadoNombre}</strong>?</span>
          }
          confirmLabel="Confirmar pago"
          loading={pagar.isPending}
          error={mutErr}
          onConfirm={() => { setMutErr(''); pagar.mutate(); }}
          onClose={() => { setShowPagar(false); setMutErr(''); }}
        />
      )}

      {showAnular && det && (
        <ConfirmModal
          title="Anular liquidación"
          message={
            <span>Las <strong>{det.lineas.length}</strong> línea(s) de <strong>{det.empleadoNombre}</strong> volverán a estar disponibles para liquidar en otro período.</span>
          }
          confirmLabel="Confirmar anulación"
          danger
          loading={anular.isPending}
          error={mutErr}
          onConfirm={() => { setMutErr(''); anular.mutate(); }}
          onClose={() => { setShowAnular(false); setMutErr(''); }}
        />
      )}
    </div>
  );
}

// ── HistorialTab ───────────────────────────────────────────────────────────

function HistorialTab() {
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>('todos');
  const [search, setSearch]             = useState('');
  const [desdeF, setDesdeF]             = useState('');
  const [hastaF, setHastaF]             = useState('');

  const params: Record<string, string> = {};
  if (desdeF) params.desde = desdeF;
  if (hastaF) params.hasta = hastaF;
  if (estadoFiltro === 'pagada')   params.pagada = 'true';
  if (estadoFiltro === 'pendiente') params.pagada = 'false';

  const { data: lista = [], isLoading, error: listErr } = useQuery<LiqItem[]>({
    queryKey: ['liq-historial', desdeF, hastaF, estadoFiltro],
    queryFn: () => api.get('/liquidaciones', { params }).then(r => r.data),
    staleTime: 0,
  });

  const listaMostrar = useMemo(() => {
    let arr = lista;
    if (estadoFiltro === 'anulada')   arr = arr.filter(i => !!i.anuladaAt);
    if (estadoFiltro === 'pendiente') arr = arr.filter(i => !i.pagada && !i.anuladaAt);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(i => i.empleadoNombre.toLowerCase().includes(q));
    }
    return arr;
  }, [lista, estadoFiltro, search]);

  useEffect(() => {
    if (selectedId && !listaMostrar.find(i => i.id === selectedId)) {
      // keep selection even if filtered out (detail still visible)
    }
  }, [listaMostrar, selectedId]);

  function handleMutated() {
    // detail panel will refetch; list was already invalidated
  }

  return (
    <div className={styles.tabContent}>
      {/* Filters */}
      <div className={styles.histFilters}>
        <div className={styles.searchBar}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="14" height="14">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Buscar empleado…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>

        <div className={styles.filtrosBar}>
          {(['todos','pendiente','pagada','anulada'] as EstadoFiltro[]).map(f => (
            <button
              key={f}
              type="button"
              className={`${styles.filtroChip} ${estadoFiltro === f ? styles.filtroChipActive : ''}`}
              onClick={() => setEstadoFiltro(f)}
            >
              {f === 'todos' ? 'Todos' : f === 'pendiente' ? 'Pendiente' : f === 'pagada' ? 'Pagada' : 'Anulada'}
            </button>
          ))}
        </div>

        <div className={styles.rangoRow}>
          <input type="date" value={desdeF} onChange={e => setDesdeF(e.target.value)} className={styles.dateInputSm} placeholder="Desde" title="Filtrar desde" />
          <span className={styles.dateSep}>–</span>
          <input type="date" value={hastaF} onChange={e => setHastaF(e.target.value)} className={styles.dateInputSm} placeholder="Hasta" title="Filtrar hasta" />
          {(desdeF || hastaF) && (
            <button type="button" className={styles.clearDates} onClick={() => { setDesdeF(''); setHastaF(''); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Split */}
      <div className={styles.splitLayout}>
        <div className={styles.leftPanel}>
          {isLoading && (
            <div className={styles.loadWrap}><span className={styles.spinner} /><span>Cargando…</span></div>
          )}
          {listErr && !isLoading && (
            <div className={styles.errBanner}>{errMsg(listErr)}</div>
          )}
          {!isLoading && !listErr && listaMostrar.length === 0 && (
            <div className={styles.emptyState}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" width="36" height="36">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>
              </svg>
              <p>{search ? 'Sin resultados para esta búsqueda.' : 'No hay liquidaciones aún.'}</p>
            </div>
          )}
          {listaMostrar.map(item => (
            <HistorialRow
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              onClick={() => setSelectedId(prev => prev === item.id ? null : item.id)}
            />
          ))}
        </div>

        {selectedId && (
          <div className={styles.rightPanel}>
            <DetallePanel
              liqId={selectedId}
              onClose={() => setSelectedId(null)}
              onMutated={handleMutated}
            />
          </div>
        )}
      </div>

      {selectedId && (
        <div className={styles.mobileDrawerOverlay} onClick={() => setSelectedId(null)} />
      )}
    </div>
  );
}

// ── LiquidacionesPage ──────────────────────────────────────────────────────

export function LiquidacionesPage() {
  const [tab, setTab] = useState<'nueva' | 'historial'>('nueva');

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Comisiones</h1>
          <p className={styles.pageSub}>Liquida y paga las comisiones del equipo por período.</p>
        </div>
      </div>

      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabBtn} ${tab === 'nueva' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('nueva')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="15" height="15">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Nueva liquidación
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${tab === 'historial' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('historial')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="15" height="15">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Historial
        </button>
      </div>

      {tab === 'nueva'
        ? <NuevaTab onCorteCreado={() => setTab('historial')} />
        : <HistorialTab />
      }
    </div>
  );
}