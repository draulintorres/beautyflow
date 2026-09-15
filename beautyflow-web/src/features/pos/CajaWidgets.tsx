import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import styles from './CajaWidgets.module.css';

export interface CajaAbierta {
  aperturaId: string;
  cajaId: string;
  cajaNombre: string;
  montoInicial: number;
  fechaApertura: string;
}
interface Caja { id: string; nombre: string; sucursalId: string; }
interface CajaEstado { cajaAbierta: CajaAbierta | null; cajas: Caja[]; }

/** Estado de caja compartido — usado por PosPage y PosMobile por igual. */
export function useCajaEstado() {
  return useQuery<CajaEstado>({
    queryKey: ['caja-estado'],
    queryFn: () => api.get('/caja/estado').then(r => r.data),
  });
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}

/** Franja compacta de estado de caja + botón abrir/cerrar. Mismo componente
 *  para desktop y móvil — el CSS se adapta solo. */
export function CajaEstadoBar() {
  const { data } = useCajaEstado();
  const [modal, setModal] = useState<'abrir' | 'cerrar' | null>(null);

  if (!data) return null;
  const { cajaAbierta } = data;

  return (
    <>
      <div className={`${styles.bar} ${cajaAbierta ? styles.barOn : styles.barOff}`}>
        {cajaAbierta ? (
          <>
            <span className={styles.dot} />
            <span>Caja abierta · {cajaAbierta.cajaNombre} · desde {fmtHora(cajaAbierta.fechaApertura)} · fondo RD$ {formatMoney(cajaAbierta.montoInicial)}</span>
            <button className={styles.barBtn} onClick={() => setModal('cerrar')}>Cerrar caja</button>
          </>
        ) : (
          <>
            <span className={styles.dot} />
            <span>Caja cerrada — abre con el fondo inicial antes de cobrar</span>
            <button className={styles.barBtn} onClick={() => setModal('abrir')}>Abrir caja</button>
          </>
        )}
      </div>

      {modal === 'abrir' && <AbrirCajaModal cajas={data.cajas} onClose={() => setModal(null)} />}
      {modal === 'cerrar' && cajaAbierta && <CerrarCajaModal apertura={cajaAbierta} onClose={() => setModal(null)} />}
    </>
  );
}

function AbrirCajaModal({ cajas, onClose }: { cajas: Caja[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [monto, setMonto] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const abrir = useMutation({
    mutationFn: () => api.post('/caja/abrir', { cajaId, montoInicial: Number(monto) || 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-estado'] });
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setErr(Array.isArray(msg) ? msg[0] : (msg ?? 'No se pudo abrir la caja.'));
    },
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h3>Abrir caja</h3>
        {cajas.length === 0 ? (
          <p className={styles.errMsg}>No hay ninguna caja registrada para esta empresa. Créala primero en Sucursales/Ajustes.</p>
        ) : (
          <>
            {cajas.length > 1 && (
              <label className={styles.field}>
                <span>Caja</span>
                <select value={cajaId} onChange={e => setCajaId(e.target.value)}>
                  {cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </label>
            )}
            <label className={styles.field}>
              <span>Fondo inicial (efectivo con el que arranca)</span>
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={monto}
                onChange={e => setMonto(e.target.value.replace(/[^0-9.]/g, ''))}
                autoFocus
              />
            </label>
            {err && <p className={styles.errMsg}>{err}</p>}
          </>
        )}
        <div className={styles.foot}>
          <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button
            className={styles.btnOk}
            disabled={cajas.length === 0 || !cajaId || abrir.isPending}
            onClick={() => abrir.mutate()}
          >
            {abrir.isPending ? 'Abriendo…' : 'Abrir caja'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CerrarCajaModal({ apertura, onClose }: { apertura: CajaAbierta; onClose: () => void }) {
  const qc = useQueryClient();
  const [contado, setContado] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [resultado, setResultado] = useState<any | null>(null);

  const { data: resumen } = useQuery<any>({
    queryKey: ['caja-resumen', apertura.aperturaId],
    queryFn: () => api.get(`/caja/${apertura.aperturaId}/resumen`).then(r => r.data),
  });

  const cerrar = useMutation({
    mutationFn: () => api.post(`/caja/${apertura.aperturaId}/cerrar`, { efectivoContado: Number(contado) || 0 }).then(r => r.data),
    onSuccess: (data) => {
      setResultado(data.arqueo);
      qc.invalidateQueries({ queryKey: ['caja-estado'] });
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setErr(Array.isArray(msg) ? msg[0] : (msg ?? 'No se pudo cerrar la caja.'));
    },
  });

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h3>Cerrar caja — {apertura.cajaNombre}</h3>

        {resultado ? (
          <>
            <div className={styles.arqueo}>
              <div className={styles.arqRow}><span>Fondo inicial</span><b>RD$ {formatMoney(resultado.montoInicial)}</b></div>
              <div className={styles.arqRow}><span>Ventas en efectivo</span><b>RD$ {formatMoney(resultado.efectivoVentas)}</b></div>
              {resultado.efectivoInquilinosPorCaja > 0 && (
                <div className={styles.arqRow}>
                  <span>· de las cuales, de inquilino(s)</span>
                  <b>RD$ {formatMoney(resultado.efectivoInquilinosPorCaja)}</b>
                </div>
              )}
              <div className={styles.arqRow}><span>Efectivo esperado</span><b>RD$ {formatMoney(resultado.efectivoEsperado)}</b></div>
              <div className={styles.arqRow}><span>Efectivo contado</span><b>RD$ {formatMoney(resultado.efectivoContado)}</b></div>
              <div className={`${styles.arqRow} ${styles.arqDiff} ${resultado.diferencia === 0 ? '' : (resultado.diferencia > 0 ? styles.arqPos : styles.arqNeg)}`}>
                <span>Diferencia</span>
                <b>{resultado.diferencia > 0 ? '+' : ''}RD$ {formatMoney(resultado.diferencia)}</b>
              </div>
              {resultado.totalFiao > 0 && (
                <div className={styles.arqRow}><span>Fiado (crédito pendiente)</span><b>RD$ {formatMoney(resultado.totalFiao)}</b></div>
              )}
            </div>
            <div className={styles.foot}>
              <button className={styles.btnOk} onClick={onClose}>Listo</button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.arqueo}>
              <div className={styles.arqRow}><span>Fondo inicial</span><b>RD$ {formatMoney(apertura.montoInicial)}</b></div>
              <div className={styles.arqRow}><span>Facturado en esta sesión</span><b>RD$ {formatMoney(resumen?.totalFacturado ?? 0)}</b></div>
              <div className={styles.arqRow}><span>Ventas registradas</span><b>{resumen?.numVentas ?? 0}</b></div>
              {resumen?.totalInquilinosPorCaja > 0 && (
                <div className={styles.arqRow}>
                  <span>· de inquilino(s), en caja</span>
                  <b>RD$ {formatMoney(resumen.totalInquilinosPorCaja)}</b>
                </div>
              )}
            </div>
            <label className={styles.field}>
              <span>Efectivo contado físicamente ahora</span>
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={contado}
                onChange={e => setContado(e.target.value.replace(/[^0-9.]/g, ''))}
                autoFocus
              />
            </label>
            {err && <p className={styles.errMsg}>{err}</p>}
            <div className={styles.foot}>
              <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
              <button className={styles.btnOk} disabled={cerrar.isPending} onClick={() => cerrar.mutate()}>
                {cerrar.isPending ? 'Cerrando…' : 'Cerrar caja y hacer arqueo'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
