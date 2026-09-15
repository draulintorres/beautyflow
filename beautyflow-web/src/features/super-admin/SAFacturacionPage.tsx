import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { saApi } from '../../lib/saApi';
import styles from './SAFacturacionPage.module.css';

/* ─── Tipos ─── */
interface Factura {
  id: string; empresaId: string; monto: string; periodo: string;
  fechaEmision: string; fechaVencimiento: string; fechaPago: string | null;
  status: 'PENDIENTE' | 'PAGADA' | 'VENCIDA' | 'ANULADA';
  subscription?: { empresa?: { nombre: string; slug: string } };
}

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  PENDIENTE: { label: 'Pendiente', cls: 'stPend' },
  PAGADA:    { label: 'Pagada',    cls: 'stPag'  },
  VENCIDA:   { label: 'Vencida',   cls: 'stVenc' },
  ANULADA:   { label: 'Anulada',   cls: 'stAnul' },
};
const FILTROS = ['TODAS', 'PENDIENTE', 'PAGADA', 'VENCIDA'] as const;

function fmtMonto(m: string | number) {
  return Number(m).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPeriodo(p: string) {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const [a, m] = p.split('-');
  return `${meses[parseInt(m, 10) - 1] ?? m} ${a}`;
}
function fmtFecha(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
}

/* ─── Página ─── */
export function SAFacturacionPage() {
  const qc = useQueryClient();
  const [filtro, setFiltro]     = useState<typeof FILTROS[number]>('TODAS');
  const [confirm, setConfirm]   = useState<null | { tipo: 'generar' | 'pagar' | 'morosas'; factura?: Factura }>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const { data: facturas = [], isLoading } = useQuery<Factura[]>({
    queryKey: ['sa-facturas', filtro],
    queryFn: () =>
      saApi.get('/admin/facturas', {
        params: filtro === 'TODAS' ? {} : { status: filtro },
      }).then(r => r.data),
  });

  /* KPIs — query independiente siempre sin filtro */
  const { data: todas = [] } = useQuery<Factura[]>({
    queryKey: ['sa-facturas', 'TODAS'],
    queryFn: () => saApi.get('/admin/facturas').then(r => r.data),
  });
  const totalFacturado  = todas.reduce((s, f) => s + Number(f.monto), 0);
  const pendienteCobro  = todas.filter(f => f.status === 'PENDIENTE' || f.status === 'VENCIDA')
                               .reduce((s, f) => s + Number(f.monto), 0);
  const numVencidas     = todas.filter(f => f.status === 'VENCIDA').length;

  /* Mutaciones */
  const generarMes = useMutation({
    mutationFn: () => saApi.post('/admin/facturas/generar-mes').then(r => r.data),
    onSuccess: (res: { generadas?: number }) => {
      setResultMsg(`Se generaron ${res.generadas ?? 0} factura(s) del mes.`);
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['sa-facturas'] });
    },
    onError: () => { setResultMsg('No se pudo generar la facturación del mes.'); setConfirm(null); },
  });

  const pagar = useMutation({
    mutationFn: (facturaId: string) =>
      saApi.post('/admin/facturas/pagar', { facturaId }).then(r => r.data),
    onSuccess: () => {
      setResultMsg('Pago registrado. La empresa fue reactivada si estaba suspendida.');
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['sa-facturas'] });
      qc.invalidateQueries({ queryKey: ['sa-empresas'] });
    },
    onError: () => { setResultMsg('No se pudo registrar el pago.'); setConfirm(null); },
  });

  const suspenderMorosas = useMutation({
    mutationFn: () => saApi.post('/admin/jobs/suspender-morosas').then(r => r.data),
    onSuccess: (res: { suspendidas?: number }) => {
      setResultMsg(`Se suspendieron ${res.suspendidas ?? 0} empresa(s) por mora.`);
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['sa-facturas'] });
      qc.invalidateQueries({ queryKey: ['sa-empresas'] });
    },
    onError: () => { setResultMsg('No se pudo ejecutar la suspensión de morosas.'); setConfirm(null); },
  });

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Facturación SaaS</h1>
          <p className={styles.sub}>Cobro de suscripciones de la plataforma</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnSecondary} onClick={() => setConfirm({ tipo: 'morosas' })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <path d="M12 9v4M12 17h.01"/>
            </svg>
            Suspender morosas
          </button>
          <button className={styles.btnNew} onClick={() => setConfirm({ tipo: 'generar' })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Generar facturación del mes
          </button>
        </div>
      </div>

      {/* ── Banner de resultado ── */}
      {resultMsg && (
        <div className={styles.resultBanner}>
          <span>{resultMsg}</span>
          <button onClick={() => setResultMsg(null)}>×</button>
        </div>
      )}

      {/* ── KPIs ── */}
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span className={styles.kpiLbl}>Total facturado</span>
          <span className={styles.kpiVal}>RD$ {fmtMonto(totalFacturado)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLbl}>Pendiente de cobro</span>
          <span className={`${styles.kpiVal} ${styles.kpiWarn}`}>RD$ {fmtMonto(pendienteCobro)}</span>
        </div>
        <div className={`${styles.kpi} ${numVencidas > 0 ? styles.kpiCardWarn : ''}`}>
          <span className={styles.kpiLbl}>Facturas vencidas</span>
          <span className={`${styles.kpiVal} ${numVencidas > 0 ? styles.kpiErr : ''}`}>{numVencidas}</span>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className={styles.filters}>
        {FILTROS.map(f => (
          <button
            key={f}
            className={filtro === f ? styles.fActive : ''}
            onClick={() => setFiltro(f)}
          >
            {f === 'TODAS' ? 'Todas' : (STATUS_INFO[f]?.label ?? f)}
          </button>
        ))}
      </div>

      {/* ── Tabla ── */}
      <div className={styles.tableCard}>
        {isLoading ? (
          <div className={styles.loadWrap}><span className={styles.spinner} /></div>
        ) : facturas.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No hay facturas en esta vista.</p>
            <p className={styles.emptyHint}>
              Usa "Generar facturación del mes" para emitir las facturas de las empresas activas.
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Período</th>
                  <th>Monto</th>
                  <th>Vencimiento</th>
                  <th>Fecha pago</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {facturas.map(f => {
                  const st = STATUS_INFO[f.status] ?? STATUS_INFO.PENDIENTE;
                  const empNombre = f.subscription?.empresa?.nombre ?? '—';
                  return (
                    <tr key={f.id}>
                      <td className={styles.empName}>{empNombre}</td>
                      <td>{fmtPeriodo(f.periodo)}</td>
                      <td className={styles.monto}>RD$ {fmtMonto(f.monto)}</td>
                      <td className={styles.fecha}>{fmtFecha(f.fechaVencimiento)}</td>
                      <td className={styles.fecha}>{fmtFecha(f.fechaPago)}</td>
                      <td>
                        <span className={`${styles.stBadge} ${styles[st.cls as keyof typeof styles]}`}>
                          {st.label}
                        </span>
                      </td>
                      <td>
                        {(f.status === 'PENDIENTE' || f.status === 'VENCIDA') && (
                          <button
                            className={styles.payBtn}
                            onClick={() => setConfirm({ tipo: 'pagar', factura: f })}
                          >
                            Registrar pago
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modales de confirmación ── */}
      {confirm?.tipo === 'generar' && (
        <ConfirmModal
          title="Generar facturación del mes"
          confirmLabel="Generar facturas"
          confirmStyle="primary"
          loading={generarMes.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => generarMes.mutate()}
        >
          <p>Se generará una factura de suscripción para cada empresa activa, según el precio de su plan, para el mes actual.</p>
          <p className={styles.modalNote}>
            Esta acción es segura de repetir: si ya existen facturas de este mes, no se duplicarán.
          </p>
        </ConfirmModal>
      )}

      {confirm?.tipo === 'pagar' && confirm.factura && (
        <ConfirmModal
          title="Registrar pago"
          confirmLabel="Confirmar pago"
          confirmStyle="primary"
          loading={pagar.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => pagar.mutate(confirm.factura!.id)}
        >
          <p>Vas a registrar el pago de:</p>
          <div className={styles.confirmBox}>
            <div className={styles.cbRow}>
              <span>Empresa</span>
              <b>{confirm.factura.subscription?.empresa?.nombre ?? '—'}</b>
            </div>
            <div className={styles.cbRow}>
              <span>Período</span>
              <b>{fmtPeriodo(confirm.factura.periodo)}</b>
            </div>
            <div className={styles.cbRow}>
              <span>Monto</span>
              <b>RD$ {fmtMonto(confirm.factura.monto)}</b>
            </div>
          </div>
          <p className={styles.modalNote}>
            La factura quedará pagada, se renovará la suscripción y, si la empresa estaba
            suspendida por mora, se reactivará automáticamente.
          </p>
        </ConfirmModal>
      )}

      {confirm?.tipo === 'morosas' && (
        <ConfirmModal
          title="Suspender empresas morosas"
          confirmLabel="Suspender morosas"
          confirmStyle="danger"
          loading={suspenderMorosas.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => suspenderMorosas.mutate()}
        >
          <p className={styles.dangerText}>
            ⚠ Esta acción suspenderá a TODAS las empresas que tengan facturas pendientes ya vencidas.
          </p>
          <p>Sus usuarios no podrán acceder hasta que se registre el pago o las reactives manualmente.</p>
          <p className={styles.modalNote}>
            Es reversible: puedes reactivar cada empresa desde la sección Empresas, o registrar
            su pago aquí (que también la reactiva).
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}

/* ─── Modal de confirmación reutilizable ─── */
function ConfirmModal({ title, children, confirmLabel, confirmStyle, loading, onCancel, onConfirm }: {
  title: string; children: ReactNode; confirmLabel: string;
  confirmStyle: 'primary' | 'danger'; loading: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>{title}</h3>
          <button onClick={onCancel}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className={styles.modalBody}>{children}</div>
        <div className={styles.modalFoot}>
          <button className={styles.btnCancel} onClick={onCancel} disabled={loading}>Cancelar</button>
          <button
            className={confirmStyle === 'danger' ? styles.btnDanger : styles.btnSave}
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
