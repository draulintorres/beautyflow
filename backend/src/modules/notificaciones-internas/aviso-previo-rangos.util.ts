/**
 * Lógica pura (sin Prisma) del aviso previo de cita -- separada para
 * poder probarla sin base de datos. `Cita.inicio` es naive (dígitos de
 * RD etiquetados como UTC); `ahoraReal` es un instante real (`new
 * Date()`). Comparar uno contra el otro directamente es el bug que esto
 * reemplaza -- `ahoraReal` SIEMPRE se convierte a su equivalente naive
 * (`ahoraNaiveRD`) antes de comparar contra `Cita.inicio`.
 */
import { ahoraNaiveRD } from '../../core/common/fecha-rd.util';

export interface VentanaAvisoPrevio {
  gte: Date;
  /** Ausente en modo "ignorar ventana" (dev): sin cota superior. */
  lt?: Date;
}

/**
 * Ventana [gte, lt) -- en el esquema naive, comparable directo contra
 * Cita.inicio -- donde debe caer el inicio de una cita para que le
 * toque el aviso de "N minutos antes" en esta corrida del cron.
 */
export function ventanaAvisoPrevio(
  ahoraReal: Date,
  minutosAvisoCita: number,
  intervaloCronMin: number,
  respetarVentana: boolean,
): VentanaAvisoPrevio {
  const ahoraNaive = ahoraNaiveRD(ahoraReal);
  if (!respetarVentana) return { gte: ahoraNaive };
  const gte = new Date(ahoraNaive.getTime() + minutosAvisoCita * 60_000);
  const lt = new Date(gte.getTime() + intervaloCronMin * 60_000);
  return { gte, lt };
}

/** Umbral naive para "citas cuyo inicio ya pasó" -- comparable directo
 * contra Cita.inicio. */
export function umbralCitaPasada(ahoraReal: Date): Date {
  return ahoraNaiveRD(ahoraReal);
}

/** Minutos reales hasta el inicio de la cita, para el texto del aviso
 * ("En N min: ..."). Nunca negativo. */
export function minutosHastaLaCita(citaInicio: Date, ahoraReal: Date): number {
  return Math.max(0, Math.round((citaInicio.getTime() - ahoraNaiveRD(ahoraReal).getTime()) / 60_000));
}
