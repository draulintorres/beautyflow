import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '../../lib/portalApi';
import { formatMoney } from '../../lib/format';
import { usePortalAuth } from '../../store/portalAuth';
import { PortalShell } from './PortalShell';
import { PortalNav } from './PortalNav';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import styles from './PortalDashboardPage.module.css';

interface Dashboard {
  nombre: string;
  proximaCita: {
    id: string;
    fecha: string;
    hora: string;
    empleado: string;
    servicios: string[];
    estado: string;
  } | null;
  totalGastado: number;
  puntos: number;
  membresiaActiva: { nombre: string; vence: string } | null;
  balancePendiente: number;
  limiteCredito: number;
}

function fmtFechaLarga(f: string) {
  const d = new Date(f + 'T12:00:00');
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]}`;
}

function fmtVence(iso: string) {
  const d = new Date(iso);
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
}

function initiales(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}


export function PortalDashboardPage() {
  const navigate = useNavigate();
  const logout = usePortalAuth((s) => s.logout);

  const { data, isLoading } = useQuery<Dashboard>({
    queryKey: ['portal-dashboard'],
    queryFn: () => portalApi.get('/portal/dashboard').then(r => r.data),
  });

  function handleLogout() {
    logout();
    navigate('/portal/login', { replace: true });
  }

  const primerNombre = data?.nombre?.split(' ')[0] ?? '…';

  return (
    <PortalShell>
      <div className={styles.page}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.brand}>
              <div className={styles.brandMark}>✦</div>
              <span>Estixa</span>
            </div>
            <div className={styles.headerActions}>
              <ThemeToggleButton className={styles.iconBtn} />
              <button className={styles.iconBtn} onClick={handleLogout} title="Cerrar sesión">
                <svg viewBox="0 0 24 24">
                  <path d="M16 17l5-5-5-5M21 12H9M12 19H5a2 2 0 01-2-2V7a2 2 0 012-2h7"/>
                </svg>
              </button>
            </div>
          </div>
          <div className={styles.greet}>
            <small>Bienvenida de nuevo</small>
            <h1>Hola, <span>{primerNombre}</span> 👋</h1>
          </div>
        </div>

        {/* ── Body ── */}
        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.loadWrap}><span className={styles.spinner} /></div>
          ) : (
            <>
              {/* Próxima cita */}
              <p className={styles.secLabel}>Tu próxima cita</p>

              {data?.proximaCita ? (
                <div className={styles.nextCard} onClick={() => navigate('/portal/citas')}>
                  <div className={styles.naTag}>Próxima cita</div>
                  <div className={styles.naSvc}>{data.proximaCita.servicios.join(' + ')}</div>
                  <div className={styles.naWhen}>
                    <svg viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="17" rx="2"/>
                      <path d="M3 9h18M8 2v4M16 2v4"/>
                    </svg>
                    {fmtFechaLarga(data.proximaCita.fecha)} · <strong>{data.proximaCita.hora}</strong>
                  </div>
                  <div className={styles.naEmp}>
                    <div className={styles.naAv}>{initiales(data.proximaCita.empleado)}</div>
                    <div>
                      <b>{data.proximaCita.empleado}</b>
                      <small>Sucursal Principal</small>
                    </div>
                  </div>
                  <div className={styles.naActions}>
                    <button className={styles.naResch}>Reagendar</button>
                    <button
                      className={styles.naCancel}
                      onClick={e => { e.stopPropagation(); navigate('/portal/citas'); }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.noNext}>
                  <div className={styles.noNextIco}>
                    <svg viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="17" rx="2"/>
                      <path d="M3 9h18M8 2v4M16 2v4M12 13v4M10 15h4"/>
                    </svg>
                  </div>
                  <p>No tienes citas próximas</p>
                  <small>Agenda tu próxima visita con un clic</small>
                  <button onClick={() => navigate('/portal/reservar')}>Reservar ahora →</button>
                </div>
              )}

              {/* CTA Reservar */}
              <button className={styles.ctaReservar} onClick={() => navigate('/portal/reservar')}>
                <div className={styles.ctaIco}>
                  <svg viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="17" rx="2"/>
                    <path d="M8 2v4M16 2v4M3 9h18M12 13v4M10 15h4"/>
                  </svg>
                </div>
                <div className={styles.ctaTxt}>
                  <b>Reservar una cita</b>
                  <small>Elige servicio, profesional y hora</small>
                </div>
                <span className={styles.ctaArrow}>→</span>
              </button>

              {/* Stats rápidas */}
              <div className={styles.quickStats}>
                <div className={styles.qs}>
                  <div className={styles.qv}>{(data?.puntos ?? 0).toLocaleString('es-DO')}</div>
                  <div className={styles.ql}>Puntos</div>
                </div>
                <div className={styles.qs}>
                  <div className={styles.qv}>RD$ {formatMoney(data?.totalGastado ?? 0)}</div>
                  <div className={styles.ql}>Total gastado</div>
                </div>
                <div className={styles.qs}>
                  <div className={styles.qv}>RD$ {formatMoney(data?.limiteCredito ?? 0)}</div>
                  <div className={styles.ql}>Crédito</div>
                </div>
              </div>

              {/* Membresía */}
              <p className={styles.secLabel}>Tu membresía</p>
              <div className={styles.membCard} onClick={() => navigate('/portal/membresias')}>
                {data?.membresiaActiva ? (
                  <>
                    <div className={styles.membTop}>
                      <div className={styles.membName}>
                        <span className={styles.crown}>♛</span>
                        {data.membresiaActiva.nombre}
                      </div>
                      <span className={styles.membBadge}>Activa</span>
                    </div>
                    <div className={styles.membVence}>
                      Vence el {fmtVence(data.membresiaActiva.vence)}
                    </div>
                    <div className={styles.membLink}>Ver beneficios →</div>
                  </>
                ) : (
                  <>
                    <div className={styles.membTop}>
                      <div className={styles.membName}>
                        <span className={styles.crown}>♛</span>
                        Sin membresía activa
                      </div>
                    </div>
                    <div className={styles.membLink}>Conocer planes →</div>
                  </>
                )}
              </div>

              {/* Accesos rápidos */}
              <p className={styles.secLabel}>Mi cuenta</p>
              <div className={styles.accessGrid}>
                <button className={styles.acc} onClick={() => navigate('/portal/citas')}>
                  <div className={styles.ai}>
                    <svg viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
                    </svg>
                  </div>
                  <b>Historial</b>
                  <small>Tus visitas anteriores</small>
                </button>
                <button className={styles.acc} onClick={() => navigate('/portal/facturas')}>
                  <div className={styles.ai}>
                    <svg viewBox="0 0 24 24">
                      <path d="M6 2h9l4 4v16H6z"/><path d="M9 12h6M9 16h4"/>
                    </svg>
                  </div>
                  <b>Facturas</b>
                  <small>Tus comprobantes</small>
                </button>
                <button className={styles.acc} onClick={() => navigate('/portal/puntos')}>
                  <div className={styles.ai}>
                    <svg viewBox="0 0 24 24">
                      <path d="M3 17l3-9 4 5 2-8 2 8 4-5 3 9z"/>
                    </svg>
                  </div>
                  <b>Puntos</b>
                  <small>{(data?.puntos ?? 0).toLocaleString('es-DO')} disponibles</small>
                </button>
                <button className={styles.acc} onClick={() => navigate('/portal/perfil')}>
                  <div className={styles.ai}>
                    <svg viewBox="0 0 24 24">
                      <circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
                    </svg>
                  </div>
                  <b>Mi perfil</b>
                  <small>Datos y preferencias</small>
                </button>
              </div>
            </>
          )}
        </div>

        <PortalNav active="inicio" />
      </div>
    </PortalShell>
  );
}
