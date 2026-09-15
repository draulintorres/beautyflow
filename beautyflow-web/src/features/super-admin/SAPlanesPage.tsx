import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { saApi } from '../../lib/saApi';
import { formatMoney } from '../../lib/format';
import styles from './SAPlanesPage.module.css';

interface Plan {
  id: string; nombre: string; tipo: string; precio: string;
  maxUsuarios: number | null; maxSucursales: number | null; maxEmpleados: number | null;
  modulos: string[]; activo: boolean; orden: number;
}

const TIPOS = ['TRIAL', 'BASIC', 'PRO', 'ENTERPRISE'] as const;
const TIPO_LABEL: Record<string, string> = {
  TRIAL: 'Trial', BASIC: 'Básico', PRO: 'Pro', ENTERPRISE: 'Enterprise',
};
// Los 5 módulos GATEABLES reales del sistema (ver MODULOS_GATEABLES en
// permisos.matrix.ts del backend) — antes esta lista tenía features que no
// existen (Marketing, WhatsApp, Membresías) y ni siquiera las claves
// correctas de las que sí existen (comparaba 'COMISIONES' en mayúscula
// contra el valor real 'comisiones'), así que los badges nunca reflejaban
// el gating real.
const MODULOS = ['cobros', 'comisiones', 'inventario', 'reportes', 'sucursales'] as const;
const MODULO_LABEL: Record<string, string> = {
  cobros: 'Cobros', comisiones: 'Comisiones', inventario: 'Inventario',
  reportes: 'Reportes', sucursales: 'Sucursales',
};

function fmtPrecio(p: string) { return formatMoney(Number(p)); }
function fmtLimite(n: number | null) { return n === null ? '∞' : String(n); }

export function SAPlanesPage() {
  const qc = useQueryClient();
  const [modalCrear, setModalCrear] = useState(false);
  const [editando, setEditando]     = useState<Plan | null>(null);

  const { data: planes = [], isLoading } = useQuery<Plan[]>({
    queryKey: ['sa-planes'],
    queryFn: () => saApi.get('/admin/planes').then(r => r.data),
  });

  const planesOrdenados = [...planes].sort((a, b) => a.orden - b.orden);

  function invalidar() { qc.invalidateQueries({ queryKey: ['sa-planes'] }); }

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Planes SaaS</h1>
          <p className={styles.sub}>Define los planes de suscripción de la plataforma</p>
        </div>
        <button className={styles.btnNew} onClick={() => setModalCrear(true)}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Nuevo plan
        </button>
      </div>

      {/* ── Tarjetas ── */}
      {isLoading ? (
        <div className={styles.loadWrap}><span className={styles.spinner} /></div>
      ) : (
        <div className={styles.cardsGrid}>
          {planesOrdenados.map(p => {
            const esDestacado = p.tipo === 'PRO';
            return (
            <div
              key={p.id}
              className={`${styles.planCard} ${!p.activo ? styles.inactive : ''} ${esDestacado ? styles.destacado : ''}`}
            >
              {esDestacado && (
                <div className={styles.popularBadge}>⭐ MÁS POPULAR</div>
              )}

              <div className={styles.planTop}>
                <div>
                  <span className={styles.planTipo}>{TIPO_LABEL[p.tipo] ?? p.tipo}</span>
                  <h3 className={styles.planNombre}>{p.nombre}</h3>
                </div>
                {!p.activo && <span className={styles.inactiveBadge}>Inactivo</span>}
              </div>

              <div className={styles.precio}>
                <span className={styles.precioMonto}>RD$ {fmtPrecio(p.precio)}</span>
                <span className={styles.precioMes}>/mes</span>
              </div>

              <div className={styles.limites}>
                <div className={styles.limRow}><span>Usuarios</span><b>{fmtLimite(p.maxUsuarios)}</b></div>
                <div className={styles.limRow}><span>Sucursales</span><b>{fmtLimite(p.maxSucursales)}</b></div>
                <div className={styles.limRow}><span>Empleados</span><b>{fmtLimite(p.maxEmpleados)}</b></div>
              </div>

              <div className={styles.modulos}>
                {MODULOS.map(m => (
                  <span
                    key={m}
                    className={`${styles.modChip} ${p.modulos.includes(m) ? styles.modOn : styles.modOff}`}
                  >
                    {p.modulos.includes(m) ? '✓' : '×'} {MODULO_LABEL[m]}
                  </span>
                ))}
              </div>

              <button className={styles.editBtn} onClick={() => setEditando(p)}>
                <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
                Editar plan
              </button>
            </div>
            );
          })}
        </div>
      )}

      {/* ── Modales ── */}
      {modalCrear && (
        <PlanModal
          onClose={() => setModalCrear(false)}
          onSaved={() => { setModalCrear(false); invalidar(); }}
        />
      )}
      {editando && (
        <PlanModal
          plan={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); invalidar(); }}
        />
      )}
    </div>
  );
}

/* ─── Modal crear / editar ─── */
function PlanModal({
  plan, onClose, onSaved,
}: { plan?: Plan; onClose: () => void; onSaved: () => void }) {
  const esEditar = !!plan;

  const [form, setForm] = useState({
    nombre:         plan?.nombre ?? '',
    tipo:           plan?.tipo   ?? 'BASIC',
    precio:         plan ? Number(plan.precio) : 0,
    maxUsuarios:    plan?.maxUsuarios    ?? 5,
    ilimUsuarios:   plan ? plan.maxUsuarios    === null : false,
    maxSucursales:  plan?.maxSucursales  ?? 1,
    ilimSucursales: plan ? plan.maxSucursales  === null : false,
    maxEmpleados:   plan?.maxEmpleados   ?? 10,
    ilimEmpleados:  plan ? plan.maxEmpleados   === null : false,
    modulos:        plan?.modulos  ?? [] as string[],
    activo:         plan?.activo   ?? true,
    orden:          plan?.orden    ?? 0,
  });
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }
  function toggleModulo(m: string) {
    setForm(f => ({
      ...f,
      modulos: f.modulos.includes(m) ? f.modulos.filter(x => x !== m) : [...f.modulos, m],
    }));
  }

  const guardar = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        nombre:  form.nombre,
        tipo:    form.tipo,
        precio:  Number(form.precio),
        modulos: form.modulos,
        activo:  form.activo,
        orden:   Number(form.orden),
        // En PATCH enviamos null explícito para volver ilimitado un límite que ya tenía número
        maxUsuarios:   form.ilimUsuarios   ? null : Number(form.maxUsuarios),
        maxSucursales: form.ilimSucursales ? null : Number(form.maxSucursales),
        maxEmpleados:  form.ilimEmpleados  ? null : Number(form.maxEmpleados),
      };
      // En POST, omitir el campo si es ilimitado (en lugar de enviar null)
      if (!esEditar) {
        if (form.ilimUsuarios)   delete body.maxUsuarios;
        if (form.ilimSucursales) delete body.maxSucursales;
        if (form.ilimEmpleados)  delete body.maxEmpleados;
      }
      if (esEditar) return saApi.patch(`/admin/planes/${plan!.id}`, body).then(r => r.data);
      return saApi.post('/admin/planes', body).then(r => r.data);
    },
    onSuccess: () => onSaved(),
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { message?: string | string[] } } };
      const msg = ax?.response?.data?.message;
      setErr(Array.isArray(msg) ? msg.join(' · ') : (msg ?? 'No se pudo guardar el plan.'));
    },
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={ev => ev.stopPropagation()}>

        <div className={styles.modalHead}>
          <h3>{esEditar ? 'Editar plan' : 'Nuevo plan'}</h3>
          <button onClick={onClose}>
            <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className={styles.modalBody}>

          <div className={styles.formGrid}>
            <L label="Nombre *">
              <input value={form.nombre} onChange={e => set('nombre', e.target.value)} />
            </L>
            <L label="Tipo *">
              <select value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                {TIPOS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
              </select>
            </L>
            <L label="Precio mensual (RD$) *">
              <input
                type="number" min={0}
                value={form.precio}
                onChange={e => set('precio', Number(e.target.value))}
              />
            </L>
            <L label="Orden (posición)">
              <input
                type="number" min={0}
                value={form.orden}
                onChange={e => set('orden', Number(e.target.value))}
              />
            </L>
          </div>

          <div className={styles.sectionLbl}>Límites</div>
          <div className={styles.limitsForm}>
            <LimiteField
              label="Usuarios" value={form.maxUsuarios} ilim={form.ilimUsuarios}
              onValue={v => set('maxUsuarios', v)} onIlim={v => set('ilimUsuarios', v)}
            />
            <LimiteField
              label="Sucursales" value={form.maxSucursales} ilim={form.ilimSucursales}
              onValue={v => set('maxSucursales', v)} onIlim={v => set('ilimSucursales', v)}
            />
            <LimiteField
              label="Empleados" value={form.maxEmpleados} ilim={form.ilimEmpleados}
              onValue={v => set('maxEmpleados', v)} onIlim={v => set('ilimEmpleados', v)}
            />
          </div>

          <div className={styles.sectionLbl}>Módulos incluidos</div>
          <div className={styles.chips}>
            {MODULOS.map(m => (
              <button
                key={m} type="button"
                className={`${styles.chip} ${form.modulos.includes(m) ? styles.chipOn : ''}`}
                onClick={() => toggleModulo(m)}
              >
                {MODULO_LABEL[m]}
              </button>
            ))}
          </div>

          <div className={styles.activoRow}>
            <label>
              <input
                type="checkbox"
                checked={form.activo}
                onChange={e => set('activo', e.target.checked)}
              />
              Plan activo (disponible para asignar a empresas)
            </label>
          </div>

          {esEditar && (
            <p className={styles.editWarn}>
              ⚠ Cambiar el precio o los límites afecta a las empresas que ya tienen este plan.
            </p>
          )}
          {err && <p className={styles.modalErr}>{err}</p>}
        </div>

        <div className={styles.modalFoot}>
          <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button
            className={styles.btnSave}
            disabled={!form.nombre.trim() || guardar.isPending}
            onClick={() => { setErr(null); guardar.mutate(); }}
          >
            {guardar.isPending ? 'Guardando…' : (esEditar ? 'Guardar cambios' : 'Crear plan')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Campo de límite con checkbox Ilimitado ─── */
function LimiteField({ label, value, ilim, onValue, onIlim }: {
  label: string; value: number; ilim: boolean;
  onValue: (v: number) => void; onIlim: (v: boolean) => void;
}) {
  return (
    <div className={styles.limField}>
      <div className={styles.limLbl}>{label}</div>
      <div className={styles.limControls}>
        <input
          type="number" min={0} value={value} disabled={ilim}
          onChange={e => onValue(Number(e.target.value))}
          className={ilim ? styles.disabledInput : ''}
        />
        <label className={styles.ilimCheck}>
          <input type="checkbox" checked={ilim} onChange={e => onIlim(e.target.checked)} />
          Ilimitado
        </label>
      </div>
    </div>
  );
}

/* ─── Helper: campo con label ─── */
function L({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}
