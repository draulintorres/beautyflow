import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { api, downloadPdf, sharePdf } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useAuthStore } from '../../store/auth';
import { CajaEstadoBar, useCajaEstado } from './CajaWidgets';
import styles from './PosMobile.module.css';

interface Servicio { id: string; nombre: string; precio: string; categoria?: { nombre: string }; }
interface Producto { id: string; nombre: string; precio: string; existencia: number; permiteVentaSinStock: boolean; categoriaRef?: { nombre: string }; }
interface Cliente {
  id: string; nombre: string;
  permiteFiao?: boolean; limiteCredito?: number; balancePendiente?: number;
  etiquetas?: string[];
}
interface Empleado { id: string; nombre: string; activo: boolean; participaAgenda: boolean; }
interface MetodoPago { id: string; nombre: string; esEfectivo: boolean; activo: boolean; orden: number; }

interface Linea {
  key: string; tipo: 'SERVICIO' | 'PRODUCTO'; refId: string; nombre: string;
  precio: number; cantidad: number; empleadoId?: string;
}
interface Pago { metodoPagoId: string; monto: number; referencia?: string; }

const num = (s: string) => Number(s) || 0;

export function PosMobile() {
  const location = useLocation();
  const [tab, setTab] = useState<'SERVICIO' | 'PRODUCTO'>('SERVICIO');
  const [busca, setBusca] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [descuentoGlobal, setDescuentoGlobal] = useState(0);
  const [clienteId, setClienteId] = useState<string>('');
  const [carritoOpen, setCarritoOpen] = useState(false);

  // Candado "una venta por cita" (Parte B) — ver mismo comentario en PosPage.
  const [citaIdActual, setCitaIdActual] = useState<string | null>(null);

  // Precarga desde "Cobrar" en la Agenda (mismo estado de navegación que
  // lee PosPage en escritorio — PosMobile tiene su propio carrito
  // independiente, así que necesita leerlo también).
  useEffect(() => {
    const state = location.state as {
      citaId?: string;
      clienteId?: string | null;
      citaLineas?: { servicioId: string; nombre: string; precio: number; empleadoId?: string }[];
    } | null;
    if (!state?.citaLineas?.length) return;
    setCitaIdActual(state.citaId ?? null);
    setClienteId(state.clienteId ?? '');
    setLineas(state.citaLineas.map((l, i) => ({
      key: `${l.servicioId}-cita-${i}-${Date.now()}`,
      tipo: 'SERVICIO',
      refId: l.servicioId,
      nombre: l.nombre,
      precio: Number(l.precio),
      cantidad: 1,
      empleadoId: l.empleadoId,
    })));
    setCarritoOpen(true);
    window.history.replaceState({}, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pagoOpen, setPagoOpen] = useState(false);
  const [accion, setAccion] = useState<null | 'descuento' | 'cliente'>(null);
  const [cliBusca, setCliBusca] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [ultimaVenta, setUltimaVenta] = useState<{ id: string; factura: string } | null>(null);
  const [warnSinEmp, setWarnSinEmp] = useState(false);
  const [historialOpen, setHistorialOpen] = useState(false);

  const { data: servicios = [] } = useQuery<Servicio[]>({ queryKey: ['pos-servicios'], queryFn: () => api.get('/servicios').then(r => r.data) });
  const { data: productos = [] } = useQuery<Producto[]>({ queryKey: ['pos-productos'], queryFn: () => api.get('/productos').then(r => r.data) });
  const { data: clientes = [] } = useQuery<Cliente[]>({ queryKey: ['pos-clientes'], queryFn: () => api.get('/clientes').then(r => r.data), staleTime: 0 });
  const { data: empleados = [] } = useQuery<Empleado[]>({ queryKey: ['pos-empleados'], queryFn: () => api.get('/empleados').then(r => r.data) });
  const { data: metodos = [] } = useQuery<MetodoPago[]>({ queryKey: ['pos-metodos'], queryFn: () => api.get('/metodos-pago').then(r => r.data) });
  const { data: cajaEstado } = useCajaEstado();
  const qc = useQueryClient();

  const empleadosServicio = empleados
    .filter(e => e.activo && e.participaAgenda)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const clienteSel = clientes.find(c => c.id === clienteId);
  const clientesFiltrados = clientes
    .filter(c => c.nombre.toLowerCase().includes(cliBusca.toLowerCase()))
    .slice(0, 30);

  const creditoDisponible = clienteSel
    ? Math.max(0, (clienteSel.limiteCredito ?? 0) - (clienteSel.balancePendiente ?? 0))
    : 0;

  const serviciosFiltrados = servicios.filter(s => s.nombre.toLowerCase().includes(busca.toLowerCase()));
  const productosFiltrados = productos.filter(p => p.nombre.toLowerCase().includes(busca.toLowerCase()));

  function addServicio(s: Servicio) {
    setLineas(ls => [...ls, { key: `${s.id}-${Date.now()}`, tipo: 'SERVICIO', refId: s.id, nombre: s.nombre, precio: num(s.precio), cantidad: 1 }]);
  }
  function addProducto(p: Producto) {
    if (!p.permiteVentaSinStock && p.existencia === 0) return;
    setLineas(ls => [...ls, { key: `${p.id}-${Date.now()}`, tipo: 'PRODUCTO', refId: p.id, nombre: p.nombre, precio: num(p.precio), cantidad: 1 }]);
  }
  function setCant(key: string, delta: number) {
    setLineas(ls => ls.map(l => l.key === key ? { ...l, cantidad: Math.max(1, l.cantidad + delta) } : l));
  }
  function quitar(key: string) { setLineas(ls => ls.filter(l => l.key !== key)); }
  function setEmpleadoLinea(key: string, empId: string) {
    setLineas(ls => ls.map(l => l.key === key ? { ...l, empleadoId: empId } : l));
  }
  function limpiarTodo() {
    setLineas([]); setDescuentoGlobal(0); setClienteId('');
    setCarritoOpen(false); setAccion(null); setCitaIdActual(null);
  }

  // % real de la empresa (0 si no es contribuyente DGII) — nunca hardcoded,
  // debe coincidir con lo que ventas.service.ts calculará al confirmar.
  const itbisPct = useAuthStore(s => s.empresa?.itbisPct ?? 0) / 100;

  const subtotal = useMemo(() => lineas.reduce((s, l) => s + l.precio * l.cantidad, 0), [lineas]);
  const baseConDesc = Math.max(0, subtotal - descuentoGlobal);
  const itbisEstimado = Math.round(baseConDesc * itbisPct * 100) / 100;
  const totalEstimado = baseConDesc + itbisEstimado;
  const cantArticulos = lineas.reduce((s, l) => s + l.cantidad, 0);

  const crearVenta = useMutation({
    mutationFn: (payload: { pagos: Pago[]; permitirFiao: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        lineas: lineas.map(l => ({
          tipo: l.tipo,
          ...(l.tipo === 'SERVICIO' ? { servicioId: l.refId } : { productoId: l.refId }),
          ...(l.empleadoId ? { empleadoId: l.empleadoId } : {}),
          cantidad: l.cantidad,
        })),
        ...(clienteId ? { clienteId } : {}),
        ...(citaIdActual ? { citaId: citaIdActual } : {}),
        ...(descuentoGlobal > 0 ? { descuentoGlobal } : {}),
        ...(payload.pagos.length ? { pagos: payload.pagos } : {}),
        ...(payload.permitirFiao ? { permitirFiao: true } : {}),
        aperturaCajaId: cajaEstado?.cajaAbierta?.aperturaId,
      };
      return api.post('/facturas', body).then(r => r.data);
    },
    onSuccess: (res) => {
      const msg = `Venta ${res.factura} registrada${res.saldo > 0 ? ` · saldo a crédito RD$ ${formatMoney(res.saldo)}` : ''}`;
      setToast(msg);
      setUltimaVenta({ id: res.id, factura: res.factura });
      limpiarTodo(); setPagoOpen(false);
      qc.invalidateQueries({ queryKey: ['caja-resumen'] });
      qc.invalidateQueries({ queryKey: ['citas'] });
      qc.invalidateQueries({ queryKey: ['facturas-hist'] });
      setTimeout(() => setToast(null), 4500);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string | string[] } } };
      const msg = err?.response?.data?.message;
      setToast(Array.isArray(msg) ? msg[0] : (msg ?? 'No se pudo registrar la venta.'));
      setTimeout(() => setToast(null), 4500);
    },
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h1>Caja / POS</h1>
          <p>Punto de venta</p>
        </div>
        <button className={styles.historialBtn} onClick={() => setHistorialOpen(true)}>
          Historial
        </button>
      </div>
      <div className={styles.cajaBarWrap}><CajaEstadoBar /></div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={tab === 'SERVICIO' ? styles.tabOn : styles.tab} onClick={() => setTab('SERVICIO')}>
          Servicios
        </button>
        <button className={tab === 'PRODUCTO' ? styles.tabOn : styles.tab} onClick={() => setTab('PRODUCTO')}>
          Productos
        </button>
      </div>

      {/* Buscador */}
      <div className={styles.search}>
        <input placeholder="Buscar servicio o producto…" value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      {/* Catálogo */}
      <div className={styles.catalogo}>
        {tab === 'SERVICIO'
          ? serviciosFiltrados.map(s => (
            <div key={s.id} className={styles.item}>
              <div className={styles.itemInfo}>
                <div className={styles.itemNom}>{s.nombre}</div>
                <div className={styles.itemCat}>{s.categoria?.nombre ?? 'Servicio'}</div>
              </div>
              <div className={styles.itemPrecio}>RD$ {formatMoney(num(s.precio))}</div>
              <button className={styles.addBtn} onClick={() => addServicio(s)}>+</button>
            </div>
          ))
          : productosFiltrados.map(p => {
            const vendible = p.permiteVentaSinStock || p.existencia > 0;
            return (
              <div key={p.id} className={`${styles.item} ${!vendible ? styles.itemOff : ''}`}>
                <div className={styles.itemInfo}>
                  <div className={styles.itemNom}>{p.nombre}</div>
                  <div className={styles.itemCat}>
                    {p.categoriaRef?.nombre ?? 'Producto'}{!vendible && ' · Sin stock'}
                  </div>
                </div>
                <div className={styles.itemPrecio}>RD$ {formatMoney(num(p.precio))}</div>
                <button className={styles.addBtn} disabled={!vendible} onClick={() => addProducto(p)}>+</button>
              </div>
            );
          })
        }
      </div>

      {/* Barra inferior del carrito */}
      {lineas.length > 0 && (
        <button className={styles.cartBar} onClick={() => setCarritoOpen(true)}>
          <span className={styles.cartCount}>{cantArticulos} art.</span>
          <span className={styles.cartTotal}>RD$ {formatMoney(totalEstimado)}</span>
          <span className={styles.cartCta}>Ver factura →</span>
        </button>
      )}

      {/* Sheet carrito */}
      {carritoOpen && (
        <div className={styles.overlay} onClick={() => setCarritoOpen(false)}>
          <div className={styles.sheet} onClick={e => e.stopPropagation()}>
            <div className={styles.handle} />
            <h3>
              Factura actual
              {clienteSel && <span className={styles.clienteChip}>{clienteSel.nombre.split(' ')[0]}</span>}
            </h3>

            {/* Líneas */}
            <div className={styles.lineas}>
              {lineas.map((l, idx) => (
                <div key={l.key} className={styles.linea}>
                  <div className={styles.lineaTop}>
                    <span className={styles.lineaNum}>{idx + 1}</span>
                    <span className={styles.lineaNom}>{l.nombre}</span>
                    <button className={styles.lineaDel} onClick={() => quitar(l.key)}>✕</button>
                  </div>
                  <div className={styles.lineaBot}>
                    <div className={styles.qty}>
                      <button onClick={() => setCant(l.key, -1)}>−</button>
                      <span>{l.cantidad}</span>
                      <button onClick={() => setCant(l.key, +1)}>+</button>
                    </div>
                    <span className={styles.lineaPrecio}>RD$ {formatMoney((l.precio * l.cantidad))}</span>
                  </div>
                  {l.tipo === 'SERVICIO' && empleadosServicio.length > 0 && (
                    <select
                      className={`${styles.empSel}${!l.empleadoId ? ` ${styles.empSelWarn}` : ''}`}
                      value={l.empleadoId ?? ''}
                      onChange={e => setEmpleadoLinea(l.key, e.target.value)}
                    >
                      <option value="">— ¿Quién lo hizo? —</option>
                      {empleadosServicio.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>

            {/* Totales */}
            <div className={styles.totales}>
              <div className={styles.totRow}><span>Subtotal</span><b>RD$ {formatMoney(subtotal)}</b></div>
              {descuentoGlobal > 0 && (
                <div className={styles.totRow}><span>Descuento</span><b className={styles.descVal}>− RD$ {formatMoney(descuentoGlobal)}</b></div>
              )}
              {itbisPct > 0 && (
                <div className={styles.totRow}><span>ITBIS (estimado {Math.round(itbisPct * 100)}%)</span><b>RD$ {formatMoney(itbisEstimado)}</b></div>
              )}
              <div className={styles.totRowBig}><span>Total</span><b>RD$ {formatMoney(totalEstimado)}</b></div>
            </div>

            {/* Barra de acciones */}
            <div className={styles.accionesBar}>
              <button className={styles.accionBtn} onClick={() => setAccion('descuento')}>
                <svg viewBox="0 0 24 24"><path d="M9 9h.01M15 15h.01M16 8L8 16M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                {descuentoGlobal > 0 ? `Desc. RD$ ${formatMoney(descuentoGlobal)}` : 'Descuento'}
              </button>
              <button className={styles.accionBtn} onClick={() => setAccion('cliente')}>
                <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>
                {clienteSel ? clienteSel.nombre.split(' ')[0] : 'Cliente'}
              </button>
              <button className={styles.accionBtnDanger} onClick={limpiarTodo}>
                <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
                Limpiar
              </button>
            </div>

            <button
              className={styles.cobrarBtn}
              onClick={() => {
                const hay = lineas.some(l => l.tipo === 'SERVICIO' && !l.empleadoId);
                if (hay) { setWarnSinEmp(true); return; }
                setCarritoOpen(false); setPagoOpen(true);
              }}
            >
              Ir a cobrar
            </button>
          </div>
        </div>
      )}

      {/* Mini-sheet descuento */}
      {accion === 'descuento' && (
        <div className={styles.overlay} onClick={() => setAccion(null)}>
          <div className={styles.sheetSm} onClick={e => e.stopPropagation()}>
            <div className={styles.handle} />
            <h3>Descuento a la venta</h3>
            <label className={styles.montoLbl}>
              Monto del descuento (RD$)
              <input
                type="number" min={0}
                value={descuentoGlobal || ''}
                onChange={e => setDescuentoGlobal(Math.max(0, Number(e.target.value)))}
              />
            </label>
            <button className={styles.cobrarBtn} onClick={() => setAccion(null)}>Aplicar</button>
          </div>
        </div>
      )}

      {/* Mini-sheet cliente */}
      {accion === 'cliente' && (
        <div className={styles.overlay} onClick={() => setAccion(null)}>
          <div className={styles.sheetSm} onClick={e => e.stopPropagation()}>
            <div className={styles.handle} />
            <h3>Seleccionar cliente</h3>
            <input
              className={styles.cliBusca}
              placeholder="Buscar cliente…"
              value={cliBusca}
              onChange={e => setCliBusca(e.target.value)}
            />
            <div className={styles.cliList}>
              <button
                className={styles.cliItem}
                onClick={() => { setClienteId(''); setAccion(null); }}
              >
                <span className={styles.cliNom}>Cliente ocasional</span>
              </button>
              {clientesFiltrados.map(c => {
                const disp = Math.max(0, (c.limiteCredito ?? 0) - (c.balancePendiente ?? 0));
                return (
                  <button
                    key={c.id}
                    className={`${styles.cliItem} ${clienteId === c.id ? styles.cliItemSel : ''}`}
                    onClick={() => { setClienteId(c.id); setAccion(null); }}
                  >
                    <span className={styles.cliNom}>
                      {c.nombre}
                      {c.etiquetas?.includes('MOROSO') && <span className={styles.moroso}>Moroso</span>}
                    </span>
                    {c.permiteFiao && disp > 0 && (
                      <span className={styles.cliCredito}>Crédito disp: RD$ {formatMoney(disp)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sheet pago */}
      {pagoOpen && (
        <PagoSheet
          total={totalEstimado}
          metodos={metodos}
          clientePermiteFiao={!!clienteSel?.permiteFiao}
          creditoDisponible={creditoDisponible}
          onClose={() => setPagoOpen(false)}
          onConfirm={(pagos, permitirFiao) => crearVenta.mutate({ pagos, permitirFiao })}
          loading={crearVenta.isPending}
        />
      )}

      {warnSinEmp && (
        <div className={styles.overlay}>
          <div className={styles.sheetSm} onClick={e => e.stopPropagation()}>
            <div className={styles.handle} />
            <div className={styles.warnHead}>
              <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Servicios sin empleado
            </div>
            <p className={styles.warnBody}>
              Hay servicios sin empleado asignado — no se calculará comisión para ellos.
            </p>
            <div className={styles.warnFoot}>
              <button className={styles.warnBack} onClick={() => setWarnSinEmp(false)}>← Volver a asignar</button>
              <button className={styles.cobrarBtn} style={{ flex: 1 }} onClick={() => { setWarnSinEmp(false); setCarritoOpen(false); setPagoOpen(true); }}>
                Continuar sin comisión
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}

      {ultimaVenta && (
        <div className={styles.reciboBanner}>
          <span>✓ Venta {ultimaVenta.factura}</span>
          <div className={styles.reciboBannerActions}>
            <button onClick={() => downloadPdf(`/facturas/${ultimaVenta.id}/recibo`, `recibo-${ultimaVenta.factura}.pdf`)}>
              ↓ Recibo
            </button>
            <button onClick={() => sharePdf(`/facturas/${ultimaVenta.id}/recibo`, `recibo-${ultimaVenta.factura}.pdf`, `Recibo ${ultimaVenta.factura}`)}>
              ⤴ Compartir
            </button>
            <button className={styles.reciboBannerClose} onClick={() => setUltimaVenta(null)}>✕</button>
          </div>
        </div>
      )}

      {historialOpen && <HistorialSheet onClose={() => setHistorialOpen(false)} />}
    </div>
  );
}

/* ── Historial de ventas (Parte A: recibo/compartir/anular) ── */
interface VentaHist {
  id: string; factura: string; cliente: string; total: number; saldo: number;
  estado: string; motivoAnulacion: string | null; fecha: string;
}
function HistorialSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const authUser = useAuthStore(s => s.user);
  const puedeAnular = authUser?.rol === 'OWNER' || authUser?.rol === 'ADMIN';
  const requierePinAnular = useAuthStore(s => !!s.empresa?.pinAnulacionActivo);
  const [anulando, setAnulando] = useState<{ id: string; factura: string } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const { data: ventas = [], isLoading } = useQuery<VentaHist[]>({
    queryKey: ['facturas-hist'],
    queryFn: () => api.get('/facturas').then(r => r.data),
  });

  const anular = useMutation({
    mutationFn: () => api.patch(`/facturas/${anulando!.id}/anular`, {
      motivo: motivo.trim(),
      ...(requierePinAnular && { pin: pin.trim() }),
    }),
    onSuccess: () => {
      setAnulando(null); setMotivo(''); setPin(''); setErr(null);
      qc.invalidateQueries({ queryKey: ['facturas-hist'] });
      qc.invalidateQueries({ queryKey: ['caja-resumen'] });
      qc.invalidateQueries({ queryKey: ['citas'] });
      qc.invalidateQueries({ queryKey: ['inv-productos'] });
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setErr(Array.isArray(msg) ? msg[0] : (msg ?? 'No se pudo anular la venta.'));
    },
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.handle} />
        <h3>Historial de ventas</h3>

        {isLoading ? (
          <div className={styles.loadWrap}><span className={styles.spinner} /></div>
        ) : ventas.length === 0 ? (
          <p className={styles.tabEmpty}>Sin ventas registradas</p>
        ) : (
          <div className={styles.histList}>
            {ventas.slice(0, 20).map(v => {
              const anulada = v.estado === 'ANULADA';
              return (
                <div key={v.id} className={`${styles.histRow} ${anulada ? styles.histRowAnulada : ''}`}>
                  <div className={styles.histInfo}>
                    <span className={styles.histFactura}>{v.factura}</span>
                    <span className={styles.histCli}>{v.cliente}</span>
                  </div>
                  <div className={styles.histRight}>
                    <span className={styles.histTotal}>
                      RD$ {formatMoney(v.total)}
                      {anulada && <b className={styles.histBadge} title={v.motivoAnulacion ?? undefined}>Anulada</b>}
                    </span>
                    <div className={styles.histActs}>
                      <button title="Recibo" onClick={() => downloadPdf(`/facturas/${v.id}/recibo`, `recibo-${v.factura}.pdf`)}>
                        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                      </button>
                      <button title="Compartir" onClick={() => sharePdf(`/facturas/${v.id}/recibo`, `recibo-${v.factura}.pdf`, `Recibo ${v.factura}`)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13"/></svg>
                      </button>
                      {puedeAnular && !anulada && (
                        <button title="Anular" className={styles.histAnularBtn} onClick={() => { setAnulando({ id: v.id, factura: v.factura }); setMotivo(''); setPin(''); setErr(null); }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {anulando && (
        <div className={styles.overlay} onClick={() => setAnulando(null)}>
          <div className={styles.sheetSm} onClick={e => e.stopPropagation()}>
            <div className={styles.handle} />
            <h3>Anular venta {anulando.factura}</h3>
            <p className={styles.tabEmpty} style={{ padding: '0 0 10px' }}>
              Revierte stock, saldo a crédito y comisiones no liquidadas. No se puede deshacer.
            </p>
            <label className={styles.montoLbl}>
              Motivo *
              <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: cobro duplicado…" autoFocus />
            </label>
            {requierePinAnular && (
              <label className={styles.montoLbl}>
                PIN de anulación *
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="PIN de la empresa"
                  maxLength={8}
                />
              </label>
            )}
            {err && <div className={styles.err}>{err}</div>}
            <button
              className={styles.cobrarBtn}
              disabled={!motivo.trim() || (requierePinAnular && !pin.trim()) || anular.isPending}
              onClick={() => anular.mutate()}
            >
              {anular.isPending ? 'Anulando…' : 'Anular venta'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sheet de pago (mixto + fiao con crédito real) ── */
function PagoSheet({ total, metodos, clientePermiteFiao, creditoDisponible, onClose, onConfirm, loading }: {
  total: number;
  metodos: MetodoPago[];
  clientePermiteFiao: boolean;
  creditoDisponible: number;
  onClose: () => void;
  onConfirm: (pagos: Pago[], permitirFiao: boolean) => void;
  loading: boolean;
}) {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [metodoSel, setMetodoSel] = useState<string>(metodos[0]?.id ?? '');
  const [monto, setMonto] = useState<number>(total);
  const [recibido, setRecibido] = useState<number>(0);
  const [fiao, setFiao] = useState(false);

  const metodo = metodos.find(m => m.id === metodoSel);
  const pagado = pagos.reduce((s, p) => s + p.monto, 0);
  const restante = Math.max(0, Math.round((total - pagado) * 100) / 100);
  const cambio = metodo?.esEfectivo && recibido > monto ? recibido - monto : 0;

  function agregarPago() {
    if (!metodoSel || monto <= 0) return;
    setPagos(ps => [...ps, { metodoPagoId: metodoSel, monto: Math.min(monto, restante) }]);
    setMonto(0); setRecibido(0);
  }
  function quitarPago(i: number) { setPagos(ps => ps.filter((_, idx) => idx !== i)); }

  const puedeConfirmar = (pagado >= total) || (fiao && clientePermiteFiao && restante <= creditoDisponible);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.handle} />
        <h3>Cobrar — RD$ {formatMoney(total)}</h3>

        {/* Pagos agregados */}
        {pagos.length > 0 && (
          <div className={styles.pagosList}>
            {pagos.map((p, i) => (
              <div key={i} className={styles.pagoItem}>
                <span>{metodos.find(m => m.id === p.metodoPagoId)?.nombre}</span>
                <span>RD$ {formatMoney(p.monto)}</span>
                <button onClick={() => quitarPago(i)}>✕</button>
              </div>
            ))}
            <div className={styles.pagoResumen}>
              <span>Pagado: RD$ {formatMoney(pagado)}</span>
              <span className={restante > 0 ? styles.restanteWarn : styles.restanteOk}>
                Restante: RD$ {formatMoney(restante)}
              </span>
            </div>
          </div>
        )}

        {/* Agregar pago */}
        {restante > 0 && !fiao && (
          <div className={styles.pagoForm}>
            <div className={styles.metodos}>
              {/* El backend ya solo manda activos por defecto — este
                  filtro es nada más una segunda capa, igual que en
                  PosPage.tsx, para que el grid nunca dependa solo de eso. */}
              {metodos.filter(m => m.activo).map(m => (
                <button
                  key={m.id}
                  className={`${styles.metodo} ${metodoSel === m.id ? styles.metodoOn : ''}`}
                  onClick={() => { setMetodoSel(m.id); setMonto(restante); }}
                >
                  {m.nombre}
                </button>
              ))}
            </div>
            {metodos.filter(m => m.activo).length === 0 && !clientePermiteFiao && (
              <div className={styles.fiaoWarn}>
                No hay métodos de pago configurados. Contacta a soporte para configurarlos.
              </div>
            )}
            <label className={styles.montoLbl}>
              Monto
              <input type="number" value={monto || ''} onChange={e => setMonto(Number(e.target.value))} />
            </label>
            {metodo?.esEfectivo && (
              <>
                <label className={styles.montoLbl}>
                  Recibido
                  <input type="number" value={recibido || ''} onChange={e => setRecibido(Number(e.target.value))} />
                </label>
                {cambio > 0 && <div className={styles.cambio}>Cambio: RD$ {formatMoney(cambio)}</div>}
              </>
            )}
            <button className={styles.addPagoBtn} onClick={agregarPago}>Agregar pago</button>
          </div>
        )}

        {/* Opción fiao con crédito real */}
        {clientePermiteFiao && restante > 0 && (
          <label className={styles.fiaoRow}>
            <input type="checkbox" checked={fiao} onChange={e => setFiao(e.target.checked)} />
            Dejar el restante a crédito (disponible: RD$ {formatMoney(creditoDisponible)})
          </label>
        )}
        {fiao && restante > creditoDisponible && (
          <div className={styles.fiaoWarn}>
            {creditoDisponible === 0
              ? 'Este cliente no tiene límite de crédito asignado.'
              : `El restante (RD$ ${formatMoney(restante)}) supera el crédito disponible (RD$ ${formatMoney(creditoDisponible)}).`
            }
          </div>
        )}

        <button
          className={styles.cobrarBtn}
          disabled={!puedeConfirmar || loading}
          onClick={() => onConfirm(pagos, fiao)}
        >
          {loading ? 'Procesando…' : (fiao && restante > 0 ? 'Cobrar y dejar a crédito' : 'Confirmar cobro')}
        </button>
      </div>
    </div>
  );
}
