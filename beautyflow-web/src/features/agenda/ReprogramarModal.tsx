import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import styles from './AgendaPage.module.css';

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
