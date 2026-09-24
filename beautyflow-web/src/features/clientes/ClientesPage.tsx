import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, downloadPdf } from '../../lib/api';
import { formatMoney, initiales } from '../../lib/format';
import styles from './ClientesPage.module.css';
import { ClientesMobile } from './ClientesMobile';

/* ─── Tipos ─── */
interface Cliente {
  id: string; nombre: string; apellido: string | null; telefono: string | null;
  whatsapp: string | null; email: string | null; fechaNacimiento: string | null;
  sexo: string | null; cedula: string | null; direccion: string | null;
  notas: string | null; alergias: string | null; activo: boolean;
  permiteFiao: boolean; limiteCredito: number; balancePendiente: number;
  gastoAcumulado: number; totalCitas: number; totalCompras: number;
  etiquetas: string[];
}
interface CitaCliente { id: string; fecha: string; servicios: string[]; empleado: string; estado: string; total: number; }
interface CompraCliente { id: string; factura: string; fecha: string; total: number; balancePendiente: number; estado: string; }
interface PagoHistorial { id: string; metodo: string; monto: number; referencia: string | null; esAbonoDeuda: boolean; fecha: string | null; }
interface Balance { limiteCredito: number; balancePendiente: number; disponible: number; permiteFiao: boolean; }

const ETIQUETAS = ['NUEVO', 'FRECUENTE', 'VIP', 'MOROSO', 'CUMPLEANOS'] as const;
const ETIQUETA_COLOR: Record<string, string> = {
  NUEVO: 'var(--info)', FRECUENTE: 'var(--ok)', VIP: 'var(--gold)',
  MOROSO: 'var(--err)', CUMPLEANOS: 'var(--purple)',
};
const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente', CONFIRMADA: 'Confirmada', EN_PROCESO: 'En proceso',
  FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada', NO_ASISTIO: 'No llegó',
};

type TabKey = 'info' | 'citas' | 'compras' | 'balance';

function etiquetaLabel(et: string) {
  return et === 'CUMPLEANOS' ? 'Cumpleaños' : et.charAt(0) + et.slice(1).toLowerCase();
}

export function ClientesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [etiqueta, setEtiqueta] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('info');
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [expandedCompra, setExpandedCompra] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: clientes = [], isLoading } = useQuery<Cliente[]>({
    queryKey: ['clientes', qDebounced, etiqueta],
    queryFn: () => api.get('/clientes', {
      params: { q: qDebounced || undefined, etiqueta: etiqueta || undefined },
    }).then(r => r.data),
  });

  const sel = clientes.find(c => c.id === selId) ?? null;

  const { data: citas = [] } = useQuery<CitaCliente[]>({
    queryKey: ['cliente-citas', selId],
    queryFn: () => api.get(`/clientes/${selId}/citas`).then(r => r.data),
    enabled: !!selId && tab === 'citas',
  });
  const { data: compras = [] } = useQuery<CompraCliente[]>({
    queryKey: ['cliente-compras', selId],
    queryFn: () => api.get(`/clientes/${selId}/compras`).then(r => r.data),
    enabled: !!selId && tab === 'compras',
  });
  const { data: balance } = useQuery<Balance>({
    queryKey: ['cliente-balance', selId],
    queryFn: () => api.get(`/clientes/${selId}/balance`).then(r => r.data),
    enabled: !!selId && tab === 'balance',
  });

  function abrirNuevo() { setEditando(null); setModalOpen(true); }
  function abrirEditar(c: Cliente) { setEditando(c); setModalOpen(true); }

  return (
    <>
      <div className={styles.mobileOnly}><ClientesMobile /></div>
      <div className={styles.desktopOnly}><div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Clientes</h1>
          <p className={styles.sub}>Gestiona tu cartera de clientes</p>
        </div>
        <button className={styles.btnNew} onClick={abrirNuevo}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Nuevo cliente
        </button>
      </div>

      <div className={styles.body}>
        {/* ── Lista ── */}
        <div className={styles.listCol}>
          <div className={styles.search}>
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
            <input placeholder="Buscar por nombre, teléfono o correo..." value={q} onChange={e => setQ(e.target.value)} />
          </div>

          <div className={styles.filters}>
            <button className={!etiqueta ? styles.fActive : ''} onClick={() => setEtiqueta(null)}>Todos</button>
            {ETIQUETAS.map(et => (
              <button key={et} className={etiqueta === et ? styles.fActive : ''} onClick={() => setEtiqueta(et)}>
                {etiquetaLabel(et)}
              </button>
            ))}
          </div>

          <div className={styles.list}>
            {isLoading ? (
              <div className={styles.loadWrap}><span className={styles.spinner} /></div>
            ) : clientes.length === 0 ? (
              <p className={styles.emptyMsg}>No se encontraron clientes</p>
            ) : (
              clientes.map(c => (
                <div
                  key={c.id}
                  className={`${styles.clienteItem} ${c.id === selId ? styles.itemActive : ''}`}
                  onClick={() => { setSelId(c.id); setTab('info'); }}
                >
                  <div className={styles.cav}>{initiales(c.nombre)}</div>
                  <div className={styles.cinfo}>
                    <b>{c.nombre}{c.apellido ? ` ${c.apellido}` : ''}</b>
                    <small>{c.telefono ?? 'Sin teléfono'}</small>
                  </div>
                  <div className={styles.ctags}>
                    {c.etiquetas.slice(0, 1).map(et => (
                      <span key={et} className={styles.tagMini} style={{ color: ETIQUETA_COLOR[et], borderColor: ETIQUETA_COLOR[et] }}>
                        {etiquetaLabel(et)}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Detalle ── */}
        <div className={styles.detailCol}>
          {!sel ? (
            <div className={styles.detailEmpty}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
              </svg>
              <p>Selecciona un cliente para ver su perfil</p>
            </div>
          ) : (
            <>
              <div className={styles.profHead}>
                <div className={styles.profAv}>{initiales(sel.nombre)}</div>
                <div className={styles.profMeta}>
                  <h2>{sel.nombre}{sel.apellido ? ` ${sel.apellido}` : ''}</h2>
                  <div className={styles.profTags}>
                    {sel.etiquetas.map(et => (
                      <span key={et} className={styles.tag} style={{ color: ETIQUETA_COLOR[et], background: `${ETIQUETA_COLOR[et]}22` }}>
                        {etiquetaLabel(et)}
                      </span>
                    ))}
                  </div>
                </div>
                <button className={styles.editBtn} onClick={() => abrirEditar(sel)}>
                  <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
                  Editar
                </button>
              </div>

              <div className={styles.statRow}>
                <div className={styles.stat}><span>{sel.totalCitas}</span><small>Citas</small></div>
                <div className={styles.stat}><span>{sel.totalCompras}</span><small>Compras</small></div>
                <div className={styles.stat}><span>RD$ {formatMoney(sel.gastoAcumulado)}</span><small>Gasto total</small></div>
              </div>

              <div className={styles.tabs}>
                {([
                  ['info', 'Información'],
                  ['citas', 'Citas'],
                  ['compras', 'Compras'],
                  ['balance', 'Balance'],
                ] as [TabKey, string][]).map(([k, label]) => (
                  <button key={k} className={tab === k ? styles.tabActive : ''} onClick={() => setTab(k)}>
                    {label}
                  </button>
                ))}
              </div>

              <div className={styles.tabBody}>
                {tab === 'info' && (
                  <div className={styles.infoGrid}>
                    <Field label="Teléfono" value={sel.telefono} />
                    <Field label="WhatsApp" value={sel.whatsapp} />
                    <Field label="Correo" value={sel.email} />
                    <Field label="Cédula" value={sel.cedula} />
                    <Field label="Fecha de nacimiento" value={sel.fechaNacimiento} />
                    <Field label="Sexo" value={sel.sexo === 'M' ? 'Masculino' : sel.sexo === 'F' ? 'Femenino' : sel.sexo} />
                    <Field label="Dirección" value={sel.direccion} full />
                    <Field label="Alergias" value={sel.alergias} full />
                    <Field label="Notas" value={sel.notas} full />
                  </div>
                )}

                {tab === 'citas' && (
                  citas.length === 0
                    ? <p className={styles.emptyMsg}>Sin citas registradas</p>
                    : (
                      <div className={styles.histList}>
                        {citas.map(ci => (
                          <div key={ci.id} className={styles.histRow}>
                            <span className={styles.hDate}>{ci.fecha}</span>
                            <span className={styles.hServ}>{ci.servicios.join(', ')}</span>
                            <span className={styles.hEmp}>{ci.empleado}</span>
                            <span className={styles.hEstado}>{ESTADO_LABEL[ci.estado] ?? ci.estado}</span>
                            <span className={styles.hTot}>RD$ {formatMoney(ci.total)}</span>
                          </div>
                        ))}
                      </div>
                    )
                )}

                {tab === 'compras' && (
                  compras.length === 0
                    ? <p className={styles.emptyMsg}>Sin compras registradas</p>
                    : (
                      <div className={styles.histList}>
                        {compras.map(co => (
                          <div key={co.id} className={styles.compraWrap}>
                            <div className={styles.histRow}>
                              <span className={styles.hDate}>{co.fecha}</span>
                              <span className={styles.hServ}>{co.factura}</span>
                              <span className={styles.hEstado}>{co.estado}</span>
                              <span className={styles.hTot}>RD$ {formatMoney(co.total)}</span>
                              <div className={styles.compraActions}>
                                <button
                                  className={styles.compraBtn}
                                  title="Reimprimir recibo"
                                  onClick={() => downloadPdf(`/facturas/${co.id}/recibo`, `recibo-${co.factura}.pdf`)}
                                >
                                  <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                </button>
                                <button
                                  className={styles.compraBtn}
                                  title={expandedCompra === co.id ? 'Ocultar abonos' : 'Ver abonos'}
                                  onClick={() => setExpandedCompra(expandedCompra === co.id ? null : co.id)}
                                >
                                  <svg viewBox="0 0 24 24" style={{ transform: expandedCompra === co.id ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}><path d="M6 9l6 6 6-6"/></svg>
                                </button>
                              </div>
                            </div>
                            {expandedCompra === co.id && <AbonosExpand ventaId={co.id} />}
                          </div>
                        ))}
                      </div>
                    )
                )}

                {tab === 'balance' && balance && (
                  <div className={styles.balanceBox}>
                    <div className={styles.balRow}><span>Permite crédito</span><b>{balance.permiteFiao ? 'Sí' : 'No'}</b></div>
                    <div className={styles.balRow}><span>Límite de crédito</span><b>RD$ {formatMoney(balance.limiteCredito)}</b></div>
                    <div className={styles.balRow}>
                      <span>Balance pendiente</span>
                      <b className={balance.balancePendiente > 0 ? styles.balDebt : ''}>RD$ {formatMoney(balance.balancePendiente)}</b>
                    </div>
                    <div className={`${styles.balRow} ${styles.balDisp}`}>
                      <span>Crédito disponible</span>
                      <b>RD$ {formatMoney(balance.disponible)}</b>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {modalOpen && (
        <ClienteModal
          cliente={editando}
          onClose={() => setModalOpen(false)}
          onSaved={(c) => {
            setModalOpen(false);
            qc.invalidateQueries({ queryKey: ['clientes'] });
            if (c) setSelId(c.id);
          }}
        />
      )}
      </div></div>
    </>
  );
}

/* ─── Campo de info ─── */
function Field({ label, value, full }: { label: string; value: string | null; full?: boolean }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5 }}>{value ?? <span style={{ color: '#5e5d57' }}>—</span>}</div>
    </div>
  );
}

/* ─── Modal crear/editar ─── */
function ClienteModal({ cliente, onClose, onSaved }: {
  cliente: Cliente | null;
  onClose: () => void;
  onSaved: (c: any) => void;
}) {
  const [form, setForm] = useState({
    nombre:          cliente?.nombre          ?? '',
    apellido:        cliente?.apellido        ?? '',
    whatsapp:        cliente?.whatsapp        ?? '',
    email:           cliente?.email           ?? '',
    cedula:          cliente?.cedula          ?? '',
    fechaNacimiento: cliente?.fechaNacimiento ?? '',
    sexo:            cliente?.sexo            ?? '',
    direccion:       cliente?.direccion       ?? '',
    notas:           cliente?.notas           ?? '',
    alergias:        cliente?.alergias        ?? '',
    permiteFiao:     cliente?.permiteFiao     ?? false,
    limiteCredito:   cliente?.limiteCredito   ?? 0,
  });
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const guardar = useMutation({
    mutationFn: () => {
      const body: any = {};
      Object.entries(form).forEach(([k, v]) => {
        if (v !== '' && v !== null) body[k] = v;
      });
      body.limiteCredito = Number(form.limiteCredito) || 0;
      if (cliente) return api.patch(`/clientes/${cliente.id}`, body).then(r => r.data);
      return api.post('/clientes', body).then(r => r.data);
    },
    onSuccess: (c) => onSaved(c),
    onError: () => setErr('No se pudo guardar. Verifica los datos.'),
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>{cliente ? 'Editar cliente' : 'Nuevo cliente'}</h3>
          <button onClick={onClose}>
            <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <L label="Nombre *"><input value={form.nombre} onChange={e => set('nombre', e.target.value)} /></L>
            <L label="Apellido"><input value={form.apellido} onChange={e => set('apellido', e.target.value)} /></L>
            <L label="WhatsApp"><input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="809-000-0000" /></L>
            <L label="Correo"><input value={form.email} onChange={e => set('email', e.target.value)} type="email" /></L>
            <L label="Cédula"><input value={form.cedula} onChange={e => set('cedula', e.target.value)} /></L>
            <L label="Fecha de nacimiento">
              <input value={form.fechaNacimiento} onChange={e => set('fechaNacimiento', e.target.value)} type="date" />
            </L>
            <L label="Sexo">
              <select value={form.sexo} onChange={e => set('sexo', e.target.value)}>
                <option value="">—</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
                <option value="OTRO">Otro</option>
              </select>
            </L>
            <L label="Dirección" full><input value={form.direccion} onChange={e => set('direccion', e.target.value)} /></L>
            <L label="Alergias" full><input value={form.alergias} onChange={e => set('alergias', e.target.value)} /></L>
            <L label="Notas" full>
              <textarea value={form.notas} onChange={e => set('notas', e.target.value)} rows={2} />
            </L>
            <L label="Límite de crédito">
              <input value={form.limiteCredito} onChange={e => set('limiteCredito', Number(e.target.value))} type="number" min={0} />
            </L>
            <div className={styles.checkRow}>
              <label>
                <input type="checkbox" checked={form.permiteFiao} onChange={e => set('permiteFiao', e.target.checked)} />
                Permite crédito (fiao)
              </label>
            </div>
          </div>
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

function AbonosExpand({ ventaId }: { ventaId: string }) {
  const { data, isLoading } = useQuery<{ pagos: PagoHistorial[] }>({
    queryKey: ['factura-det-crm', ventaId],
    queryFn: () => api.get(`/facturas/${ventaId}`).then(r => r.data),
    staleTime: 60_000,
  });
  const pagos = data?.pagos ?? [];

  if (isLoading) return <div className={styles.abonosLoad}><span className={styles.spinner} /></div>;
  if (pagos.length === 0) return <p className={styles.abonosEmpty}>Sin pagos registrados.</p>;

  return (
    <div className={styles.abonosList}>
      {pagos.map((p, i) => (
        <div key={p.id || i} className={styles.abonoRow}>
          <span className={p.esAbonoDeuda ? styles.badgeAbono : styles.badgePago}>
            {p.esAbonoDeuda ? 'Abono' : 'Pago inicial'}
          </span>
          <span className={styles.abonoMetodo}>{p.metodo}</span>
          <span className={styles.abonoMonto}>RD$ {formatMoney(p.monto)}</span>
          {p.id && (
            <button
              className={styles.abonoDownBtn}
              title="Reimprimir recibo"
              onClick={() => downloadPdf(
                `/facturas/${ventaId}/recibo-abono/${p.id}`,
                `recibo-abono-${p.id.slice(0, 8)}.pdf`,
              )}
            >
              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            </button>
          )}
        </div>
      ))}
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
