import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { api, downloadPdf, sharePdf } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useAuthStore } from '../../store/auth';
import { CajaEstadoBar, useCajaEstado } from './CajaWidgets';
import styles from './PosPage.module.css';
import { PosMobile } from './PosMobile';

interface Servicio { id: string; nombre: string; precio: string; duracionMin: number; categoria?: { nombre: string }; activo: boolean; }
interface Producto { id: string; nombre: string; precio: string; activo: boolean; }
interface Cliente { id: string; nombre: string; telefono: string; etiquetas: string[]; permiteFiao: boolean; limiteCredito: number; balancePendiente: number; }
interface Empleado {
  id: string; nombre: string; activo: boolean; participaAgenda: boolean;
  modeloPago?: 'COMISION' | 'SUELDO_FIJO' | 'ALQUILER';
  usuario?: { id: string } | null;
}
interface MetodoPago { id: string; nombre: string; esEfectivo: boolean; activo: boolean; orden: number; }
interface FacturaResp { id: string; factura: string; estado: string; total: number; saldo: number; }
interface UltimaVenta { id: string; factura: string; total: number; clienteNombre: string | null; clienteTel: string | null; }

interface LineaVenta {
  key: string;
  tipo: 'SERVICIO' | 'PRODUCTO';
  refId: string;
  nombre: string;
  precio: number;
  cantidad: number;
  empleadoId?: string;
}

export function PosPage() {
  const qc = useQueryClient();
  const location = useLocation();

  const [tab, setTab] = useState<'SERVICIOS' | 'PRODUCTOS'>('SERVICIOS');
  const [busqueda, setBusqueda] = useState('');
  const [lineas, setLineas] = useState<LineaVenta[]>([]);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [metodoId, setMetodoId] = useState<string | null>(null);
  const [creditoSel, setCreditoSel] = useState(false);
  const [recibido, setRecibido] = useState<string>('');
  const [descuentoGlobal, setDescuentoGlobal] = useState(0);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [ultimaVenta, setUltimaVenta] = useState<UltimaVenta | null>(null);
  const [warnSinEmpleado, setWarnSinEmpleado] = useState<string[] | null>(null);
  const [anulando, setAnulando] = useState<{ id: string; factura: string } | null>(null);
  const [motivoAnular, setMotivoAnular] = useState('');
  const [pinAnular, setPinAnular] = useState('');
  const [errAnular, setErrAnular] = useState<string | null>(null);

  // Candado "una venta por cita" (Parte B): si el carrito se precargó desde
  // "Cobrar" en Agenda, esta venta queda ligada a esa cita — el backend
  // rechaza una segunda venta activa para la misma cita.
  const [citaIdActual, setCitaIdActual] = useState<string | null>(null);

  // Precarga desde "Cobrar" en la Agenda: llega con el cliente y los
  // servicios de la cita ya listos, para cobrar por el flujo normal del
  // POS (no crea nada por sí sola — es solo estado inicial del carrito).
  useEffect(() => {
    const state = location.state as {
      citaId?: string;
      clienteId?: string | null;
      citaLineas?: { servicioId: string; nombre: string; precio: number; empleadoId?: string }[];
    } | null;
    if (!state?.citaLineas?.length) return;
    setCitaIdActual(state.citaId ?? null);
    setClienteId(state.clienteId ?? null);
    setLineas(state.citaLineas.map((l, i) => ({
      key: `${l.servicioId}-cita-${i}-${Date.now()}`,
      tipo: 'SERVICIO',
      refId: l.servicioId,
      nombre: l.nombre,
      precio: Number(l.precio),
      cantidad: 1,
      empleadoId: l.empleadoId,
    })));
    window.history.replaceState({}, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: servicios = [] } = useQuery<Servicio[]>({ queryKey: ['servicios'], queryFn: () => api.get('/servicios').then(r => r.data) });
  const { data: productos = [] } = useQuery<Producto[]>({ queryKey: ['productos'], queryFn: () => api.get('/productos').then(r => r.data) });
  const { data: clientes = [] } = useQuery<Cliente[]>({ queryKey: ['clientes'], queryFn: () => api.get('/clientes').then(r => r.data), staleTime: 0 });
  const { data: empleados = [] } = useQuery<Empleado[]>({ queryKey: ['empleados'], queryFn: () => api.get('/empleados').then(r => r.data) });
  const { data: metodos = [] } = useQuery<MetodoPago[]>({ queryKey: ['metodos-pago'], queryFn: () => api.get('/metodos-pago').then(r => r.data) });
  const { data: recientes = [] } = useQuery<any[]>({ queryKey: ['facturas'], queryFn: () => api.get('/facturas').then(r => r.data) });
  const { data: cajaEstado } = useCajaEstado();

  const cliente = clientes.find(c => c.id === clienteId) ?? null;
  const empleadosServicio = empleados
    .filter(e => e.activo && e.participaAgenda)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const metodoSel = metodos.find(m => m.id === metodoId) ?? null;

  // Alquiler de silla (Fase B2, Pieza 2b): "factura limpia" del inquilino
  // — el backend es quien de verdad la exige (400 si se viola); esto es
  // solo la cortesía del POS para no dejar que el usuario llegue ahí.
  const authUser = useAuthStore(s => s.user);
  const requierePinAnular = useAuthStore(s => !!s.empresa?.pinAnulacionActivo);
  // % real de la empresa (0 si no es contribuyente DGII) — nunca hardcoded,
  // debe coincidir con lo que ventas.service.ts calculará al confirmar.
  const itbisPct = useAuthStore(s => s.empresa?.itbisPct ?? 0) / 100;
  const miEmpleado = empleados.find(e => e.usuario?.id === authUser?.id) ?? null;
  const soyInquilino = miEmpleado?.modeloPago === 'ALQUILER';
  // El inquilino ya presente en la venta actual (el mío, si aplica, o el
  // primero que aparezca en una línea existente — nunca deberían diferir
  // porque el propio flujo lo impide).
  const inquilinoEnVenta = soyInquilino
    ? miEmpleado
    : (() => {
        const linea = lineas.find(l => l.tipo === 'SERVICIO' && l.empleadoId);
        return linea ? empleados.find(e => e.id === linea.empleadoId && e.modeloPago === 'ALQUILER') ?? null : null;
      })();

  // Si hay un inquilino en la venta, la pestaña Productos ni existe —
  // fuerza servicios aunque `tab` haya quedado en PRODUCTOS de antes.
  const tabEfectivo = inquilinoEnVenta ? 'SERVICIOS' : tab;
  const catalogo = tabEfectivo === 'SERVICIOS' ? servicios : productos;
  const catalogoFiltrado = catalogo.filter(x =>
    x.activo && x.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const { subtotal, itbisEstimado, total } = useMemo(() => {
    const sub = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
    const base = Math.max(sub - descuentoGlobal, 0);
    const itbis = base * itbisPct;
    return { subtotal: sub, itbisEstimado: itbis, total: base + itbis };
  }, [lineas, descuentoGlobal, itbisPct]);

  const recibidoNum = parseFloat(recibido.replace(/[^0-9.]/g, '')) || 0;
  const cambio = metodoSel?.esEfectivo ? Math.max(recibidoNum - total, 0) : 0;

  function agregar(item: Servicio | Producto, tipo: 'SERVICIO' | 'PRODUCTO') {
    if (tipo === 'PRODUCTO' && inquilinoEnVenta) {
      setErrMsg('Un colaborador por alquiler solo puede facturar sus propios servicios, sin productos. Registra el producto en una venta aparte.');
      return;
    }
    setLineas(prev => {
      if (tipo === 'PRODUCTO') {
        const existe = prev.find(l => l.refId === item.id);
        if (existe) return prev.map(l => l.refId === item.id ? { ...l, cantidad: l.cantidad + 1 } : l);
      }
      return [...prev, {
        key: `${item.id}-${Date.now()}`,
        tipo, refId: item.id, nombre: item.nombre,
        precio: Number(item.precio),
        cantidad: 1,
        // Si ya hay un inquilino en la venta (o el usuario logueado lo es),
        // toda línea nueva es automáticamente suya — no hay nada que elegir.
        empleadoId: tipo === 'SERVICIO' ? inquilinoEnVenta?.id : undefined,
      }];
    });
  }

  function cambiarCantidad(key: string, delta: number) {
    setLineas(prev => prev.flatMap(l => {
      if (l.key !== key) return [l];
      const c = l.cantidad + delta;
      return c <= 0 ? [] : [{ ...l, cantidad: c }];
    }));
  }

  function cambiarEmpleado(key: string, empId: string) {
    setLineas(prev => prev.map(l => l.key === key ? { ...l, empleadoId: empId } : l));
  }

  function quitar(key: string) {
    setLineas(prev => prev.filter(l => l.key !== key));
  }

  function limpiarVenta() {
    setLineas([]); setClienteId(null); setMetodoId(null);
    setCreditoSel(false); setRecibido(''); setDescuentoGlobal(0);
    setErrMsg(null); setCitaIdActual(null);
  }

  const crearVenta = useMutation({
    mutationFn: () => {
      const body: any = {
        clienteId: clienteId ?? undefined,
        citaId: citaIdActual ?? undefined,
        lineas: lineas.map(l => ({
          tipo: l.tipo,
          servicioId: l.tipo === 'SERVICIO' ? l.refId : undefined,
          productoId: l.tipo === 'PRODUCTO' ? l.refId : undefined,
          ...(l.empleadoId ? { empleadoId: l.empleadoId } : {}),
          cantidad: l.cantidad,
        })),
        descuentoGlobal: descuentoGlobal || undefined,
        aperturaCajaId: cajaEstado?.cajaAbierta?.aperturaId,
      };
      if (metodoId) {
        body.pagos = [{ metodoPagoId: metodoId, monto: total }];
      } else {
        body.permitirFiao = true;
      }
      return api.post<FacturaResp>('/facturas', body).then(r => r.data);
    },
    onSuccess: (fac) => {
      setErrMsg(null);
      setOkMsg(`Venta ${fac.factura} registrada · RD$ ${formatMoney(fac.total)}`);
      setUltimaVenta({
        id: fac.id,
        factura: fac.factura,
        total: fac.total,
        clienteNombre: cliente?.nombre || null,
        clienteTel: cliente?.telefono || null,
      });
      limpiarVenta();
      qc.invalidateQueries({ queryKey: ['facturas'] });
      qc.invalidateQueries({ queryKey: ['dashboard-kpis'] });
      qc.invalidateQueries({ queryKey: ['caja-resumen'] });
      qc.invalidateQueries({ queryKey: ['citas'] });
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string | string[] } } };
      const raw = err?.response?.data?.message;
      setErrMsg(Array.isArray(raw) ? raw[0] : (raw ?? 'No se pudo registrar la venta.'));
    },
  });

  // `metodoId || creditoSel`: exige que la persona haya elegido de verdad
  // un método de pago o marcado Crédito — no solo que existan opciones.
  // Sin esto, con métodos.length===0 (empresa nueva sin métodos de pago
  // configurados) el grid de abajo no tenía nada que mostrar, el botón
  // seguía habilitado solo con que hubiera líneas en el carrito, y al
  // confirmar el mutationFn de arriba caía al `else` (`permitirFiao: true`)
  // como si se hubiera pedido vender a crédito — cosa que nadie eligió. El
  // backend entonces respondía "El fiao requiere un cliente registrado",
  // un error sin relación con la causa real. Esta condición además cubre
  // el caso con métodos configurados pero ninguno clickeado todavía.
  const puedeConfirmar = lineas.length > 0 && !crearVenta.isPending && (!!metodoId || creditoSel);

  // Anular venta (Parte A): solo OWNER/ADMIN, motivo obligatorio.
  const puedeAnular = authUser?.rol === 'OWNER' || authUser?.rol === 'ADMIN';
  const anularVenta = useMutation({
    mutationFn: () => api.patch(`/facturas/${anulando!.id}/anular`, {
      motivo: motivoAnular.trim(),
      ...(requierePinAnular && { pin: pinAnular.trim() }),
    }),
    onSuccess: () => {
      setAnulando(null); setMotivoAnular(''); setPinAnular(''); setErrAnular(null);
      qc.invalidateQueries({ queryKey: ['facturas'] });
      qc.invalidateQueries({ queryKey: ['dashboard-kpis'] });
      qc.invalidateQueries({ queryKey: ['caja-resumen'] });
      qc.invalidateQueries({ queryKey: ['citas'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['stock-bajo'] });
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string | string[] } } };
      const raw = err?.response?.data?.message;
      setErrAnular(Array.isArray(raw) ? raw[0] : (raw ?? 'No se pudo anular la venta.'));
    },
  });

  return (
    <>
      <div className={styles.mobileOnly}><PosMobile /></div>
      <div className={styles.desktopOnly}><div className={styles.pos}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Caja / POS</h1>
          <p className={styles.sub}>Punto de venta</p>
        </div>
      </div>

      <CajaEstadoBar />

      {okMsg && ultimaVenta && (
        <div className={styles.okBanner}>
          <span>✓ {okMsg}</span>
          <div className={styles.okActions}>
            <button
              className={styles.okActionBtn}
              onClick={() => downloadPdf(
                `/facturas/${ultimaVenta.id}/recibo`,
                `recibo-${ultimaVenta.factura}.pdf`,
              )}
            >
              ↓ Recibo
            </button>
            <button
              className={styles.okActionBtn}
              onClick={() => sharePdf(
                `/facturas/${ultimaVenta.id}/recibo`,
                `recibo-${ultimaVenta.factura}.pdf`,
                `Recibo ${ultimaVenta.factura}`,
              )}
            >
              ⤴ Compartir
            </button>
            {ultimaVenta.clienteTel && (
              <a
                className={styles.okActionBtn}
                href={`https://wa.me/${ultimaVenta.clienteTel.replace(/\D/g, '')}?text=${encodeURIComponent(
                  `Hola ${ultimaVenta.clienteNombre ?? ''}, gracias por tu visita. Tu ${ultimaVenta.factura} fue registrada por RD$ ${formatMoney(ultimaVenta.total)}. ¡Hasta pronto!`
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp
              </a>
            )}
            <button className={styles.okDismiss} onClick={() => { setOkMsg(null); setUltimaVenta(null); }}>✕</button>
          </div>
        </div>
      )}

      <div className={styles.grid}>
        {/* ── IZQUIERDA: Catálogo ── */}
        <div className={styles.col}>
          <div className={styles.colHead}><h3>Agregar artículos</h3></div>
          <div className={styles.search}>
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
            <input placeholder="Buscar servicio o producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div className={styles.tabs}>
            <button className={tab === 'SERVICIOS' ? styles.tabActive : ''} onClick={() => setTab('SERVICIOS')}>Servicios</button>
            {!inquilinoEnVenta && (
              <button className={tab === 'PRODUCTOS' ? styles.tabActive : ''} onClick={() => setTab('PRODUCTOS')}>Productos</button>
            )}
          </div>
          {inquilinoEnVenta && (
            <p className={styles.emptyMsg}>
              {inquilinoEnVenta.nombre} factura por alquiler: solo sus propios servicios, sin productos.
            </p>
          )}
          <div className={styles.artList}>
            {catalogoFiltrado.length === 0 ? (
              <p className={styles.emptyMsg}>{tabEfectivo === 'PRODUCTOS' ? 'Sin productos registrados' : 'Sin resultados'}</p>
            ) : (
              catalogoFiltrado.map(item => (
                <div key={item.id} className={styles.artItem}>
                  <div className={styles.artInfo}>
                    <b>{item.nombre}</b>
                    <small>{tabEfectivo === 'SERVICIOS' ? (item as Servicio).categoria?.nombre ?? 'Servicio' : 'Producto'}</small>
                  </div>
                  <span className={styles.artPrice}>RD$ {formatMoney(Number(item.precio))}</span>
                  <button className={styles.addBtn} onClick={() => agregar(item, tabEfectivo === 'SERVICIOS' ? 'SERVICIO' : 'PRODUCTO')}>
                    <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── CENTRO: Venta ── */}
        <div className={styles.col}>
          <div className={styles.colHead}><h3>Venta actual</h3></div>

          <div className={styles.clienteBox}>
            <select className={styles.clienteSelect} value={clienteId ?? ''} onChange={e => setClienteId(e.target.value || null)}>
              <option value="">Cliente anónimo (walk-in)</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} · {c.telefono}</option>)}
            </select>
            {cliente && (
              <div className={styles.clienteMeta}>
                {cliente.etiquetas?.includes('VIP') && <span className={styles.vip}>VIP</span>}
                {cliente.permiteFiao && (
                  <span className={styles.metaItem}>
                    Crédito disp: RD$ {formatMoney(Math.max(cliente.limiteCredito - cliente.balancePendiente, 0))}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className={styles.lines}>
            {lineas.length === 0 ? (
              <p className={styles.emptyMsg}>Agrega servicios o productos para iniciar la venta</p>
            ) : (
              lineas.map(l => (
                <div key={l.key} className={styles.line}>
                  <div className={styles.lineMain}>
                    <div className={styles.lineNm}>
                      <b>{l.nombre}</b>
                      <small>RD$ {formatMoney(l.precio)} c/u</small>
                    </div>
                    <div className={styles.qty}>
                      <button onClick={() => cambiarCantidad(l.key, -1)}>
                        <svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
                      </button>
                      <span>{l.cantidad}</span>
                      <button onClick={() => cambiarCantidad(l.key, 1)}>
                        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
                      </button>
                    </div>
                    <span className={styles.lineTot}>RD$ {formatMoney(l.precio * l.cantidad)}</span>
                    <button className={styles.rmBtn} onClick={() => quitar(l.key)}>
                      <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                  {l.tipo === 'SERVICIO' && inquilinoEnVenta && l.empleadoId === inquilinoEnVenta.id ? (
                    // Esta línea ya es del inquilino: no hay nada que
                    // elegir, y no se puede reasignar a otro empleado.
                    <div className={styles.empSelect}>Atendió: {inquilinoEnVenta.nombre}</div>
                  ) : l.tipo === 'SERVICIO' && !inquilinoEnVenta && empleadosServicio.length > 0 && (
                    <select
                      className={`${styles.empSelect}${!l.empleadoId ? ` ${styles.empSelectWarn}` : ''}`}
                      value={l.empleadoId ?? ''}
                      onChange={e => cambiarEmpleado(l.key, e.target.value)}
                    >
                      <option value="">— ¿Quién lo hizo? —</option>
                      {empleadosServicio.map(e => <option key={e.id} value={e.id}>Atendió: {e.nombre}</option>)}
                    </select>
                  )}
                </div>
              ))
            )}
          </div>

          <div className={styles.totals}>
            <div className={styles.trow}><span>Subtotal</span><span>RD$ {formatMoney(subtotal)}</span></div>
            {descuentoGlobal > 0 && (
              <div className={`${styles.trow} ${styles.disc}`}>
                <span>Descuento</span><span>- RD$ {formatMoney(descuentoGlobal)}</span>
              </div>
            )}
            {itbisPct > 0 && (
              <div className={styles.trow}>
                <span>ITBIS ({Math.round(itbisPct * 100)}%) <small>est.</small></span>
                <span>RD$ {formatMoney(itbisEstimado)}</span>
              </div>
            )}
            <div className={`${styles.trow} ${styles.grand}`}>
              <span>TOTAL</span><span>RD$ {formatMoney(total)}</span>
            </div>
          </div>

          <div className={styles.ventaFoot}>
            <button className={styles.vfDanger} onClick={limpiarVenta} disabled={lineas.length === 0}>
              <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg> Limpiar venta
            </button>
          </div>
        </div>

        {/* ── DERECHA: Pago ── */}
        <div className={styles.col}>
          <div className={styles.colHead}><h3>Método de pago</h3></div>

          <div className={styles.payGrid}>
            {metodos.filter(m => m.activo).map(m => (
              <button
                key={m.id}
                className={`${styles.pm} ${metodoId === m.id ? styles.pmActive : ''}`}
                onClick={() => { setMetodoId(m.id); setCreditoSel(false); }}
              >
                <span>{m.nombre}</span>
              </button>
            ))}
            {cliente?.permiteFiao && (
              <button
                className={`${styles.pm} ${creditoSel ? styles.pmActive : ''}`}
                onClick={() => { setMetodoId(null); setCreditoSel(true); }}
              >
                <span>Crédito</span>
              </button>
            )}
          </div>
          {metodos.filter(m => m.activo).length === 0 && !cliente?.permiteFiao && (
            <p className={styles.errMsg}>
              No hay métodos de pago configurados. Contacta a soporte para configurarlos.
            </p>
          )}

          <div className={styles.payTotals}>
            <div className={`${styles.prow} ${styles.prowTotal}`}>
              <span>Total a pagar</span>
              <span>RD$ {formatMoney(total)}</span>
            </div>

            {metodoSel?.esEfectivo && (
              <>
                <div className={styles.prow}>
                  <span>Recibido</span>
                  <div className={styles.recibidoInput}>
                    <span>RD$</span>
                    <input
                      value={recibido}
                      onChange={e => setRecibido(e.target.value)}
                      placeholder="0.00"
                      inputMode="decimal"
                    />
                  </div>
                </div>
                <div className={`${styles.prow} ${styles.cambio}`}>
                  <span>Cambio</span><span>RD$ {formatMoney(cambio)}</span>
                </div>
              </>
            )}

            {!metodoId && lineas.length > 0 && (
              <p className={styles.creditoNote}>Sin método de pago: la venta quedará como crédito (cuenta por cobrar).</p>
            )}
          </div>

          <button
            className={styles.confirmBtn}
            disabled={!puedeConfirmar}
            onClick={() => {
              const sinEmp = lineas.filter(l => l.tipo === 'SERVICIO' && !l.empleadoId).map(l => l.nombre);
              if (sinEmp.length > 0) { setWarnSinEmpleado(sinEmp); return; }
              crearVenta.mutate();
            }}
          >
            {crearVenta.isPending ? 'Procesando…' : (
              <>
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>
                Confirmar cobro
              </>
            )}
          </button>

          {errMsg && (
            <p className={styles.errMsg}>{errMsg}</p>
          )}

          <div className={styles.recientes}>
            <div className={styles.recHead}>Ventas recientes</div>
            {recientes.slice(0, 5).map((v: any) => {
              const anulada = v.estado === 'ANULADA';
              return (
                <div key={v.id} className={`${styles.recRow} ${anulada ? styles.recRowAnulada : ''}`}>
                  <span className={styles.recNum}>{v.factura}</span>
                  <span className={styles.recCli}>{typeof v.cliente === 'string' ? v.cliente : v.cliente?.nombre ?? 'Anónimo'}</span>
                  <span className={styles.recAmt}>
                    RD$ {formatMoney(v.total)}
                    {anulada && <b className={styles.recBadgeAnulada} title={v.motivoAnulacion ?? undefined}>Anulada</b>}
                  </span>
                  <button
                    className={styles.recDownloadBtn}
                    title="Reimprimir recibo"
                    onClick={() => downloadPdf(`/facturas/${v.id}/recibo`, `recibo-${v.factura}.pdf`)}
                  >
                    <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                  </button>
                  <button
                    className={styles.recDownloadBtn}
                    title="Compartir recibo"
                    onClick={() => sharePdf(`/facturas/${v.id}/recibo`, `recibo-${v.factura}.pdf`, `Recibo ${v.factura}`)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13"/></svg>
                  </button>
                  {puedeAnular && !anulada && (
                    <button
                      className={styles.recAnularBtn}
                      title="Anular venta"
                      onClick={() => { setAnulando({ id: v.id, factura: v.factura }); setMotivoAnular(''); setPinAnular(''); setErrAnular(null); }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div></div>

      {warnSinEmpleado && (
        <div className={styles.warnOverlay}>
          <div className={styles.warnModal}>
            <div className={styles.warnHead}>
              <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>Servicios sin empleado asignado</span>
            </div>
            <p className={styles.warnBody}>
              Los siguientes servicios no tienen empleado — no se calculará comisión:
            </p>
            <ul className={styles.warnList}>
              {warnSinEmpleado.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
            <div className={styles.warnFoot}>
              <button className={styles.warnBack} onClick={() => setWarnSinEmpleado(null)}>← Volver a asignar</button>
              <button className={styles.warnContinue} onClick={() => { setWarnSinEmpleado(null); crearVenta.mutate(); }}>Continuar sin comisión</button>
            </div>
          </div>
        </div>
      )}

      {anulando && (
        <div className={styles.warnOverlay}>
          <div className={styles.warnModal}>
            <div className={styles.warnHead}>
              <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>Anular venta {anulando.factura}</span>
            </div>
            <p className={styles.warnBody}>
              Esto revierte el stock de productos, el saldo a crédito y las comisiones no
              liquidadas de esta venta. La factura queda marcada "Anulada" — no se borra. Esta
              acción no se puede deshacer.
            </p>
            <label className={styles.motivoLbl}>
              Motivo de la anulación *
              <textarea
                className={styles.motivoInput}
                rows={2}
                placeholder="Ej: cobro duplicado, error de servicio…"
                value={motivoAnular}
                onChange={e => setMotivoAnular(e.target.value)}
                autoFocus
              />
            </label>
            {requierePinAnular && (
              <label className={styles.motivoLbl}>
                PIN de anulación *
                <input
                  className={styles.motivoInput}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="PIN de la empresa"
                  value={pinAnular}
                  onChange={e => setPinAnular(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  maxLength={8}
                />
              </label>
            )}
            {errAnular && <p className={styles.errMsg}>{errAnular}</p>}
            <div className={styles.warnFoot}>
              <button className={styles.warnBack} onClick={() => { setAnulando(null); setErrAnular(null); }}>Cancelar</button>
              <button
                className={styles.warnContinue}
                disabled={!motivoAnular.trim() || (requierePinAnular && !pinAnular.trim()) || anularVenta.isPending}
                onClick={() => anularVenta.mutate()}
              >
                {anularVenta.isPending ? 'Anulando…' : 'Anular venta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
