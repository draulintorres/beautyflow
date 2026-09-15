import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, downloadPdf } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useAuthStore } from '../../store/auth';
import styles from './CuentasPorCobrarPage.module.css';

// ── Types ──────────────────────────────────────────────────
interface VentaResumen {
  id: string;
  factura: string;
  cliente: string;
  clienteTelefono: string | null;
  profesional: string | null;
  total: number;
  saldo: number;
  estado: string;
  fecha: string;
}

interface ClienteGrupo {
  nombre: string;
  telefono: string | null;
  totalSaldo: number;
  totalFacturado: number;
  facturas: VentaResumen[];
  tieneVencidas: boolean;
  diasMaxMora: number;
}

interface MetodoPago {
  id: string;
  nombre: string;
  esEfectivo: boolean;
  activo: boolean;
}

interface PagoHistorial {
  id: string;
  metodo: string;
  monto: number;
  referencia: string | null;
  esAbonoDeuda: boolean;
  fecha: string | null;
}

interface UltimoCobro {
  ventaId: string;
  pagoId: string | null;
  clienteNombre: string;
  clienteTel: string | null;
  monto: number;
  factura: string;
}

interface VentaDetalle {
  id: string;
  factura: string;
  cliente: { id: string; nombre: string; telefono: string | null } | null;
  total: number;
  saldo: number;
  estado: string;
  pagos: PagoHistorial[];
  fecha: string;
}

// ── Alquiler de silla: deudas de inquilinos ────────────────
interface DeudaAlquiler {
  id: string;
  empleadoId: string;
  concepto: string;
  montoTotal: number | string;
  montoPagado: number | string;
  saldo: number | string;
  estado: 'PENDIENTE' | 'ABONO_PARCIAL' | 'SALDADA' | 'ANULADA';
  referenciaTipo: string | null;
  periodoIni: string | null;
  periodoFin: string | null;
  createdAt: string;
  empleado: { id: string; nombre: string };
}
interface AbonoAlquiler {
  id: string;
  monto: number | string;
  metodoPagoId: string | null;
  nota: string | null;
  createdAt: string;
}
interface DeudaAlquilerDetalle extends DeudaAlquiler {
  abonos: AbonoAlquiler[];
}
interface InquilinoGrupo {
  empleadoId: string;
  nombre: string;
  totalSaldo: number;
  deudas: DeudaAlquiler[];
}

// ── Constants ──────────────────────────────────────────────
const MORA_DIAS = 30;
type FiltroTab = 'todos' | 'pendientes' | 'parciales' | 'vencidas';
type MainTab = 'clientes' | 'inquilinos';
const OWNER_ADMIN = new Set(['OWNER', 'ADMIN']);
const ESTADO_DEUDA_LABEL: Record<string, string> = {
  PENDIENTE: 'Sin pagar',
  ABONO_PARCIAL: 'Parcial',
  SALDADA: 'Saldada',
  ANULADA: 'Anulada',
};

// ── Utilities ──────────────────────────────────────────────
function diasMora(fechaISO: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(fechaISO).getTime()) / 86_400_000));
}

function diasRelativo(fechaISO: string): string {
  const d = diasMora(fechaISO);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Hace 1 día';
  return `Hace ${d} días`;
}

function clsMora(dias: number): string {
  if (dias < 7) return styles.dotVerde;
  if (dias <= 30) return styles.dotAmarillo;
  return styles.dotRojo;
}

function fmt(n: number) {
  return `RD$ ${formatMoney(n)}`;
}

function fmtDec(n: number) {
  return `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtFecha(iso: string) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function errMsg(e: unknown) {
  const msg = (e as any)?.response?.data?.message;
  if (!msg) return 'Error inesperado.';
  return Array.isArray(msg) ? msg.join(' · ') : String(msg);
}

function waUrl(telefono: string, nombre: string, saldo: number, factura: string): string {
  const num = telefono.replace(/\D/g, '');
  const conPais = num.startsWith('1') ? num : `1${num}`;
  const msg = `Hola ${nombre}. Te recordamos que tienes un saldo pendiente de RD$ ${saldo.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} correspondiente a la factura ${factura}. ¡Gracias!`;
  return `https://wa.me/${conPais}?text=${encodeURIComponent(msg)}`;
}

// ── WA SVG helper ─────────────────────────────────────────
function WaSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.534 5.857L.054 23.5l5.768-1.514A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.86 0-3.601-.504-5.093-1.382l-.365-.218-3.782.992.967-3.698-.238-.381A9.944 9.944 0 012 12c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10z"/>
    </svg>
  );
}

// ── Modal de Cobro ─────────────────────────────────────────
function CobroModal({
  venta,
  metodosPago,
  onClose,
  onSuccess,
}: {
  venta: VentaResumen;
  metodosPago: MetodoPago[];
  onClose: () => void;
  onSuccess: (monto: number, nuevoSaldo: number, pagoId: string | null) => void;
}) {
  const qc = useQueryClient();

  const [monto, setMonto]               = useState(venta.saldo.toFixed(2));
  const [metodoPagoId, setMetodoPagoId] = useState(metodosPago[0]?.id ?? '');
  const [referencia, setReferencia]     = useState('');
  const [err, setErr]                   = useState('');
  const [confirmando, setConfirmando]   = useState(false);

  const montoNum        = parseFloat(monto) || 0;
  const nuevoSaldo      = Math.max(0, venta.saldo - montoNum);
  const metodoPagoNombre = metodosPago.find(m => m.id === metodoPagoId)?.nombre ?? '';
  const montoValido     = montoNum > 0 && montoNum <= venta.saldo + 0.01;

  const abonar = useMutation({
    mutationFn: () =>
      api.post(`/facturas/${venta.id}/abono`, {
        metodoPagoId,
        monto: montoNum,
        ...(referencia.trim() ? { referencia: referencia.trim() } : {}),
      }).then(r => r.data),
    onSuccess: (ventaActualizada: any) => {
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['factura-detalle', venta.id] });
      const pagos: PagoHistorial[] = ventaActualizada?.pagos ?? [];
      const ultimoPago = pagos[pagos.length - 1];
      onSuccess(montoNum, nuevoSaldo, ultimoPago?.id ?? null);
    },
    onError: (e) => { setErr(errMsg(e)); setConfirmando(false); },
  });

  const handleConfirmar = () => {
    setErr('');
    if (!montoValido) return;
    if (!metodoPagoId) { setErr('Selecciona un método de pago.'); return; }
    if (!confirmando) { setConfirmando(true); return; }
    abonar.mutate();
  };

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>Registrar cobro</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.deudaCtx}>
            <div className={styles.deudaCtxRow}><span>Cliente</span><strong>{venta.cliente}</strong></div>
            <div className={styles.deudaCtxRow}><span>Factura</span><strong>{venta.factura}</strong></div>
            <div className={styles.deudaCtxRow}><span>Total original</span><strong>{fmtDec(venta.total)}</strong></div>
            <div className={`${styles.deudaCtxRow} ${styles.deudaCtxSaldo}`}>
              <span>Saldo pendiente</span>
              <strong className={styles.saldoDestacado}>{fmtDec(venta.saldo)}</strong>
            </div>
          </div>

          <div className={styles.formField}>
            <label>Monto a cobrar *</label>
            <div className={styles.montoWrap}>
              <span className={styles.montoPrefix}>RD$</span>
              <input
                type="number" min="0.01" max={venta.saldo} step="0.01"
                value={monto}
                onChange={e => { setMonto(e.target.value); setConfirmando(false); setErr(''); }}
                className={styles.montoInput}
                autoFocus
              />
            </div>
            {montoNum > venta.saldo + 0.01 && (
              <span className={styles.fieldErr}>El monto no puede exceder el saldo ({fmtDec(venta.saldo)}).</span>
            )}
          </div>

          {montoValido && (
            <div className={`${styles.saldoPreview} ${nuevoSaldo <= 0.01 ? styles.saldoPreviewCero : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="14" height="14">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              {nuevoSaldo <= 0.01
                ? 'La factura quedará PAGADA (saldo 0).'
                : `Saldo restante: ${fmtDec(nuevoSaldo)} → ABONO PARCIAL.`}
            </div>
          )}

          <div className={styles.formField}>
            <label>Método de pago *</label>
            <select value={metodoPagoId} onChange={e => { setMetodoPagoId(e.target.value); setConfirmando(false); }} className={styles.select}>
              {metodosPago.filter(m => m.activo).map(m => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label>Referencia <span className={styles.opcional}>(opcional)</span></label>
            <input
              type="text" placeholder="Nº de transacción, cheque, etc."
              value={referencia} onChange={e => setReferencia(e.target.value)}
              maxLength={100} className={styles.inputText}
            />
          </div>

          {confirmando && montoValido && (
            <div className={styles.confirmBox}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="16" height="16">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
              <span>
                ¿Confirmar cobro de <strong>{fmtDec(montoNum)}</strong> a{' '}
                <strong>{venta.cliente}</strong> en <strong>{metodoPagoNombre}</strong>?
              </span>
            </div>
          )}

          {err && <div className={styles.modalErr}>{err}</div>}
        </div>

        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={abonar.isPending}>
            Cancelar
          </button>
          <button
            type="button" className={styles.btnCobrar}
            onClick={handleConfirmar}
            disabled={!montoValido || !metodoPagoId || abonar.isPending}
          >
            {abonar.isPending ? 'Registrando…' : confirmando ? '✓ Confirmar cobro' : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de Historial ─────────────────────────────────────
function HistorialModal({
  ventaId,
  onClose,
  onRegistrarPago,
}: {
  ventaId: string;
  onClose: () => void;
  onRegistrarPago?: () => void;
}) {
  const { data: detalle, isLoading } = useQuery<VentaDetalle>({
    queryKey: ['factura-detalle', ventaId],
    queryFn: () => api.get(`/facturas/${ventaId}`).then(r => r.data),
    staleTime: 0,
  });

  const abonos       = detalle?.pagos ?? [];
  const totalAbonado = abonos.reduce((s, p) => s + p.monto, 0);

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`${styles.modal} ${styles.modalHist}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <div>
            <h3>Historial de cobros</h3>
            {detalle && (
              <p className={styles.histSubtitle}>
                {detalle.factura} · {detalle.cliente?.nombre ?? '—'} · Total: {fmtDec(detalle.total)}
              </p>
            )}
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          {isLoading && (
            <div className={styles.loadWrap}><span className={styles.spinner} /></div>
          )}

          {!isLoading && abonos.length === 0 && (
            <p className={styles.emptyMsg}>No hay cobros registrados para esta factura.</p>
          )}

          {abonos.length > 0 && (
            <div className={styles.historialList}>
              {abonos.map((p, idx) => (
                <div key={p.id || idx} className={styles.historialItem}>
                  <div className={styles.histItemLeft}>
                    <div className={styles.histItemTop}>
                      <span className={p.esAbonoDeuda ? styles.histBadgeAbono : styles.histBadgeVenta}>
                        {p.esAbonoDeuda ? 'Abono' : 'Pago inicial'}
                      </span>
                      <span className={styles.histMetodo}>{p.metodo}</span>
                    </div>
                    <div className={styles.histItemBot}>
                      {p.fecha && (
                        <span className={styles.histFecha}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="11" height="11">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                          </svg>
                          {fmtFecha(p.fecha)} · {diasRelativo(p.fecha)}
                        </span>
                      )}
                      {p.referencia && <span className={styles.histRef}>{p.referencia}</span>}
                    </div>
                  </div>
                  <div className={styles.histItemRight}>
                    <span className={styles.histMonto}>{fmtDec(p.monto)}</span>
                    {p.id && (
                      <button
                        type="button"
                        className={styles.histDownloadBtn}
                        title="Descargar recibo de pago"
                        onClick={() => downloadPdf(
                          `/facturas/${ventaId}/recibo-abono/${p.id}`,
                          `recibo-pago-${p.id.slice(0, 8)}.pdf`,
                        )}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {detalle && (
            <div className={styles.histPie}>
              <div className={styles.histPieRow}>
                <span>Total abonado</span>
                <strong>{fmtDec(totalAbonado)}</strong>
              </div>
              <div className={`${styles.histPieRow} ${styles.histPieSaldo}`}>
                <span>Saldo pendiente</span>
                <strong className={styles.saldoDestacado}>{fmtDec(detalle.saldo)}</strong>
              </div>
            </div>
          )}
        </div>

        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>
            Cerrar
          </button>
          {onRegistrarPago && detalle && detalle.saldo > 0.01 && (
            <button type="button" className={styles.btnCobrar} onClick={onRegistrarPago}>
              + Registrar pago
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Factura card dentro del panel de detalle ───────────────
function FacturaInPanel({
  venta,
  onCobrar,
  onHistorial,
}: {
  venta: VentaResumen;
  onCobrar: () => void;
  onHistorial: () => void;
}) {
  const mora       = diasMora(venta.fecha);
  const abonado    = Math.max(0, venta.total - venta.saldo);
  const pct        = venta.total > 0 ? Math.min(100, Math.round((abonado / venta.total) * 100)) : 0;
  const esPendiente = venta.estado === 'PENDIENTE';

  return (
    <div className={styles.panelFacturaCard}>
      <div className={styles.panelFacturaTop}>
        <div className={styles.panelFacturaLeft}>
          <span className={`${styles.moraDot} ${clsMora(mora)}`} />
          <span className={styles.panelFacturaNum}>{venta.factura}</span>
          <span className={`${styles.estadoBadge} ${esPendiente ? styles.estadoPendiente : styles.estadoParcial}`}>
            {esPendiente ? 'Sin pagar' : 'Parcial'}
          </span>
          {mora > MORA_DIAS && <span className={styles.moraBadge}>{mora}d</span>}
        </div>
        <span className={styles.panelFacturaSaldo}>{fmtDec(venta.saldo)}</span>
      </div>

      <div className={styles.panelFacturaMid}>
        <div className={styles.progRow}>
          <div className={styles.progBar}>
            <div className={styles.progFill} style={{ width: `${pct}%` }} />
          </div>
          <span className={styles.progPct}>{pct}%</span>
        </div>
        <span className={styles.panelFacturaFecha} title={fmtFecha(venta.fecha)}>
          {diasRelativo(venta.fecha)} · {fmtFecha(venta.fecha)}
        </span>
      </div>

      {venta.profesional && (
        <span className={styles.panelFacturaPro}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="10" height="10">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          {venta.profesional}
        </span>
      )}

      <div className={styles.panelFacturaActions}>
        <button type="button" className={styles.btnHist} onClick={onHistorial}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="12" height="12">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Historial
        </button>
        <button type="button" className={styles.btnCobrarSm} onClick={onCobrar}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="12" height="12">
            <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
          </svg>
          Cobrar
        </button>
      </div>
    </div>
  );
}

// ── Panel de detalle del cliente (derecha) ─────────────────
function ClienteDetailPanel({
  grupo,
  onCobrar,
  onHistorial,
  onClose,
}: {
  grupo: ClienteGrupo;
  onCobrar: (v: VentaResumen) => void;
  onHistorial: (id: string) => void;
  onClose: () => void;
}) {
  const mora         = grupo.diasMaxMora;
  const totalAbonado = grupo.totalFacturado - grupo.totalSaldo;

  const waHref = grupo.telefono
    ? waUrl(
        grupo.telefono,
        grupo.nombre,
        grupo.totalSaldo,
        grupo.facturas.length === 1 ? grupo.facturas[0].factura : 'facturas pendientes',
      )
    : null;

  const avatarExtra = clsMora(mora) === styles.dotRojo
    ? styles.avatarRed
    : clsMora(mora) === styles.dotAmarillo
    ? styles.avatarAmarillo
    : '';

  return (
    <div className={styles.detailPanel}>
      {/* Header */}
      <div className={styles.detailHead}>
        <div className={`${styles.detailAvatar} ${avatarExtra}`}>
          {grupo.nombre.charAt(0).toUpperCase()}
        </div>
        <div className={styles.detailHeadInfo}>
          <h3 className={styles.detailNombre}>{grupo.nombre}</h3>
          {grupo.telefono
            ? <span className={styles.detailTel}>{grupo.telefono}</span>
            : <span className={styles.detailTelMissing}>Sin teléfono</span>
          }
          {mora > MORA_DIAS && (
            <span className={`${styles.vencidaBadge} ${styles.detailVencida}`}>{mora}d vencida</span>
          )}
        </div>
        <button type="button" className={styles.detailClose} onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Resumen numérico */}
      <div className={styles.detailSummary}>
        <div className={styles.detailSumItem}>
          <span className={styles.detailSumLabel}>Facturado</span>
          <span className={styles.detailSumVal}>{fmtDec(grupo.totalFacturado)}</span>
        </div>
        <div className={styles.detailSumItem}>
          <span className={styles.detailSumLabel}>Abonado</span>
          <span className={`${styles.detailSumVal} ${styles.detailSumOk}`}>{fmtDec(totalAbonado)}</span>
        </div>
        <div className={`${styles.detailSumItem} ${styles.detailSumItemFull}`}>
          <span className={styles.detailSumLabel}>Saldo pendiente</span>
          <span className={`${styles.detailSumVal} ${styles.detailSumGold}`}>{fmtDec(grupo.totalSaldo)}</span>
        </div>
      </div>

      {/* WhatsApp */}
      <div className={styles.detailWaWrap}>
        {waHref ? (
          <a href={waHref} target="_blank" rel="noopener noreferrer" className={`${styles.btnWa} ${styles.btnWaFull}`}>
            <WaSvg />
            Recordar pago · {fmtDec(grupo.totalSaldo)}
          </a>
        ) : (
          <button type="button" disabled className={`${styles.btnWa} ${styles.btnWaFull} ${styles.btnWaDisabled}`}>
            <WaSvg />
            Sin teléfono registrado
          </button>
        )}
      </div>

      {/* Facturas */}
      <div className={styles.detailSectionHead}>
        <span className={styles.detailSectionTitle}>
          {grupo.facturas.length === 1 ? 'Factura pendiente' : `${grupo.facturas.length} facturas pendientes`}
        </span>
      </div>
      <div className={styles.detailFacturas}>
        {grupo.facturas.map(v => (
          <FacturaInPanel
            key={v.id}
            venta={v}
            onCobrar={() => onCobrar(v)}
            onHistorial={() => onHistorial(v.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Fila compacta en tabla de clientes (izquierda) ─────────
function ClienteTableRow({
  grupo,
  selected,
  onClick,
}: {
  grupo: ClienteGrupo;
  selected: boolean;
  onClick: () => void;
}) {
  const mora     = grupo.diasMaxMora;
  const abonado  = grupo.totalFacturado - grupo.totalSaldo;
  const pct      = grupo.totalFacturado > 0
    ? Math.min(100, Math.round((abonado / grupo.totalFacturado) * 100))
    : 0;
  const oldestFecha = grupo.facturas[0]?.fecha ?? '';

  const avatarExtra = mora > MORA_DIAS ? styles.avatarRed : mora >= 7 ? styles.avatarAmarillo : '';

  return (
    <button
      type="button"
      className={`${styles.tableRow} ${selected ? styles.tableRowSelected : ''} ${mora > MORA_DIAS ? styles.tableRowVencida : ''}`}
      onClick={onClick}
    >
      <span className={`${styles.moraDot} ${clsMora(mora)}`} />

      <div className={styles.tableInfo}>
        <div className={`${styles.tableAvatar} ${avatarExtra}`}>
          {grupo.nombre.charAt(0).toUpperCase()}
        </div>
        <div className={styles.tableNameBlock}>
          <span className={styles.tableNombre}>{grupo.nombre}</span>
          <span className={styles.tableMeta}>
            {grupo.telefono ?? 'Sin tel.'} · {grupo.facturas.length} fact.
          </span>
          <div className={styles.tableProgRow}>
            <div className={styles.progBar}>
              <div className={styles.progFill} style={{ width: `${pct}%` }} />
            </div>
            <span className={styles.progPct}>{pct}%</span>
          </div>
        </div>
      </div>

      <div className={styles.tableDiasCol}>
        <span className={styles.tableDiasRel}>{diasRelativo(oldestFecha)}</span>
        {mora > MORA_DIAS && <span className={styles.tableMoraBadge}>{mora}d</span>}
      </div>

      <div className={styles.tableSaldoCol}>
        <span className={styles.tableSaldo}>{fmtDec(grupo.totalSaldo)}</span>
        <span className={styles.tableTotal}>{fmt(grupo.totalFacturado)}</span>
      </div>

      <svg
        className={`${styles.tableChevron} ${selected ? styles.tableChevronSel : ''}`}
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
        width="14" height="14"
      >
        <path d="M9 6l6 6-6 6"/>
      </svg>
    </button>
  );
}

// ── Modal de abono a una deuda de alquiler ─────────────────
function AbonoAlquilerModal({
  deuda,
  inquilinoNombre,
  metodosPago,
  onClose,
  onSuccess,
}: {
  deuda: DeudaAlquiler;
  inquilinoNombre: string;
  metodosPago: MetodoPago[];
  onClose: () => void;
  onSuccess: (monto: number, nuevoSaldo: number) => void;
}) {
  const qc = useQueryClient();
  const saldo = Number(deuda.saldo);

  const [monto, setMonto]               = useState(saldo.toFixed(2));
  const [metodoPagoId, setMetodoPagoId] = useState('');
  const [nota, setNota]                 = useState('');
  const [err, setErr]                   = useState('');
  const [confirmando, setConfirmando]   = useState(false);

  const montoNum   = parseFloat(monto) || 0;
  const nuevoSaldo = Math.max(0, saldo - montoNum);
  const montoValido = montoNum > 0 && montoNum <= saldo + 0.01;

  const abonar = useMutation({
    mutationFn: () =>
      api.post(`/alquiler/deudas/${deuda.id}/abono`, {
        monto: montoNum,
        ...(metodoPagoId ? { metodoPagoId } : {}),
        ...(nota.trim() ? { nota: nota.trim() } : {}),
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alquiler-deudas'] });
      qc.invalidateQueries({ queryKey: ['alquiler-deuda-detalle', deuda.id] });
      onSuccess(montoNum, nuevoSaldo);
    },
    onError: (e) => { setErr(errMsg(e)); setConfirmando(false); },
  });

  const handleConfirmar = () => {
    setErr('');
    if (!montoValido) return;
    if (!confirmando) { setConfirmando(true); return; }
    abonar.mutate();
  };

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>Registrar abono</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.deudaCtx}>
            <div className={styles.deudaCtxRow}><span>Inquilino</span><strong>{inquilinoNombre}</strong></div>
            <div className={styles.deudaCtxRow}><span>Concepto</span><strong>{deuda.concepto}</strong></div>
            <div className={styles.deudaCtxRow}><span>Total original</span><strong>{fmtDec(Number(deuda.montoTotal))}</strong></div>
            <div className={`${styles.deudaCtxRow} ${styles.deudaCtxSaldo}`}>
              <span>Saldo pendiente</span>
              <strong className={styles.saldoDestacado}>{fmtDec(saldo)}</strong>
            </div>
          </div>

          <div className={styles.formField}>
            <label>Monto a abonar *</label>
            <div className={styles.montoWrap}>
              <span className={styles.montoPrefix}>RD$</span>
              <input
                type="number" min="0.01" max={saldo} step="0.01"
                value={monto}
                onChange={e => { setMonto(e.target.value); setConfirmando(false); setErr(''); }}
                className={styles.montoInput}
                autoFocus
              />
            </div>
            {montoNum > saldo + 0.01 && (
              <span className={styles.fieldErr}>El monto no puede exceder el saldo ({fmtDec(saldo)}).</span>
            )}
          </div>

          {montoValido && (
            <div className={`${styles.saldoPreview} ${nuevoSaldo <= 0.01 ? styles.saldoPreviewCero : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="14" height="14">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              {nuevoSaldo <= 0.01
                ? 'La deuda quedará SALDADA (saldo 0).'
                : `Saldo restante: ${fmtDec(nuevoSaldo)} → ABONO PARCIAL.`}
            </div>
          )}

          <div className={styles.formField}>
            <label>Método de pago <span className={styles.opcional}>(opcional)</span></label>
            <select value={metodoPagoId} onChange={e => { setMetodoPagoId(e.target.value); setConfirmando(false); }} className={styles.select}>
              <option value="">Sin especificar</option>
              {metodosPago.filter(m => m.activo).map(m => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label>Nota <span className={styles.opcional}>(opcional)</span></label>
            <input
              type="text" placeholder="Comentario interno…"
              value={nota} onChange={e => setNota(e.target.value)}
              maxLength={255} className={styles.inputText}
            />
          </div>

          {confirmando && montoValido && (
            <div className={styles.confirmBox}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="16" height="16">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
              <span>
                ¿Confirmar abono de <strong>{fmtDec(montoNum)}</strong> de{' '}
                <strong>{inquilinoNombre}</strong>?
              </span>
            </div>
          )}

          {err && <div className={styles.modalErr}>{err}</div>}
        </div>

        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={abonar.isPending}>
            Cancelar
          </button>
          <button
            type="button" className={styles.btnCobrar}
            onClick={handleConfirmar}
            disabled={!montoValido || abonar.isPending}
          >
            {abonar.isPending ? 'Registrando…' : confirmando ? '✓ Confirmar abono' : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de historial de abonos de una deuda de alquiler ──
function HistorialAlquilerModal({
  deudaId,
  inquilinoNombre,
  onClose,
  onRegistrarAbono,
}: {
  deudaId: string;
  inquilinoNombre: string;
  onClose: () => void;
  onRegistrarAbono?: () => void;
}) {
  const { data: detalle, isLoading } = useQuery<DeudaAlquilerDetalle>({
    queryKey: ['alquiler-deuda-detalle', deudaId],
    queryFn: () => api.get(`/alquiler/deudas/${deudaId}`).then(r => r.data),
    staleTime: 0,
  });

  const abonos = detalle?.abonos ?? [];

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`${styles.modal} ${styles.modalHist}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <div>
            <h3>Historial de abonos</h3>
            {detalle && (
              <p className={styles.histSubtitle}>
                {detalle.concepto} · {inquilinoNombre} · Total: {fmtDec(Number(detalle.montoTotal))}
              </p>
            )}
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          {isLoading && (
            <div className={styles.loadWrap}><span className={styles.spinner} /></div>
          )}

          {!isLoading && abonos.length === 0 && (
            <p className={styles.emptyMsg}>No hay abonos registrados para esta deuda.</p>
          )}

          {abonos.length > 0 && (
            <div className={styles.historialList}>
              {abonos.map((a, idx) => (
                <div key={a.id || idx} className={styles.historialItem}>
                  <div className={styles.histItemLeft}>
                    <div className={styles.histItemTop}>
                      <span className={styles.histBadgeAbono}>Abono</span>
                    </div>
                    <div className={styles.histItemBot}>
                      {a.createdAt && (
                        <span className={styles.histFecha}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="11" height="11">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                          </svg>
                          {fmtFecha(a.createdAt)} · {diasRelativo(a.createdAt)}
                        </span>
                      )}
                      {a.nota && <span className={styles.histRef}>{a.nota}</span>}
                    </div>
                  </div>
                  <div className={styles.histItemRight}>
                    <span className={styles.histMonto}>{fmtDec(Number(a.monto))}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {detalle && (
            <div className={styles.histPie}>
              <div className={styles.histPieRow}>
                <span>Total abonado</span>
                <strong>{fmtDec(Number(detalle.montoPagado))}</strong>
              </div>
              <div className={`${styles.histPieRow} ${styles.histPieSaldo}`}>
                <span>Saldo pendiente</span>
                <strong className={styles.saldoDestacado}>{fmtDec(Number(detalle.saldo))}</strong>
              </div>
            </div>
          )}
        </div>

        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>
            Cerrar
          </button>
          {onRegistrarAbono && detalle && Number(detalle.saldo) > 0.01 && (
            <button type="button" className={styles.btnCobrar} onClick={onRegistrarAbono}>
              + Registrar abono
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Deuda card dentro del panel de detalle del inquilino ───
function DeudaInPanel({
  deuda,
  onCobrar,
  onHistorial,
}: {
  deuda: DeudaAlquiler;
  onCobrar: () => void;
  onHistorial: () => void;
}) {
  const saldo    = Number(deuda.saldo);
  const total    = Number(deuda.montoTotal);
  const abonado  = Math.max(0, total - saldo);
  const pct      = total > 0 ? Math.min(100, Math.round((abonado / total) * 100)) : 0;
  const esPendiente = deuda.estado === 'PENDIENTE';
  const cerrada  = deuda.estado === 'SALDADA' || deuda.estado === 'ANULADA';

  return (
    <div className={styles.panelFacturaCard}>
      <div className={styles.panelFacturaTop}>
        <div className={styles.panelFacturaLeft}>
          <span className={styles.panelFacturaNum}>{deuda.concepto}</span>
        </div>
      </div>
      <div className={styles.panelFacturaTop}>
        <span className={`${styles.estadoBadge} ${esPendiente ? styles.estadoPendiente : deuda.estado === 'ABONO_PARCIAL' ? styles.estadoParcial : ''}`}>
          {ESTADO_DEUDA_LABEL[deuda.estado]}
        </span>
        <span className={styles.panelFacturaSaldo}>{fmtDec(saldo)}</span>
      </div>

      <div className={styles.panelFacturaMid}>
        <div className={styles.progRow}>
          <div className={styles.progBar}>
            <div className={styles.progFill} style={{ width: `${pct}%` }} />
          </div>
          <span className={styles.progPct}>{pct}%</span>
        </div>
        <span className={styles.panelFacturaFecha} title={fmtFecha(deuda.createdAt)}>
          {diasRelativo(deuda.createdAt)} · {fmtFecha(deuda.createdAt)}
        </span>
      </div>

      <div className={styles.panelFacturaActions}>
        <button type="button" className={styles.btnHist} onClick={onHistorial}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="12" height="12">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Historial
        </button>
        {!cerrada && (
          <button type="button" className={styles.btnCobrarSm} onClick={onCobrar}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="12" height="12">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
            Abonar
          </button>
        )}
      </div>
    </div>
  );
}

// ── Panel de detalle del inquilino (derecha) ───────────────
function InquilinoDetailPanel({
  grupo,
  onCobrar,
  onHistorial,
  onClose,
}: {
  grupo: InquilinoGrupo;
  onCobrar: (d: DeudaAlquiler) => void;
  onHistorial: (id: string) => void;
  onClose: () => void;
}) {
  const deudasAbiertas = grupo.deudas.filter(d => Number(d.saldo) > 0.01);

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHead}>
        <div className={styles.detailAvatar}>
          {grupo.nombre.charAt(0).toUpperCase()}
        </div>
        <div className={styles.detailHeadInfo}>
          <h3 className={styles.detailNombre}>{grupo.nombre}</h3>
          <span className={styles.detailTel}>Inquilino de alquiler de silla</span>
        </div>
        <button type="button" className={styles.detailClose} onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className={styles.detailSummary}>
        <div className={`${styles.detailSumItem} ${styles.detailSumItemFull}`}>
          <span className={styles.detailSumLabel}>Total que debe</span>
          <span className={`${styles.detailSumVal} ${styles.detailSumGold}`}>{fmtDec(grupo.totalSaldo)}</span>
        </div>
      </div>

      <div className={styles.detailSectionHead}>
        <span className={styles.detailSectionTitle}>
          {deudasAbiertas.length === 1 ? '1 cuota pendiente' : `${deudasAbiertas.length} cuotas pendientes`}
        </span>
      </div>
      <div className={styles.detailFacturas}>
        {deudasAbiertas.map(d => (
          <DeudaInPanel
            key={d.id}
            deuda={d}
            onCobrar={() => onCobrar(d)}
            onHistorial={() => onHistorial(d.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Fila compacta en tabla de inquilinos (izquierda) ───────
function InquilinoTableRow({
  grupo,
  selected,
  onClick,
}: {
  grupo: InquilinoGrupo;
  selected: boolean;
  onClick: () => void;
}) {
  const cuotas = grupo.deudas.filter(d => Number(d.saldo) > 0.01).length;

  return (
    <button
      type="button"
      className={`${styles.tableRow} ${selected ? styles.tableRowSelected : ''}`}
      onClick={onClick}
    >
      <span className={`${styles.moraDot} ${styles.dotAmarillo}`} />

      <div className={styles.tableInfo}>
        <div className={styles.tableAvatar}>
          {grupo.nombre.charAt(0).toUpperCase()}
        </div>
        <div className={styles.tableNameBlock}>
          <span className={styles.tableNombre}>{grupo.nombre}</span>
          <span className={styles.tableMeta}>
            {cuotas} cuota{cuotas === 1 ? '' : 's'} pendiente{cuotas === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className={styles.tableSaldoCol}>
        <span className={styles.tableSaldo}>{fmtDec(grupo.totalSaldo)}</span>
      </div>

      <svg
        className={`${styles.tableChevron} ${selected ? styles.tableChevronSel : ''}`}
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
        width="14" height="14"
      >
        <path d="M9 6l6 6-6 6"/>
      </svg>
    </button>
  );
}

// ── Page principal ─────────────────────────────────────────
export function CuentasPorCobrarPage() {
  const authUser = useAuthStore(s => s.user);
  const puedeVerInquilinos = OWNER_ADMIN.has(authUser?.rol ?? '');

  const [mainTab, setMainTab]           = useState<MainTab>('clientes');
  const [search, setSearch]             = useState('');
  const [filtroTab, setFiltroTab]       = useState<FiltroTab>('todos');
  const [selectedCliente, setSelectedCliente] = useState<string | null>(null);
  const [cobroTarget, setCobroTarget]   = useState<VentaResumen | null>(null);
  const [historialId, setHistorialId]   = useState<string | null>(null);
  const [toast, setToast]               = useState<string | null>(null);
  const [ultimoCobro, setUltimoCobro]   = useState<UltimoCobro | null>(null);

  // Alquiler de silla: si por cualquier motivo mainTab quedara en
  // 'inquilinos' para un rol que no debe verla (ej. cambio de sesión sin
  // recargar), se fuerza de vuelta — la pestaña nunca se renderiza para
  // ALQUILER, pero esto es defensa adicional en el propio estado.
  useEffect(() => {
    if (mainTab === 'inquilinos' && !puedeVerInquilinos) setMainTab('clientes');
  }, [mainTab, puedeVerInquilinos]);

  const [selectedInquilino, setSelectedInquilino] = useState<string | null>(null);
  const [abonoTarget, setAbonoTarget]   = useState<DeudaAlquiler | null>(null);
  const [histAlqId, setHistAlqId]       = useState<string | null>(null);

  const { data: deudasAlquiler = [], isLoading: loadAlq } = useQuery<DeudaAlquiler[]>({
    queryKey: ['alquiler-deudas'],
    queryFn: () => api.get('/alquiler/deudas').then(r => r.data),
    enabled: mainTab === 'inquilinos' && puedeVerInquilinos,
    staleTime: 30_000,
  });

  const gruposInquilinos = useMemo<InquilinoGrupo[]>(() => {
    const map = new Map<string, DeudaAlquiler[]>();
    for (const d of deudasAlquiler) {
      if (!map.has(d.empleadoId)) map.set(d.empleadoId, []);
      map.get(d.empleadoId)!.push(d);
    }
    return Array.from(map.entries())
      .map(([empleadoId, deudas]) => ({
        empleadoId,
        nombre: deudas[0]?.empleado?.nombre ?? 'Inquilino',
        totalSaldo: deudas.reduce((s, d) => s + Number(d.saldo), 0),
        deudas: [...deudas].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      }))
      .filter(g => g.totalSaldo > 0.01)
      .sort((a, b) => b.totalSaldo - a.totalSaldo);
  }, [deudasAlquiler]);

  const gruposInquilinosFiltrados = useMemo(() =>
    search.trim()
      ? gruposInquilinos.filter(g => g.nombre.toLowerCase().includes(search.toLowerCase()))
      : gruposInquilinos,
    [gruposInquilinos, search],
  );

  useEffect(() => {
    if (selectedInquilino && !gruposInquilinos.find(g => g.empleadoId === selectedInquilino)) {
      setSelectedInquilino(null);
    }
  }, [gruposInquilinos, selectedInquilino]);

  const selectedGrupoInquilino = gruposInquilinos.find(g => g.empleadoId === selectedInquilino) ?? null;

  const totalAlquilerCxC = deudasAlquiler.reduce((s, d) => s + Number(d.saldo), 0);
  const totalInquilinosConDeuda = gruposInquilinos.length;
  const totalCuotasPendientes = deudasAlquiler.filter(d => Number(d.saldo) > 0.01).length;

  function handleAbonoSuccess(monto: number, nuevoSaldo: number) {
    setAbonoTarget(null);
    showToast(`Abono registrado: ${fmtDec(monto)}. Saldo restante: ${fmtDec(nuevoSaldo)}.`);
  }

  function toggleInquilino(empleadoId: string) {
    setSelectedInquilino(prev => prev === empleadoId ? null : empleadoId);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  const { data: pendientes = [], isLoading: loadP } = useQuery<VentaResumen[]>({
    queryKey: ['cxc', 'PENDIENTE'],
    queryFn: () => api.get('/facturas', { params: { estado: 'PENDIENTE' } }).then(r => r.data),
    staleTime: 60_000,
  });
  const { data: parciales = [], isLoading: loadA } = useQuery<VentaResumen[]>({
    queryKey: ['cxc', 'PARCIAL'],
    queryFn: () => api.get('/facturas', { params: { estado: 'PARCIAL' } }).then(r => r.data),
    staleTime: 60_000,
  });
  const { data: metodosPago = [] } = useQuery<MetodoPago[]>({
    queryKey: ['metodos-pago'],
    queryFn: () => api.get('/metodos-pago').then(r => r.data),
    staleTime: 10 * 60_000,
  });

  const isLoading   = loadP || loadA;
  const todasVentas = useMemo(() => [...pendientes, ...parciales], [pendientes, parciales]);

  const ventasTab = useMemo(() => {
    switch (filtroTab) {
      case 'pendientes': return pendientes;
      case 'parciales':  return parciales;
      case 'vencidas':   return todasVentas.filter(v => diasMora(v.fecha) > MORA_DIAS);
      default:           return todasVentas;
    }
  }, [pendientes, parciales, todasVentas, filtroTab]);

  const grupos = useMemo<ClienteGrupo[]>(() => {
    const map = new Map<string, VentaResumen[]>();
    for (const v of ventasTab) {
      const key = v.cliente || 'Cliente anónimo';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return Array.from(map.entries())
      .map(([nombre, facturas]) => {
        const sorted       = [...facturas].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
        const totalSaldo   = facturas.reduce((s, f) => s + f.saldo, 0);
        const totalFacturado = facturas.reduce((s, f) => s + f.total, 0);
        const diasMax      = Math.max(...facturas.map(f => diasMora(f.fecha)));
        return {
          nombre,
          telefono: facturas[0]?.clienteTelefono ?? null,
          facturas: sorted,
          totalSaldo,
          totalFacturado,
          tieneVencidas: facturas.some(f => diasMora(f.fecha) > MORA_DIAS),
          diasMaxMora: diasMax,
        };
      })
      .sort((a, b) => b.diasMaxMora - a.diasMaxMora || b.totalSaldo - a.totalSaldo);
  }, [ventasTab]);

  const gruposFiltrados = useMemo(() =>
    search.trim()
      ? grupos.filter(g => g.nombre.toLowerCase().includes(search.toLowerCase()))
      : grupos,
    [grupos, search],
  );

  // Limpiar selección si el cliente ya no tiene deudas
  useEffect(() => {
    if (selectedCliente && !grupos.find(g => g.nombre === selectedCliente)) {
      setSelectedCliente(null);
    }
  }, [grupos, selectedCliente]);

  const selectedGrupo = grupos.find(g => g.nombre === selectedCliente) ?? null;

  // KPIs de resumen (todas las deudas, no sólo el tab activo)
  const totalCxC      = todasVentas.reduce((s, v) => s + v.saldo, 0);
  const totalClientes = useMemo(() => new Set(todasVentas.map(v => v.cliente || 'anon')).size, [todasVentas]);
  const totalFacturas = todasVentas.length;
  const totalVencidas = todasVentas.filter(v => diasMora(v.fecha) > MORA_DIAS).length;

  // Para enlazar historial → cobro
  const historialVenta = todasVentas.find(v => v.id === historialId) ?? null;

  function handleCobroSuccess(monto: number, nuevoSaldo: number, pagoId: string | null) {
    if (cobroTarget) {
      setUltimoCobro({
        ventaId: cobroTarget.id,
        pagoId,
        clienteNombre: cobroTarget.cliente,
        clienteTel: cobroTarget.clienteTelefono,
        monto,
        factura: cobroTarget.factura,
      });
    }
    setCobroTarget(null);
    showToast(`Cobro registrado: ${fmtDec(monto)}. Saldo restante: ${fmtDec(nuevoSaldo)}.`);
  }

  function toggleCliente(nombre: string) {
    setSelectedCliente(prev => prev === nombre ? null : nombre);
  }

  return (
    <div className={styles.page}>

      {/* Toast */}
      {toast && (
        <div className={styles.toast}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          {toast}
        </div>
      )}

      {/* Cobro exitoso: botones de recibo + WhatsApp */}
      {ultimoCobro && (
        <div className={styles.cobroOkBanner}>
          <span>✓ Cobro de {fmtDec(ultimoCobro.monto)} registrado — {ultimoCobro.factura}</span>
          <div className={styles.cobroOkActions}>
            {ultimoCobro.pagoId && (
              <button
                type="button"
                className={styles.cobroOkBtn}
                onClick={() => downloadPdf(
                  `/facturas/${ultimoCobro.ventaId}/recibo-abono/${ultimoCobro.pagoId}`,
                  `recibo-pago-${ultimoCobro.factura}.pdf`,
                )}
              >
                ↓ Recibo de pago
              </button>
            )}
            {ultimoCobro.clienteTel && (
              <a
                className={styles.cobroOkBtn}
                href={`https://wa.me/${ultimoCobro.clienteTel.replace(/\D/g, '')}?text=${encodeURIComponent(
                  `Hola ${ultimoCobro.clienteNombre}, hemos registrado tu pago de RD$ ${ultimoCobro.monto.toLocaleString('es-DO', { minimumFractionDigits: 2 })} para la factura ${ultimoCobro.factura}. ¡Gracias!`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
            )}
            <button type="button" className={styles.cobroOkDismiss} onClick={() => setUltimoCobro(null)}>✕</button>
          </div>
        </div>
      )}

      {/* Encabezado */}
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Cuentas por Cobrar</h1>
          <p className={styles.pageSub}>Gestiona los saldos pendientes y registra cobros.</p>
        </div>
      </div>

      {/* Pestañas: Clientes | Inquilinos (alquiler de silla, OWNER/ADMIN) */}
      {puedeVerInquilinos && (
        <div className={styles.mainTabs}>
          <button
            type="button"
            className={`${styles.mainTab} ${mainTab === 'clientes' ? styles.mainTabActive : ''}`}
            onClick={() => setMainTab('clientes')}
          >
            Clientes
          </button>
          <button
            type="button"
            className={`${styles.mainTab} ${mainTab === 'inquilinos' ? styles.mainTabActive : ''}`}
            onClick={() => setMainTab('inquilinos')}
          >
            Inquilinos
          </button>
        </div>
      )}

      {mainTab === 'clientes' && (
      <>
      {/* Cards resumen */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconGold}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="17" height="17">
              <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
            </svg>
          </div>
          <div className={styles.summaryBody}>
            <div className={styles.summaryVal}>{fmt(totalCxC)}</div>
            <div className={styles.summaryLabel}>Total por cobrar</div>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconBlue}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="17" height="17">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <div className={styles.summaryBody}>
            <div className={styles.summaryVal}>{totalClientes}</div>
            <div className={styles.summaryLabel}>Clientes con deuda</div>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconDefault}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="17" height="17">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
          </div>
          <div className={styles.summaryBody}>
            <div className={styles.summaryVal}>{totalFacturas}</div>
            <div className={styles.summaryLabel}>Facturas pendientes</div>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${totalVencidas > 0 ? styles.iconRed : styles.iconDefault}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="17" height="17">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
            </svg>
          </div>
          <div className={styles.summaryBody}>
            <div className={`${styles.summaryVal} ${totalVencidas > 0 ? styles.summaryValRed : ''}`}>{totalVencidas}</div>
            <div className={styles.summaryLabel}>Vencidas (+{MORA_DIAS}d)</div>
          </div>
        </div>
      </div>

      {/* Buscador + filtros */}
      <div className={styles.searchAndFilters}>
        <div className={styles.searchBar}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="15" height="15">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text" placeholder="Buscar cliente…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>

        <div className={styles.filtrosBar}>
          {(['todos', 'pendientes', 'parciales', 'vencidas'] as FiltroTab[]).map(tab => (
            <button
              key={tab}
              type="button"
              className={`${styles.filtroChip} ${filtroTab === tab ? styles.filtroChipActive : ''}`}
              onClick={() => setFiltroTab(tab)}
            >
              {tab === 'todos' ? 'Todos' : tab === 'pendientes' ? 'Pendientes' : tab === 'parciales' ? 'Parciales' : 'Vencidos'}
              {tab !== 'todos' && (
                <span className={styles.filtroCount}>
                  {tab === 'pendientes' ? pendientes.length
                    : tab === 'parciales' ? parciales.length
                    : totalVencidas}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Split layout: lista izquierda + panel derecho */}
      <div className={styles.splitLayout}>
        {/* ── Columna izquierda: lista compacta ── */}
        <div className={styles.leftPanel}>
          {isLoading && (
            <div className={styles.loadWrap}>
              <span className={styles.spinner} />
              <span>Cargando…</span>
            </div>
          )}

          {!isLoading && gruposFiltrados.length === 0 && (
            <div className={styles.emptyState}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" width="40" height="40">
                <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
              </svg>
              <p>
                {search
                  ? 'No hay clientes que coincidan.'
                  : filtroTab !== 'todos'
                  ? 'No hay facturas en este filtro.'
                  : 'No hay cuentas por cobrar pendientes.'}
              </p>
            </div>
          )}

          {gruposFiltrados.map(grupo => (
            <ClienteTableRow
              key={grupo.nombre}
              grupo={grupo}
              selected={selectedCliente === grupo.nombre}
              onClick={() => toggleCliente(grupo.nombre)}
            />
          ))}
        </div>

        {/* ── Panel derecho: detalle cliente ── */}
        {selectedGrupo && (
          <div className={styles.rightPanel}>
            <ClienteDetailPanel
              grupo={selectedGrupo}
              onCobrar={v => setCobroTarget(v)}
              onHistorial={id => setHistorialId(id)}
              onClose={() => setSelectedCliente(null)}
            />
          </div>
        )}
      </div>

      {/* Mobile: overlay detrás del drawer */}
      {selectedGrupo && (
        <div className={styles.mobileDrawerOverlay} onClick={() => setSelectedCliente(null)} />
      )}

      {/* Modal cobro */}
      {cobroTarget && metodosPago.length > 0 && (
        <CobroModal
          venta={cobroTarget}
          metodosPago={metodosPago}
          onClose={() => setCobroTarget(null)}
          onSuccess={handleCobroSuccess}
        />
      )}

      {/* Modal historial */}
      {historialId && (
        <HistorialModal
          ventaId={historialId}
          onClose={() => setHistorialId(null)}
          onRegistrarPago={historialVenta ? () => {
            setHistorialId(null);
            if (historialVenta) setCobroTarget(historialVenta);
          } : undefined}
        />
      )}
      </>
      )}

      {mainTab === 'inquilinos' && puedeVerInquilinos && (
      <>
      {/* Cards resumen — inquilinos */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconGold}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="17" height="17">
              <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
            </svg>
          </div>
          <div className={styles.summaryBody}>
            <div className={styles.summaryVal}>{fmt(totalAlquilerCxC)}</div>
            <div className={styles.summaryLabel}>Total por cobrar</div>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconBlue}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="17" height="17">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <div className={styles.summaryBody}>
            <div className={styles.summaryVal}>{totalInquilinosConDeuda}</div>
            <div className={styles.summaryLabel}>Inquilinos con deuda</div>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.iconDefault}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="17" height="17">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
          </div>
          <div className={styles.summaryBody}>
            <div className={styles.summaryVal}>{totalCuotasPendientes}</div>
            <div className={styles.summaryLabel}>Cuotas pendientes</div>
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div className={styles.searchAndFilters}>
        <div className={styles.searchBar}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="15" height="15">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text" placeholder="Buscar inquilino…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Split layout: lista izquierda + panel derecho */}
      <div className={styles.splitLayout}>
        <div className={styles.leftPanel}>
          {loadAlq && (
            <div className={styles.loadWrap}>
              <span className={styles.spinner} />
              <span>Cargando…</span>
            </div>
          )}

          {!loadAlq && gruposInquilinosFiltrados.length === 0 && (
            <div className={styles.emptyState}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" width="40" height="40">
                <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
              </svg>
              <p>
                {search
                  ? 'No hay inquilinos que coincidan.'
                  : 'Ningún inquilino tiene cuotas pendientes.'}
              </p>
            </div>
          )}

          {gruposInquilinosFiltrados.map(grupo => (
            <InquilinoTableRow
              key={grupo.empleadoId}
              grupo={grupo}
              selected={selectedInquilino === grupo.empleadoId}
              onClick={() => toggleInquilino(grupo.empleadoId)}
            />
          ))}
        </div>

        {selectedGrupoInquilino && (
          <div className={styles.rightPanel}>
            <InquilinoDetailPanel
              grupo={selectedGrupoInquilino}
              onCobrar={d => setAbonoTarget(d)}
              onHistorial={id => setHistAlqId(id)}
              onClose={() => setSelectedInquilino(null)}
            />
          </div>
        )}
      </div>

      {selectedGrupoInquilino && (
        <div className={styles.mobileDrawerOverlay} onClick={() => setSelectedInquilino(null)} />
      )}

      {abonoTarget && (
        <AbonoAlquilerModal
          deuda={abonoTarget}
          inquilinoNombre={selectedGrupoInquilino?.nombre ?? ''}
          metodosPago={metodosPago}
          onClose={() => setAbonoTarget(null)}
          onSuccess={handleAbonoSuccess}
        />
      )}

      {histAlqId && (
        <HistorialAlquilerModal
          deudaId={histAlqId}
          inquilinoNombre={selectedGrupoInquilino?.nombre ?? ''}
          onClose={() => setHistAlqId(null)}
          onRegistrarAbono={() => {
            const deuda = selectedGrupoInquilino?.deudas.find(d => d.id === histAlqId);
            setHistAlqId(null);
            if (deuda) setAbonoTarget(deuda);
          }}
        />
      )}
      </>
      )}
    </div>
  );
}
