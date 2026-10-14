import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import styles from './AgendaPage.module.css';

/**
 * Roles que pueden completar un cobro (POST /facturas) — lista única
 * compartida entre escritorio y móvil para decidir si se muestra
 * "Cobrar"/"Finalizar y cobrar". RECEPCION queda afuera a propósito: puede
 * mover el estado de una cita (PATCH /citas/:id/estado lo permite), pero el
 * backend ya rechaza su POST /facturas con 403 — mostrarle el botón solo
 * para que falle al final sería peor que no mostrarlo.
 */
export const ROLES_QUE_PUEDEN_COBRAR = ['OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'ALQUILER'];

export const MOTIVOS_SIN_COBRO: { value: string; label: string }[] = [
  { value: 'CORTESIA', label: 'Cortesía' },
  { value: 'CLIENTE_NO_PAGO', label: 'Cliente no pagó' },
  { value: 'OTRO', label: 'Otro' },
];

/**
 * Formas mínimas que necesita este módulo — tanto el detalle de cita de
 * escritorio como el de móvil satisfacen esto de sobra (tipado
 * estructural), sin acoplarse a la interfaz `Cita`/`Empleado` completa de
 * ninguno de los dos.
 */
export interface CitaParaAccion {
  id: string;
  fecha: string;
  horaInicio: string;
  cliente?: { id: string } | null;
  empleado?: { id: string; nombre: string } | null;
  servicios: { servicioId: string; nombre: string; precio: number }[];
}
export interface EmpleadoParaAccion {
  id: string;
  nombre: string;
  activo: boolean;
  participaAgenda: boolean;
  esCuentaDueno?: boolean;
}

/**
 * Arma el estado de navegación para precargar el POS desde una cita
 * ("Cobrar"). NO usa POST /facturas/from-cita/:citaId — esa ruta deja la
 * venta en OPEN/"BORRADOR" y hoy ninguna pantalla la completa. Esto solo
 * precarga el carrito; la venta real nace al confirmar en el POS normal,
 * igual que cualquier venta manual.
 *
 * `citaId` viaja en el estado para que el POS lo mande de vuelta en
 * `POST /facturas` — es el candado "una venta por cita" (Parte B): el
 * backend rechaza una segunda venta activa para la misma cita.
 */
export function citaToPosState(cita: CitaParaAccion) {
  return {
    citaId: cita.id,
    clienteId: cita.cliente?.id ?? null,
    citaLineas: cita.servicios.map((s) => ({
      servicioId: s.servicioId,
      nombre: s.nombre,
      precio: s.precio,
      empleadoId: cita.empleado?.id,
    })),
  };
}

/**
 * Editar/reprogramar una cita — compartido entre el detalle de escritorio y
 * el de móvil (antes vivía solo en AgendaPage.tsx; móvil tenía su propia
 * versión más simple, sin selector de empleado, sin bloqueo para
 * inquilinos y sin mostrar el error real del backend en conflictos de
 * horario). Un solo componente, un solo comportamiento en los dos.
 */
export function ReprogramarModal({
  cita,
  empleados,
  soyInquilino,
  onClose,
  onSuccess,
}: {
  cita: CitaParaAccion;
  empleados: EmpleadoParaAccion[];
  soyInquilino: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fecha, setFecha] = useState(cita.fecha);
  const [horaInicio, setHoraInicio] = useState(cita.horaInicio);
  const [empleadoId, setEmpleadoId] = useState(cita.empleado?.id ?? '');
  const [err, setErr] = useState('');

  // esCuentaDueno excluido: mismo criterio que NuevaCitaMobile.tsx.
  const empleadosActivos = empleados.filter((e) => e.activo && e.participaAgenda !== false && !e.esCuentaDueno);

  const reprogramar = useMutation({
    mutationFn: () => api.patch(`/citas/${cita.id}/reprogramar`, {
      fecha, horaInicio,
      // Un inquilino nunca reasigna su cita a otro empleado — el backend lo
      // fuerza igual, pero ni se le muestra la opción.
      ...(soyInquilino ? {} : { empleadoId }),
    }).then((r) => r.data),
    onSuccess: () => onSuccess(),
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setErr(typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.join(' · ') : 'No se pudo reprogramar la cita.');
    },
  });

  return (
    <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>Editar cita</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          <label className={styles.modalField}>
            <span>Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label className={styles.modalField}>
            <span>Hora</span>
            <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
          </label>
          <label className={styles.modalField}>
            <span>Empleado</span>
            {soyInquilino ? (
              <div className={styles.modalFieldLocked}>{cita.empleado?.nombre ?? 'Tú'}</div>
            ) : (
              <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}>
                {empleadosActivos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            )}
          </label>
          {err && <p className={styles.modalErr}>{err}</p>}
        </div>
        <div className={styles.modalFoot}>
          <button type="button" className={styles.modalBtnCancel} onClick={onClose} disabled={reprogramar.isPending}>
            Cancelar
          </button>
          <button
            type="button" className={styles.modalBtnSave}
            disabled={!fecha || !horaInicio || reprogramar.isPending}
            onClick={() => { setErr(''); reprogramar.mutate(); }}
          >
            {reprogramar.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "Finalizar sin cobrar" — cortesía/servicio gratis/cliente que no pagó.
 * Solo OWNER/ADMIN (el backend lo exige igual, esto es para no mostrar un
 * botón que va a fallar). Pide motivo obligatorio + nota opcional en vez de
 * un confirm() nativo, mismo cascarón de modal que ReprogramarModal arriba
 * — no se inventa un sistema de modales nuevo.
 */
interface ClienteFiao {
  id: string;
  permiteFiao: boolean;
  limiteCredito: number;
  balancePendiente: number;
}

export function FinalizarSinCobroModal({
  citaId,
  total,
  clienteId,
  esInquilino,
  onClose,
  onSuccess,
}: {
  citaId: string;
  /** Total de la cita — se muestra en el aviso de "Cliente no pagó" y se
   * usa para calcular si excede el límite de crédito del cliente. */
  total: number;
  clienteId?: string | null;
  /** Si el empleado de la cita es un inquilino, "Cliente no pagó" no se
   * ofrece — su cobro pendiente se maneja desde su propio POS (fiao). */
  esInquilino: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [err, setErr] = useState('');

  const motivosDisponibles = esInquilino
    ? MOTIVOS_SIN_COBRO.filter((m) => m.value !== 'CLIENTE_NO_PAGO')
    : MOTIVOS_SIN_COBRO;

  // Solo se consulta cuando hace falta avisar sobre fiao/límite — no para
  // Cortesía/Otro, que no tocan nada del cliente.
  const { data: cliente } = useQuery<ClienteFiao>({
    queryKey: ['cliente-fiao', clienteId],
    queryFn: () => api.get(`/clientes/${clienteId}`).then((r) => r.data),
    enabled: motivo === 'CLIENTE_NO_PAGO' && !!clienteId,
    staleTime: 30_000,
  });
  const excedeLimite =
    !!cliente && cliente.balancePendiente + total > cliente.limiteCredito + 0.01;
  const disponible = cliente ? Math.max(0, cliente.limiteCredito - cliente.balancePendiente) : 0;

  const finalizar = useMutation({
    mutationFn: () => api.patch(`/citas/${citaId}/finalizar-sin-cobro`, {
      motivo,
      ...(nota.trim() ? { nota: nota.trim() } : {}),
    }).then((r) => r.data),
    onSuccess: () => onSuccess(),
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      setErr(typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.join(' · ') : 'No se pudo finalizar sin cobro.');
    },
  });

  return (
    <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>Finalizar sin cobrar</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          {motivo === 'CLIENTE_NO_PAGO' ? (
            <p>
              Se registrará una deuda del cliente por <b>RD$ {formatMoney(total)}</b> en
              Cuentas por Cobrar — la cita queda Finalizada con esa venta pendiente.
              Esta acción queda registrada en Auditoría.
            </p>
          ) : (
            <p>
              Se marcará como Finalizada sin generar ninguna venta — úsalo solo para
              cortesías o servicios gratuitos. Esta acción queda registrada en Auditoría.
            </p>
          )}
          <label className={styles.modalField}>
            <span>Motivo</span>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="" disabled>Elige un motivo…</option>
              {motivosDisponibles.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          {motivo === 'CLIENTE_NO_PAGO' && cliente && !cliente.permiteFiao && (
            <p className={styles.modalErr}>
              Este cliente no tiene crédito (fiao) habilitado en su ficha — igual se
              registrará la deuda.
            </p>
          )}
          {motivo === 'CLIENTE_NO_PAGO' && excedeLimite && (
            <p className={styles.modalErr}>
              Esto supera su límite de crédito (disponible: RD$ {formatMoney(disponible)}) —
              igual se registrará.
            </p>
          )}
          <label className={styles.modalField}>
            <span>Nota (opcional)</span>
            <textarea
              value={nota}
              maxLength={200}
              rows={2}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Detalle breve, si hace falta…"
            />
          </label>
          {err && <p className={styles.modalErr}>{err}</p>}
        </div>
        <div className={styles.modalFoot}>
          <button type="button" className={styles.modalBtnCancel} onClick={onClose} disabled={finalizar.isPending}>
            Cancelar
          </button>
          <button
            type="button" className={styles.modalBtnSave}
            disabled={!motivo || finalizar.isPending}
            onClick={() => { setErr(''); finalizar.mutate(); }}
          >
            {finalizar.isPending ? 'Guardando…' : 'Sí, finalizar sin cobrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
