import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, downloadPdf } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useAuthStore } from '../../store/auth';
import { ReprogramarModal, citaToPosState } from './ReprogramarModal';
import styles from './AgendaMobile.module.css';
import { NuevaCitaMobile } from './NuevaCitaMobile';

interface Cita {
  id: string; fecha: string; horaInicio: string; horaFin: string; estado: string;
  cliente?: { id: string; nombre: string; telefono?: string; whatsapp?: string };
  empleado?: { id: string; nombre: string };
  servicios: { servicioId: string; nombre: string; precio: number }[];
  total: number; notas?: string | null;
  // Candado "una venta por cita" (Parte B): solo no-null si hay una venta
  // ACTIVA ligada.
  venta?: { id: string; estado: string } | null;
}
interface Empleado { id: string; nombre: string; activo: boolean; participaAgenda: boolean; esCuentaDueno?: boolean; }

type Filtro = 'TODAS' | 'CONFIRMADA' | 'PENDIENTE' | 'EN_PROCESO' | 'CANCELADA';

const ESTADO_LBL: Record<string, string> = {
  PENDIENTE: 'Pendiente', CONFIRMADA: 'Confirmada', EN_PROCESO: 'En proceso',
  FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada', NO_ASISTIO: 'No asistió',
};
const ESTADO_CLS: Record<string, string> = {
  PENDIENTE: 'pend', CONFIRMADA: 'ok', EN_PROCESO: 'info',
  FINALIZADA: 'done', CANCELADA: 'canc', NO_ASISTIO: 'canc',
};
function lbl(e: string) { return ESTADO_LBL[e] ?? e.charAt(0) + e.slice(1).toLowerCase().replace(/_/g, ' '); }
function ini(n?: string) { return (n ?? '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
function toAmPm(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function toISO(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

export function AgendaMobile() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [fecha, setFecha] = useState<Date>(() => new Date());
  const [sel, setSel] = useState<Cita | null>(null);
  const [reprog, setReprog] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [nuevaCita, setNuevaCita] = useState(false);

  const authUser = useAuthStore(s => s.user);
  const soyInquilino = authUser?.rol === 'ALQUILER';

  const { data: empleados = [] } = useQuery<Empleado[]>({
    queryKey: ['empleados'],
    queryFn: () => api.get('/empleados').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const fechaISO = toISO(fecha);
  const { data: citas = [], isLoading } = useQuery<Cita[]>({
    queryKey: ['agenda-mobile', fechaISO],
    queryFn: () => api.get('/citas', { params: { fecha: fechaISO } }).then(r => r.data),
  });
  const { data: misDeudas = [] } = useQuery<{ saldo: number }[]>({
    queryKey: ['mis-deudas-alquiler'],
    queryFn: () => api.get('/alquiler/deudas').then(r => r.data),
    enabled: soyInquilino,
    staleTime: 60_000,
  });
  const totalMeDeben = misDeudas.reduce((s, d) => s + Number(d.saldo), 0);
  // "Ingreso de hoy": dinero REAL (ventas PAGADA), distinto de "Proyectado"
  // (citas agendadas) que sigue igual abajo. El backend filtra por rol.
  const { data: ingresoHoyData } = useQuery<{ ingresoHoy: number }>({
    queryKey: ['ingreso-hoy', fechaISO],
    queryFn: () => api.get('/citas/ingreso-hoy', { params: { fecha: fechaISO } }).then(r => r.data),
  });
  const ingresoHoy = ingresoHoyData?.ingresoHoy ?? 0;

  const ordenadas = [...citas].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  const visibles = ordenadas.filter(c => filtro === 'TODAS' ? true : c.estado === filtro);

  const noCanceladas = citas.filter(c => c.estado !== 'CANCELADA');
  const resumen = {
    citasHoy: citas.length,
    pendientes: citas.filter(c => c.estado === 'PENDIENTE').length,
    proyectado: noCanceladas.reduce((s, c) => s + (c.total ?? 0), 0),
    clientes: new Set(citas.map(c => c.cliente?.id).filter((id): id is string => Boolean(id))).size,
  };
  const conteos: Record<Filtro, number> = {
    TODAS: citas.length,
    CONFIRMADA: citas.filter(c => c.estado === 'CONFIRMADA').length,
    PENDIENTE: citas.filter(c => c.estado === 'PENDIENTE').length,
    EN_PROCESO: citas.filter(c => c.estado === 'EN_PROCESO').length,
    CANCELADA: citas.filter(c => c.estado === 'CANCELADA').length,
  };

  // 7 días centrados en hoy
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(hoy); d.setDate(hoy.getDate() + i - 1); return d;
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) =>
      api.patch(`/citas/${id}/estado`, { estado }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agenda-mobile'] }); setSel(null); },
  });
  const cancelar = useMutation({
    mutationFn: (id: string) => api.patch(`/citas/${id}/cancelar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agenda-mobile'] }); setSel(null); },
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1>Agenda</h1>
        <div className={styles.fechaLbl}>{DIAS[fecha.getDay()]}, {fecha.getDate()} de {MESES[fecha.getMonth()]}</div>
      </div>

      {/* Selector de días */}
      <div className={styles.dias}>
        {dias.map((d) => {
          const activo = toISO(d) === fechaISO;
          const esHoy = toISO(d) === toISO(hoy);
          return (
            <button
              key={toISO(d)}
              className={`${styles.dia} ${activo ? styles.diaActivo : ''}`}
              onClick={() => setFecha(new Date(d))}
            >
              <span className={styles.diaNom}>{DIAS[d.getDay()]}</span>
              <span className={styles.diaNum}>{d.getDate()}</span>
              {esHoy && <span className={styles.diaHoy} />}
            </button>
          );
        })}
      </div>

      {/* Resumen del día */}
      <div className={styles.resumen}>
        <div className={styles.resCard}>
          <div className={styles.resIco}>
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>
          </div>
          <span className={styles.resLbl}>Citas hoy</span>
          <span className={styles.resVal}>{resumen.citasHoy}</span>
        </div>
        <div className={styles.resCard}>
          <div className={styles.resIco}>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
          </div>
          <span className={styles.resLbl}>Pendientes</span>
          <span className={styles.resVal}>{resumen.pendientes}</span>
        </div>
        <div className={styles.resCard}>
          <div className={styles.resIco}>
            <svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
          </div>
          <span className={styles.resLbl}>Proyectado</span>
          <span className={styles.resVal}>RD$ {formatMoney(resumen.proyectado)}</span>
        </div>
        <div className={styles.resCard}>
          <div className={styles.resIco}>
            <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <span className={styles.resLbl}>Ingreso de hoy</span>
          <span className={`${styles.resVal} ${styles.resValOk}`}>RD$ {formatMoney(ingresoHoy)}</span>
        </div>
        <div className={styles.resCard}>
          <div className={styles.resIco}>
            <svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M3 21c0-4 3-6 6-6"/><circle cx="17" cy="9" r="3"/><path d="M21 21c0-3-2-5-4-5"/></svg>
          </div>
          <span className={styles.resLbl}>Clientes</span>
          <span className={styles.resVal}>{resumen.clientes}</span>
        </div>
        {soyInquilino && (
          <div className={styles.resCard}>
            <div className={styles.resIco}>
              <svg viewBox="0 0 24 24"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            </div>
            <span className={styles.resLbl}>Le debes al negocio</span>
            <span className={styles.resVal}>RD$ {formatMoney(totalMeDeben)}</span>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className={styles.filtros}>
        {([
          ['TODAS', 'Todas'], ['CONFIRMADA', 'Conf.'], ['PENDIENTE', 'Pend.'],
          ['EN_PROCESO', 'En proc.'], ['CANCELADA', 'Canc.'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            className={`${styles.filtro} ${filtro === key ? styles.filtroActivo : ''}`}
            onClick={() => setFiltro(key)}
          >
            {label} <span className={styles.filtroNum}>{conteos[key]}</span>
          </button>
        ))}
      </div>

      {/* Lista de citas */}
      <div className={styles.list}>
        {isLoading ? (
          <div className={styles.loadWrap}><span className={styles.spinner} /></div>
        ) : visibles.length === 0 ? (
          <div className={styles.empty}>
            {filtro !== 'TODAS' ? 'No hay citas en este estado' : 'No hay citas para este día'}
          </div>
        ) : (
          visibles.map(c => (
            <div key={c.id} className={styles.card} onClick={() => { setSel(c); setReprog(false); }}>
              <div className={styles.cardHora}>{toAmPm(c.horaInicio)}</div>
              <div className={styles.cardAvatar}>{ini(c.cliente?.nombre)}</div>
              <div className={styles.cardInfo}>
                <div className={styles.cardCliente}>{c.cliente?.nombre ?? 'Cliente'}</div>
                <div className={styles.cardServ}>{c.servicios.map(s => s.nombre).join(', ')}</div>
                <div className={styles.cardEmp}>{c.empleado?.nombre ?? ''}</div>
              </div>
              <div className={styles.cardRight}>
                <span className={`${styles.badge} ${styles[ESTADO_CLS[c.estado] ?? 'pend']}`}>{lbl(c.estado)}</span>
                <svg className={styles.chev} viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
              </div>
            </div>
          ))
        )}
      </div>

      {/* FAB Nueva cita */}
      <button className={styles.fab} onClick={() => setNuevaCita(true)}>
        + Nueva cita
      </button>

      {/* Detalle de cita (bottom sheet) */}
      {sel && !reprog && (
        <div className={styles.overlay} onClick={() => setSel(null)}>
          <div className={styles.sheet} onClick={e => e.stopPropagation()}>
            <div className={styles.handle} />
            <div className={styles.detHead}>
              <div className={styles.detAvatar}>{ini(sel.cliente?.nombre)}</div>
              <div>
                <div className={styles.detCliente}>{sel.cliente?.nombre}</div>
                <span className={`${styles.badge} ${styles[ESTADO_CLS[sel.estado] ?? 'pend']}`}>
                  {lbl(sel.estado)}
                </span>
              </div>
            </div>
            <div className={styles.detRows}>
              <div className={styles.detRow}><span>🕐 Hora</span><b>{toAmPm(sel.horaInicio)} – {toAmPm(sel.horaFin)}</b></div>
              <div className={styles.detRow}><span>💇 Servicio</span><b>{sel.servicios.map(s => s.nombre).join(', ')}</b></div>
              <div className={styles.detRow}><span>👤 Atiende</span><b>{sel.empleado?.nombre ?? '—'}</b></div>
              <div className={styles.detRow}><span>💵 Total</span><b>RD$ {formatMoney(sel.total)}</b></div>
              {sel.notas && <div className={styles.detNota}>📝 {sel.notas}</div>}
            </div>

            {sel.venta && (
              <div className={styles.yaCobrada}>
                <span>✓ Ya cobrada</span>
                <button onClick={() => downloadPdf(`/facturas/${sel.venta!.id}/recibo`, 'recibo.pdf')}>
                  Ver recibo
                </button>
              </div>
            )}

            <div className={styles.detActions}>
              {sel.estado === 'PENDIENTE' && (
                <button
                  className={styles.actOk}
                  disabled={cambiarEstado.isPending}
                  onClick={() => cambiarEstado.mutate({ id: sel.id, estado: 'CONFIRMADA' })}
                >
                  Confirmar
                </button>
              )}
              {(sel.estado === 'CONFIRMADA' || sel.estado === 'PENDIENTE') && (
                <button
                  className={styles.actInfo}
                  disabled={cambiarEstado.isPending}
                  onClick={() => cambiarEstado.mutate({ id: sel.id, estado: 'EN_PROCESO' })}
                >
                  Marcar en proceso
                </button>
              )}
              {sel.estado === 'EN_PROCESO' && (
                <button
                  className={styles.actOk}
                  disabled={cambiarEstado.isPending}
                  onClick={() => cambiarEstado.mutate({ id: sel.id, estado: 'FINALIZADA' })}
                >
                  Finalizar
                </button>
              )}
              {!sel.venta && (sel.estado === 'CONFIRMADA' || sel.estado === 'PENDIENTE') && (
                <button
                  className={styles.actOk}
                  onClick={() => navigate('/pos', { state: citaToPosState(sel) })}
                >
                  Cobrar
                </button>
              )}
              {(sel.cliente?.whatsapp || sel.cliente?.telefono) && (
                <a
                  className={styles.actWa}
                  href={`https://wa.me/1${(sel.cliente.whatsapp || sel.cliente.telefono)!.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              )}
              {sel.estado !== 'CANCELADA' && sel.estado !== 'FINALIZADA' && (
                <button className={styles.actReprog} onClick={() => setReprog(true)}>
                  Editar / reprogramar
                </button>
              )}
              {sel.estado !== 'CANCELADA' && sel.estado !== 'FINALIZADA' && (
                <button
                  className={styles.actCancel}
                  disabled={cancelar.isPending}
                  onClick={() => { if (confirm('¿Cancelar esta cita?')) cancelar.mutate(sel.id); }}
                >
                  Cancelar cita
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Editar / reprogramar — mismo modal compartido con escritorio */}
      {sel && reprog && (
        <ReprogramarModal
          cita={sel}
          empleados={empleados}
          soyInquilino={soyInquilino}
          onClose={() => setReprog(false)}
          onSuccess={() => {
            setReprog(false);
            setSel(null);
            qc.invalidateQueries({ queryKey: ['agenda-mobile'] });
          }}
        />
      )}

      {/* Nueva cita */}
      {nuevaCita && (
        <NuevaCitaMobile
          fechaInicial={fechaISO}
          onClose={() => setNuevaCita(false)}
          onDone={() => setNuevaCita(false)}
        />
      )}
    </div>
  );
}
