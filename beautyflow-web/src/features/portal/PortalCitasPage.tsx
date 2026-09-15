import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '../../lib/portalApi';
import { PortalShell } from './PortalShell';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import styles from './PortalCitasPage.module.css';

// Estados reales del backend (uppercase)
type EstadoCita = 'CONFIRMADA' | 'PROGRAMADA' | 'EN_PROGRESO' | 'COMPLETADA' | 'CANCELADA';

interface Cita {
  id: string;
  fecha: string;
  hora: string;
  empleado: string;
  servicios: string[];
  estado: EstadoCita;
  total: number;
}

const LABELS: Record<string, string> = {
  CONFIRMADA:  'Confirmada',
  PROGRAMADA:  'Programada',
  EN_PROGRESO: 'En progreso',
  COMPLETADA:  'Completada',
  CANCELADA:   'Cancelada',
};

const BADGE_CLASS: Record<string, string> = {
  CONFIRMADA:  styles.stConfirmada,
  PROGRAMADA:  styles.stProgramada,
  EN_PROGRESO: styles.stEnProgreso,
  COMPLETADA:  styles.stCompletada,
  CANCELADA:   styles.stCancelada,
};

function fmtFecha(f: string) {
  const d = new Date(f + 'T12:00:00');
  const dias  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}`;
}

function fmtMoney(n: number) {
  return `RD$ ${(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PortalCitasPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [cancelId, setCancelId] = useState<string | null>(null);

  const { data: citas = [], isLoading } = useQuery<Cita[]>({
    queryKey: ['portal-mis-citas'],
    queryFn: () => portalApi.get('/portal/mis-citas').then(r => r.data),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => portalApi.patch(`/portal/citas/${id}/cancelar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-mis-citas'] });
      qc.invalidateQueries({ queryKey: ['portal-dashboard'] });
      setCancelId(null);
    },
  });

  const citaAConfirmar = citas.find(c => c.id === cancelId);

  const canCancel = (c: Cita) =>
    c.estado === 'CONFIRMADA' || c.estado === 'PROGRAMADA';

  return (
    <PortalShell>
      <div className={styles.page}>

        {/* Header */}
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => navigate('/portal')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <h1>Mis citas</h1>
          <ThemeToggleButton className={styles.themeBtn} />
        </div>

        {/* Lista */}
        <div className={styles.list}>
          {isLoading ? (
            <div className={styles.loadWrap}><span className={styles.spinner} /></div>
          ) : citas.length === 0 ? (
            <div className={styles.empty}>No tienes citas registradas</div>
          ) : (
            citas.map(c => (
              <div key={c.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.cardServs}>{c.servicios.join(', ')}</div>
                  <span className={`${styles.badge} ${BADGE_CLASS[c.estado] ?? ''}`}>
                    {LABELS[c.estado] ?? c.estado}
                  </span>
                </div>
                <div className={styles.cardMeta}>
                  <span className={styles.metaItem}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="17" rx="2"/>
                      <path d="M3 9h18M8 2v4M16 2v4"/>
                    </svg>
                    {fmtFecha(c.fecha)}
                  </span>
                  <span className={styles.metaItem}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
                    </svg>
                    {c.hora}
                  </span>
                </div>
                <div className={styles.cardEmp}>con {c.empleado}</div>
                <div className={styles.cardFoot}>
                  <span className={styles.precio}>{fmtMoney(c.total)}</span>
                  {canCancel(c) && (
                    <button className={styles.cancelBtn} onClick={() => setCancelId(c.id)}>
                      Cancelar cita
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal confirmación cancelación */}
        {cancelId && citaAConfirmar && (
          <div className={styles.overlay}>
            <div className={styles.modal}>
              <h3>¿Cancelar cita?</h3>
              <p>
                {citaAConfirmar.servicios.join(', ')} el {fmtFecha(citaAConfirmar.fecha)} a las {citaAConfirmar.hora}.
                Esta acción no se puede deshacer.
              </p>
              <div className={styles.modalBtns}>
                <button
                  className={styles.btnConfirm}
                  disabled={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate(cancelId)}
                >
                  {cancelMutation.isPending ? 'Cancelando…' : 'Sí, cancelar cita'}
                </button>
                <button className={styles.btnBack} onClick={() => setCancelId(null)}>
                  Volver
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </PortalShell>
  );
}
