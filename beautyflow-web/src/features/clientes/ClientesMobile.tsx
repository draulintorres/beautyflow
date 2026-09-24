import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import styles from './ClientesMobile.module.css';

interface Cliente {
  id: string; nombre: string; apellido?: string | null; telefono?: string | null;
  whatsapp?: string | null; email?: string | null; fechaNacimiento?: string | null;
  sexo?: string | null; cedula?: string | null; direccion?: string | null;
  notas?: string | null; alergias?: string | null;
  permiteFiao?: boolean; limiteCredito?: number; balancePendiente?: number;
  gastoAcumulado?: number; totalCitas?: number; totalCompras?: number;
  etiquetas?: string[];
}

const ETIQUETAS = ['NUEVO', 'FRECUENTE', 'VIP', 'MOROSO', 'CUMPLEANOS'] as const;
const ET_LBL: Record<string, string> = {
  NUEVO: 'Nuevo', FRECUENTE: 'Frecuente', VIP: 'VIP', MOROSO: 'Moroso', CUMPLEANOS: 'Cumpleaños',
};
const ET_CLS: Record<string, string> = {
  NUEVO: 'etNuevo', FRECUENTE: 'etFrec', VIP: 'etVip', MOROSO: 'etMoroso', CUMPLEANOS: 'etCumple',
};

function ini(n?: string | null, a?: string | null) {
  return `${(n ?? '?')[0] ?? ''}${(a ?? '')[0] ?? ''}`.toUpperCase();
}
const waLink = (w?: string | null) =>
  `https://wa.me/1${(w ?? '').replace(/\D/g, '')}`;

function fmtTel(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}
function fmtFecha(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
function isoToDisplay(iso?: string | null): string {
  if (!iso) return '';
  const p = iso.split('T')[0].split('-');
  if (p.length !== 3) return '';
  return `${p[2]}/${p[1]}/${p[0]}`;
}
function displayToISO(dd: string): string {
  const p = dd.split('/');
  if (p.length !== 3 || p[2].length < 4) return '';
  return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
}

export function ClientesMobile() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [sel, setSel] = useState<Cliente | null>(null);
  const [editar, setEditar] = useState<Cliente | null>(null);
  const [crear, setCrear] = useState(false);

  const { data: clientes = [], isLoading } = useQuery<Cliente[]>({
    queryKey: ['clientes-mobile', q, etiqueta],
    queryFn: () =>
      api.get('/clientes', {
        params: { ...(q ? { q } : {}), ...(etiqueta ? { etiqueta } : {}) },
      }).then(r => r.data),
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1>Clientes</h1>
        <input
          className={styles.search}
          placeholder="Buscar por nombre o teléfono…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      <div className={styles.filtros}>
        <button
          className={`${styles.filtro} ${etiqueta === '' ? styles.filtroOn : ''}`}
          onClick={() => setEtiqueta('')}
        >Todos</button>
        {ETIQUETAS.map(e => (
          <button
            key={e}
            className={`${styles.filtro} ${etiqueta === e ? styles.filtroOn : ''}`}
            onClick={() => setEtiqueta(e)}
          >{ET_LBL[e]}</button>
        ))}
      </div>

      <div className={styles.list}>
        {isLoading ? (
          <div className={styles.loadWrap}><span className={styles.spinner} /></div>
        ) : clientes.length === 0 ? (
          <div className={styles.empty}>
            No hay clientes{q || etiqueta ? ' con ese criterio' : ''}
          </div>
        ) : (
          clientes.map(c => (
            <div key={c.id} className={styles.card} onClick={() => setSel(c)}>
              <div className={styles.avatar}>{ini(c.nombre, c.apellido)}</div>
              <div className={styles.cardInfo}>
                <div className={styles.cardNom}>{c.nombre}{c.apellido ? ` ${c.apellido}` : ''}</div>
                <div className={styles.cardTel}>{c.telefono ?? 'Sin teléfono'}</div>
              </div>
              {c.etiquetas && c.etiquetas[0] && (
                <span className={`${styles.badge} ${styles[ET_CLS[c.etiquetas[0]] ?? 'etNuevo']}`}>
                  {ET_LBL[c.etiquetas[0]] ?? c.etiquetas[0]}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <button className={styles.fab} onClick={() => setCrear(true)}>+ Nuevo cliente</button>

      {sel && !editar && (
        <ClienteDetalle
          cliente={sel}
          onClose={() => setSel(null)}
          onEditar={() => setEditar(sel)}
        />
      )}
      {crear && (
        <ClienteForm
          onClose={() => setCrear(false)}
          onSaved={() => {
            setCrear(false);
            qc.invalidateQueries({ queryKey: ['clientes-mobile'] });
          }}
        />
      )}
      {editar && (
        <ClienteForm
          cliente={editar}
          onClose={() => setEditar(null)}
          onSaved={() => {
            setEditar(null);
            setSel(null);
            qc.invalidateQueries({ queryKey: ['clientes-mobile'] });
          }}
        />
      )}
    </div>
  );
}

/* ── Detalle ── */
function ClienteDetalle({
  cliente,
  onClose,
  onEditar,
}: {
  cliente: Cliente;
  onClose: () => void;
  onEditar: () => void;
}) {
  useLockBodyScroll();
  const [tab, setTab] = useState<'info' | 'citas' | 'compras' | 'balance'>('info');

  const { data: citas = [] } = useQuery<any[]>({
    queryKey: ['cli-citas', cliente.id],
    enabled: tab === 'citas',
    queryFn: () => api.get(`/clientes/${cliente.id}/citas`).then(r => r.data),
  });
  const { data: compras = [] } = useQuery<any[]>({
    queryKey: ['cli-compras', cliente.id],
    enabled: tab === 'compras',
    queryFn: () => api.get(`/clientes/${cliente.id}/compras`).then(r => r.data),
  });
  const { data: balance } = useQuery<any>({
    queryKey: ['cli-balance', cliente.id],
    enabled: tab === 'balance',
    queryFn: () => api.get(`/clientes/${cliente.id}/balance`).then(r => r.data),
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.handle} />

        {/* Cabecera */}
        <div className={styles.detHead}>
          <div className={styles.detAvatar}>{ini(cliente.nombre, cliente.apellido)}</div>
          <div className={styles.detInfo}>
            <div className={styles.detNom}>{cliente.nombre}{cliente.apellido ? ` ${cliente.apellido}` : ''}</div>
            <div className={styles.detEts}>
              {cliente.etiquetas?.map(e => (
                <span key={e} className={`${styles.badge} ${styles[ET_CLS[e] ?? 'etNuevo']}`}>
                  {ET_LBL[e] ?? e}
                </span>
              ))}
            </div>
          </div>
          <button className={styles.editBtn} onClick={onEditar}>Editar</button>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
            <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Stats */}
        <div className={styles.stats}>
          <div className={styles.stat}>
            <b>{cliente.totalCitas ?? 0}</b><span>Citas</span>
          </div>
          <div className={styles.stat}>
            <b>{cliente.totalCompras ?? 0}</b><span>Compras</span>
          </div>
          <div className={styles.stat}>
            <b>RD$ {formatMoney(cliente.gastoAcumulado ?? 0)}</b><span>Gastado</span>
          </div>
        </div>

        {/* Acciones rápidas */}
        <div className={styles.acciones}>
          {cliente.telefono && (
            <a className={styles.accCall} href={`tel:${cliente.telefono}`}>
              <svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 01-2.2 2A19.8 19.8 0 013.1 4.2 2 2 0 015.1 2h3a2 2 0 012 1.7 12.6 12.6 0 00.6 2.5 2 2 0 01-.4 2.1L9 9.9a16 16 0 006.1 6.1l1.6-1.6a2 2 0 012.1-.4c.8.3 1.6.5 2.5.6a2 2 0 011.7 2z"/></svg>
              Llamar
            </a>
          )}
          {(cliente.whatsapp || cliente.telefono) && (
            <a className={styles.accWa} href={waLink(cliente.whatsapp ?? cliente.telefono)} target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6A8.4 8.4 0 0112.5 3h.5a8.5 8.5 0 018 8v.5z"/></svg>
              WhatsApp
            </a>
          )}
        </div>

        {/* Pestañas */}
        <div className={styles.tabs}>
          {(['info', 'citas', 'compras', 'balance'] as const).map(t => (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabOn : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'info' ? 'Info' : t === 'citas' ? 'Citas' : t === 'compras' ? 'Compras' : 'Balance'}
            </button>
          ))}
        </div>

        <div className={styles.tabBody}>
          {tab === 'info' && (
            <div className={styles.infoList}>
              <Row k="Teléfono" v={cliente.telefono} />
              <Row k="WhatsApp" v={cliente.whatsapp} />
              <Row k="Correo" v={cliente.email} />
              <Row k="Cédula" v={cliente.cedula} />
              <Row k="Nacimiento" v={isoToDisplay(cliente.fechaNacimiento)} />
              <Row k="Sexo" v={cliente.sexo === 'M' ? 'Masculino' : cliente.sexo === 'F' ? 'Femenino' : cliente.sexo} />
              <Row k="Dirección" v={cliente.direccion} />
              <Row k="Alergias" v={cliente.alergias} />
              <Row k="Notas" v={cliente.notas} />
            </div>
          )}

          {tab === 'citas' && (
            citas.length === 0
              ? <div className={styles.tabEmpty}>Sin citas registradas</div>
              : citas.map((c, i) => (
                <div key={i} className={styles.histRow}>
                  <div className={styles.histLeft}>
                    <b>{c.servicios?.join(', ')}</b>
                    <span>{c.fecha} · {c.empleado}</span>
                  </div>
                  <span className={styles.histTotal}>RD$ {formatMoney(c.total)}</span>
                </div>
              ))
          )}

          {tab === 'compras' && (
            compras.length === 0
              ? <div className={styles.tabEmpty}>Sin compras registradas</div>
              : compras.map((c, i) => (
                <div key={i} className={styles.histRow}>
                  <div className={styles.histLeft}>
                    <b>{c.factura}</b>
                    <span>{c.fecha} · {c.estado}</span>
                  </div>
                  <span className={styles.histTotal}>RD$ {formatMoney(c.total)}</span>
                </div>
              ))
          )}

          {tab === 'balance' && balance && (
            <div className={styles.infoList}>
              <Row k="Permite crédito" v={balance.permiteFiao ? 'Sí' : 'No'} />
              <Row k="Límite de crédito" v={`RD$ ${formatMoney(balance.limiteCredito)}`} />
              <Row k="Balance pendiente" v={`RD$ ${formatMoney(balance.balancePendiente)}`} />
              <Row k="Crédito disponible" v={`RD$ ${formatMoney(balance.disponible)}`} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className={styles.infoRow}>
      <span>{k}</span>
      <b>{v || '—'}</b>
    </div>
  );
}

/* ── Crear / Editar ── */
function ClienteForm({
  cliente,
  onClose,
  onSaved,
}: {
  cliente?: Cliente;
  onClose: () => void;
  onSaved: () => void;
}) {
  useLockBodyScroll();
  const esEditar = !!cliente;
  const [f, setF] = useState({
    nombre:          cliente?.nombre                        ?? '',
    apellido:        cliente?.apellido                      ?? '',
    whatsapp:        fmtTel(cliente?.whatsapp               ?? ''),
    email:           cliente?.email                         ?? '',
    fechaNacimiento: isoToDisplay(cliente?.fechaNacimiento),
    sexo:            cliente?.sexo                          ?? '',
    cedula:          cliente?.cedula                        ?? '',
    direccion:       cliente?.direccion                     ?? '',
    alergias:        cliente?.alergias                      ?? '',
    notas:           cliente?.notas                         ?? '',
  });
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof f>(k: K, v: string) {
    setF(s => ({ ...s, [k]: v }));
  }

  const guardar = useMutation({
    mutationFn: () => {
      const body: any = { nombre: f.nombre };
      (['apellido','email','sexo','cedula','direccion','alergias','notas'] as const)
        .forEach(k => { if ((f[k] as string)?.trim()) body[k] = (f[k] as string).trim(); });
      if (f.whatsapp.trim()) body.whatsapp = f.whatsapp.trim();
      if (f.fechaNacimiento.trim()) {
        const iso = displayToISO(f.fechaNacimiento);
        if (iso) body.fechaNacimiento = iso;
      }
      return esEditar
        ? api.patch(`/clientes/${cliente!.id}`, body)
        : api.post('/clientes', body);
    },
    onSuccess: () => onSaved(),
    onError: () => setErr('No se pudo guardar el cliente.'),
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.handle} />
        <div className={styles.formHead}>
          <h3 className={styles.formTitle}>{esEditar ? 'Editar cliente' : 'Nuevo cliente'}</h3>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
            <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className={styles.form}>
          <In label="Nombre *"            v={f.nombre}          on={v => set('nombre', v)} />
          <In label="Apellido"            v={f.apellido}        on={v => set('apellido', v)} />
          <In label="WhatsApp"            v={f.whatsapp}        on={v => set('whatsapp', fmtTel(v))}   placeholder="XXX-XXX-XXXX" inputMode="tel" />
          <In label="Correo"              v={f.email}           on={v => set('email', v)}               type="email" />
          <In label="Fecha de nacimiento" v={f.fechaNacimiento} on={v => set('fechaNacimiento', fmtFecha(v))} placeholder="dd/mm/aaaa" inputMode="numeric" />
          <div>
            <div className={styles.inLbl}>Sexo</div>
            <select className={styles.inInput} value={f.sexo} onChange={e => set('sexo', e.target.value)}>
              <option value="">—</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
              <option value="OTRO">Otro</option>
            </select>
          </div>
          <In label="Cédula"     v={f.cedula}    on={v => set('cedula', v)} />
          <In label="Dirección"  v={f.direccion} on={v => set('direccion', v)} />
          <In label="Alergias"   v={f.alergias}  on={v => set('alergias', v)} />
          <In label="Notas"      v={f.notas}     on={v => set('notas', v)} />
        </div>

        {err && <div className={styles.err}>{err}</div>}

        <button
          className={styles.saveBtn}
          disabled={!f.nombre.trim() || guardar.isPending}
          onClick={() => { setErr(null); guardar.mutate(); }}
        >
          {guardar.isPending ? 'Guardando…' : esEditar ? 'Guardar cambios' : 'Crear cliente'}
        </button>
      </div>
    </div>
  );
}

function In({
  label, v, on, type = 'text', placeholder, inputMode,
}: {
  label: string; v: string; on: (v: string) => void;
  type?: string; placeholder?: string; inputMode?: string;
}) {
  return (
    <div>
      <div className={styles.inLbl}>{label}</div>
      <input
        className={styles.inInput}
        type={type}
        value={v}
        onChange={e => on(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode as React.HTMLAttributes<HTMLInputElement>['inputMode']}
      />
    </div>
  );
}
