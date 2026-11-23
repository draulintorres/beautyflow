import { Logger } from '@nestjs/common';

/**
 * Buena parte del cálculo de fechas del proyecto (esquema "naive" de
 * Cita.inicio/fin, ver fecha-rd.util.ts) asume que el proceso de Node
 * corre con TZ=UTC -- si no, los dígitos de hora que el usuario tipeó para
 * RD dejarían de quedar guardados "tal cual". En producción esto debe
 * tumbar el arranque; en desarrollo (donde las máquinas suelen estar en
 * UTC-4) solo se avisa, porque romper el arranque local sería más
 * disruptivo que útil.
 *
 * `offsetMinutos` es inyectable para pruebas -- por defecto usa
 * `Date.prototype.getTimezoneOffset()` del proceso real.
 */
export function validateProcessTimezone(
  env: NodeJS.ProcessEnv = process.env,
  offsetMinutos: number = new Date().getTimezoneOffset(),
): void {
  if (offsetMinutos === 0) return;

  const mensaje =
    `El proceso de Node no está corriendo en UTC (offset de zona horaria detectado: ${offsetMinutos} minutos). ` +
    'El esquema de fechas de citas (ver fecha-rd.util.ts) asume TZ=UTC -- con otra zona horaria, ' +
    'las horas de cita guardadas no van a coincidir con lo que el usuario tipeó.';

  if (env.NODE_ENV === 'production') {
    throw new Error(mensaje);
  }
  Logger.warn(mensaje, 'ValidateProcessTimezone');
}
