/**
 * Utilidades de fecha para calcular "hoy" en la hora de República Dominicana
 * sin importar en qué zona horaria corre el proceso de Node (en Render, por
 * defecto UTC).
 *
 * Contexto importante: el resto del código (creación de citas en
 * agenda.service.ts, `hhmm()`, `dateToMin()` en disponibilidad.service.ts,
 * etc.) construye y lee horas de citas con `new Date(\`${fecha}T${hora}:00\`)`
 * y `d.getHours()/getMinutes()` — SIN sufijo de zona horaria. Como el
 * servidor corre en UTC, esto graba y relee las citas usando los dígitos de
 * hora de RD "tal cual", tratados como si fueran UTC (una hora "14:00" que
 * el usuario tipeó para las 2pm de RD queda literalmente en 14:00:00 UTC en
 * la base de datos, no en las 18:00:00 UTC que serían la conversión real).
 * Es un esquema "naive" pero autoconsistente: mientras TODO el código lea y
 * escriba con el mismo criterio (dígitos = hora de RD, etiquetados como
 * UTC), todo calza. Por eso acá el rango de un día también se arma con "Z"
 * (UTC) y NO con "-04:00": usar el offset real desalinearía el rango 4
 * horas respecto a como está guardado todo lo demás.
 *
 * Lo único que SÍ hay que calcular con la hora real de RD es "¿qué fecha
 * calendario es HOY?" (`fechaHoyRD`) — ahí es donde estaba el bug: código
 * que preguntaba "hoy" con `new Date()` + `setHours(0,0,0,0)` usaba el
 * calendario del SERVIDOR (UTC), que entre ~8:00pm y medianoche hora RD ya
 * había cruzado al día siguiente aunque en RD todavía fuera "hoy". Esto
 * hacía que dos cálculos de "hoy" en el mismo momento (ej. el contador de
 * citas del Dashboard vs. la lista de citas del día, que recibe la fecha ya
 * calculada por el navegador) usaran rangos de día distintos y mostraran
 * resultados contradictorios cada noche.
 */

/** Fecha-calendario de "hoy" en RD (UTC-4, sin horario de verano), como "YYYY-MM-DD". */
export function fechaHoyRD(): string {
  const desplazada = new Date(Date.now() - 4 * 60 * 60 * 1000);
  return desplazada.toISOString().slice(0, 10);
}

/**
 * Rango [inicio, fin] de un día calendario "YYYY-MM-DD", en el mismo
 * esquema "naive" (dígitos de RD etiquetados como UTC) que usa el resto del
 * código para guardar horas de citas. `fin` es el último milisegundo del
 * día (23:59:59.999).
 */
export function rangoDiaRD(fecha: string): { inicio: Date; fin: Date } {
  return {
    inicio: new Date(`${fecha}T00:00:00.000Z`),
    fin: new Date(`${fecha}T23:59:59.999Z`),
  };
}

/**
 * Día de la semana (0=dom..6=sáb) de una fecha-calendario "YYYY-MM-DD".
 * El día de la semana de una fecha-calendario no depende de zona horaria
 * (a diferencia de un instante), así que basta con leerlo como UTC puro.
 */
export function diaSemanaRD(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
