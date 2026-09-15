import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  type AuditItem,
  MODULOS_AUDITORIA,
  ACCIONES_AGRUPADAS,
  moduloLabel,
  accionLabel,
  formatTitulo,
  formatDetalle,
} from './formatEntry';
import styles from './AuditoriaPage.module.css';

interface UsuarioLite { id: string; nombre: string; }
interface AuditResponse {
  items: AuditItem[];
  total: number;
  page: number;
  pageSize: number;
}

function fmtFecha(iso: string): { fecha: string; hora: string } {
  const d = new Date(iso);
  return {
    fecha: d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }),
    hora: d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }),
  };
}

const ACCION_TONO: Record<string, string> = {
  VOID: 'err', CANCEL: 'err', DEACTIVATE: 'err',
  CREATE: 'ok', ACTIVATE: 'ok', PAY: 'ok',
  UPDATE: 'info', CHANGE_ROLE: 'warn', RESCHEDULE: 'info',
};

export function AuditoriaPage() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [modulo, setModulo] = useState('');
  const [accion, setAccion] = useState('');
  const [page, setPage] = useState(1);
  const [abierto, setAbierto] = useState<string | null>(null);
  // En celular los filtros arrancan colapsados (son 5 campos — mostrarlos
  // siempre empujaba toda la lista bajo el pliegue). En escritorio esto no
  // aplica — el CSS los mantiene visibles sin importar este estado.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  const { data: usuarios } = useQuery<UsuarioLite[]>({
    queryKey: ['auditoria-usuarios'],
    queryFn: () => api.get('/usuarios').then((r) => r.data),
  });

  const params = { desde: desde || undefined, hasta: hasta || undefined, usuarioId: usuarioId || undefined, modulo: modulo || undefined, accion: accion || undefined, page, pageSize: 25 };

  const { data, isFetching } = useQuery<AuditResponse>({
    queryKey: ['auditoria', params],
    queryFn: () => api.get('/auditoria', { params }).then((r) => r.data),
  });

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function limpiarFiltros() {
    setDesde(''); setHasta(''); setUsuarioId(''); setModulo(''); setAccion(''); setPage(1);
  }
  function conFiltro<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1); };
  }
  const cantidadFiltros = [desde, hasta, usuarioId, modulo, accion].filter(Boolean).length;
  const hayFiltros = cantidadFiltros > 0;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Auditoría</h1>
        <p className={styles.sub}>Historial de actividad sensible del negocio — quién hizo qué y cuándo. Solo visible para el propietario.</p>
      </div>

      {/* Solo visible en celular (CSS) — en escritorio los filtros ya están
          siempre a la vista, este botón no hace falta ahí. */}
      <button
        type="button"
        className={styles.filtrosToggle}
        onClick={() => setFiltrosAbiertos((v) => !v)}
      >
        <span>
          Filtros{cantidadFiltros > 0 && <span className={styles.filtrosBadge}>{cantidadFiltros}</span>}
        </span>
        <svg className={`${styles.chevron} ${filtrosAbiertos ? styles.chevronOpen : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className={`${styles.filtros} ${filtrosAbiertos ? styles.filtrosAbiertos : ''}`}>
        <div className={styles.filtroGrupo}>
          <label>Desde</label>
          <input type="date" value={desde} onChange={(e) => conFiltro(setDesde)(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.filtroGrupo}>
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => conFiltro(setHasta)(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.filtroGrupo}>
          <label>Usuario</label>
          <select value={usuarioId} onChange={(e) => conFiltro(setUsuarioId)(e.target.value)} className={styles.select}>
            <option value="">Todos</option>
            {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div className={styles.filtroGrupo}>
          <label>Módulo</label>
          <select value={modulo} onChange={(e) => conFiltro(setModulo)(e.target.value)} className={styles.select}>
            <option value="">Todos</option>
            {MODULOS_AUDITORIA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className={styles.filtroGrupo}>
          <label>Acción</label>
          <select value={accion} onChange={(e) => conFiltro(setAccion)(e.target.value)} className={styles.select}>
            <option value="">Todas</option>
            {ACCIONES_AGRUPADAS.map((g) => (
              <optgroup key={g.grupo} label={g.grupo}>
                {g.opciones.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {hayFiltros && (
          <button type="button" className={styles.limpiarBtn} onClick={limpiarFiltros}>Limpiar filtros</button>
        )}
      </div>

      <div className={styles.panel}>
        {isFetching && !data ? (
          <div className={styles.estadoMsg}>Cargando…</div>
        ) : !data || data.items.length === 0 ? (
          <div className={styles.estadoMsg}>
            {hayFiltros ? 'No hay actividad que coincida con estos filtros.' : 'Todavía no hay actividad registrada.'}
          </div>
        ) : (
          <>
            <div className={styles.lista}>
              {data.items.map((item) => {
                const { fecha, hora } = fmtFecha(item.createdAt);
                const detalle = formatDetalle(item);
                const expandido = abierto === item.id;
                return (
                  <div key={item.id} className={styles.fila}>
                    <button
                      type="button"
                      className={styles.filaHead}
                      onClick={() => setAbierto(expandido ? null : item.id)}
                    >
                      <div className={styles.filaFecha}>
                        <span>{fecha}</span>
                        <small>{hora}</small>
                      </div>
                      <div className={styles.filaMeta}>
                        <div className={styles.filaUsuario}>{item.usuarioNombre}</div>
                        <div className={styles.filaModulo}>{moduloLabel(item.modulo)}</div>
                      </div>
                      <span className={`${styles.chip} ${styles[`chip_${ACCION_TONO[item.accion] ?? 'default'}`]}`}>
                        {accionLabel(item.accion)}
                      </span>
                      <div className={styles.filaTitulo}>{formatTitulo(item)}</div>
                      <svg className={`${styles.chevron} ${expandido ? styles.chevronOpen : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {expandido && (
                      <div className={styles.detalle}>
                        {detalle.length === 0 ? (
                          <span className={styles.detalleVacio}>Sin detalle adicional.</span>
                        ) : (
                          detalle.map((d) => (
                            <div key={d.label} className={styles.detalleRow}>
                              <span className={styles.detalleLabel}>{d.label}</span>
                              <span className={styles.detalleValue}>{d.value}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.paginacion}>
              <span className={styles.paginacionInfo}>
                {data.total} registro{data.total === 1 ? '' : 's'} · página {data.page} de {totalPaginas}
              </span>
              <div className={styles.paginacionBtns}>
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={styles.pagBtn}>← Anterior</button>
                <button type="button" disabled={page >= totalPaginas} onClick={() => setPage((p) => p + 1)} className={styles.pagBtn}>Siguiente →</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
