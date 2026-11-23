/**
 * Utilidades de fecha para República Dominicana (UTC-4, sin horario de
 * verano). Dos esquemas DISTINTOS e INCOMPATIBLES conviven en la base de
 * datos -- mezclarlos es la causa raíz de varios bugs encontrados en
 * producción (dashboard, reportes, avisos). Antes de usar cualquier
 * función de aquí, identificar a qué esquema pertenece el campo que se va
 * a comparar:
 *
 * ESQUEMA "NAIVE" (Cita.inicio, Cita.fin, bloqueos de horario):
 *   agenda.service.ts construye y lee horas de citas con
 *   `new Date(\`${fecha}T${hora}:00\`)` y `d.getHours()/getMinutes()` —
 *   SIN sufijo de zona horaria. Como el servidor corre en UTC, esto graba
 *   y relee las citas usando los dígitos de hora de RD "tal cual",
 *   tratados como si fueran UTC (una hora "14:00" que el usuario tipeó
 *   para las 2pm de RD queda literalmente en 14:00:00 UTC en la base de
 *   datos, no en las 18:00:00 UTC que serían la conversión real). Es un
 *   esquema "naive" pero autoconsistente: mientras TODO el código que
 *   toca estos campos lea y escriba con el mismo criterio (dígitos = hora
 *   de RD, etiquetados como UTC), todo calza.
 *   → usar `rangoDiaRDNaive()` y `ahoraNaiveRD()` para comparar contra
 *   estos campos. NUNCA usarlas con un campo de la otra categoría.
 *
 * ESQUEMA REAL (Venta.createdAt, Pago.createdAt, AperturaCaja.fechaCierre,
 * LiquidacionComision.createdAt, AbonoAlquiler.createdAt, y cualquier otro
 * `@default(now())` o `new Date()` sin modificar):
 *   son instantes UTC verdaderos, sin desfase. Compararlos contra un rango
 *   "naive" (como hacía el `rangoDiaRD` original) corta el día real de RD
 *   4 horas antes de medianoche -- cualquier venta cobrada después de las
 *   8:00pm hora RD queda fuera de "hoy" (o cae en el mes/año siguiente en
 *   los gráficos agrupados por mes).
 *   → usar `rangoDiaRDReal()`, `rangoMesRDReal()`, `rangoAnioRDReal()`
 *   para filtrar, y `fechaRDDeInstante()`/`mesRDDeInstante()` para
 *   agrupar/mostrar la fecha-calendario RD de uno de estos instantes.
 *
 * Todas las funciones de este archivo usan cadenas con "Z" o `Date.UTC(...)`
 * explícitamente -- NINGUNA depende de la zona horaria del proceso que
 * ejecuta Node (a diferencia de `new Date(y, m, d)` o de los getters
 * locales `getHours()/getDate()`, que si dependen de ella). Esto es
 * intencional: estas utilidades deben dar el mismo resultado corriendo en
 * un contenedor con TZ=UTC (producción) o en una máquina de desarrollo en
 * cualquier otro huso.
 */

const OFFSET_RD_MS = 4 * 60 * 60 * 1000;

/** Fecha-calendario de "hoy" en RD (UTC-4, sin horario de verano), como "YYYY-MM-DD". */
export function fechaHoyRD(): string {
  const desplazada = new Date(Date.now() - OFFSET_RD_MS);
  return desplazada.toISOString().slice(0, 10);
}

/**
 * Rango [inicio, fin] de un día calendario "YYYY-MM-DD", en el esquema
 * "naive" (dígitos de RD etiquetados como UTC) que usa `Cita.inicio`/`fin`.
 * `fin` es el último milisegundo del día (23:59:59.999).
 *
 * SOLO para campos naive (Cita.inicio/fin, bloqueos de horario) -- NUNCA
 * usar con createdAt, fechaCierre ni ningún otro instante real (ver
 * `rangoDiaRDReal`).
 */
export function rangoDiaRDNaive(fecha: string): { inicio: Date; fin: Date } {
  return {
    inicio: new Date(`${fecha}T00:00:00.000Z`),
    fin: new Date(`${fecha}T23:59:59.999Z`),
  };
}

/**
 * @deprecated usar `rangoDiaRDNaive` -- mismo comportamiento, nombre más
 * explícito sobre para qué campos sirve. SOLO para campos naive
 * (Cita.inicio/fin); NO usar con createdAt ni otros instantes reales.
 */
export const rangoDiaRD = rangoDiaRDNaive;

/**
 * [gte, lt) de un día calendario RD ("YYYY-MM-DD"), en instantes UTC
 * REALES -- para campos que son instantes reales: Venta.createdAt,
 * Pago.createdAt, AperturaCaja.fechaCierre, LiquidacionComision.createdAt,
 * etc. Medianoche RD = 04:00 UTC del mismo día calendario (RD es UTC-4
 * fijo, sin horario de verano). Intervalo SEMIABIERTO (`lt`, no `lte`
 * 23:59:59.999): el instante exacto del borde (ej. 2026-11-22T04:00:00.000Z)
 * debe caer en el día que EMPIEZA, nunca en el que termina ni contarse dos
 * veces.
 *
 * NUNCA usar con Cita.inicio/fin -- esos son naive (ver `rangoDiaRDNaive`).
 */
export function rangoDiaRDReal(fecha: string): { gte: Date; lt: Date } {
  const [y, m, d] = fecha.split('-').map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, d, 4, 0, 0, 0)),
    lt: new Date(Date.UTC(y, m - 1, d + 1, 4, 0, 0, 0)),
  };
}

/**
 * [gte, lt) de un mes calendario RD ("YYYY-MM"), en instantes UTC reales.
 * El inicio del mes RD es el día 1 a las 04:00 UTC. Diciembre pasa a enero
 * del año siguiente automáticamente -- `Date.UTC` normaliza el mes 12
 * (fuera de rango 0-11) a enero del año siguiente sin lógica especial.
 */
export function rangoMesRDReal(mes: string): { gte: Date; lt: Date } {
  const [y, m] = mes.split('-').map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, 1, 4, 0, 0, 0)),
    lt: new Date(Date.UTC(y, m, 1, 4, 0, 0, 0)),
  };
}

/**
 * [gte, lt) de un año calendario RD, en instantes UTC reales. El inicio
 * del año RD es el 1 de enero a las 04:00 UTC.
 */
export function rangoAnioRDReal(anio: number): { gte: Date; lt: Date } {
  return {
    gte: new Date(Date.UTC(anio, 0, 1, 4, 0, 0, 0)),
    lt: new Date(Date.UTC(anio + 1, 0, 1, 4, 0, 0, 0)),
  };
}

/**
 * Fecha-calendario RD ("YYYY-MM-DD") de un instante REAL (ej.
 * Venta.createdAt) -- para agrupar/mostrar por día. Resta las 4 horas de
 * offset y toma la parte de fecha con `toISOString()` (nunca con getters
 * locales como `getDate()`, que dependerían de la TZ del proceso).
 */
export function fechaRDDeInstante(d: Date): string {
  return new Date(d.getTime() - OFFSET_RD_MS).toISOString().slice(0, 10);
}

/**
 * Mes-calendario RD ("YYYY-MM") de un instante REAL -- para agrupar por
 * mes (gráficos de ventas, "Este año"/"Año pasado"). Mismo criterio que
 * `fechaRDDeInstante`.
 */
export function mesRDDeInstante(d: Date): string {
  return new Date(d.getTime() - OFFSET_RD_MS).toISOString().slice(0, 7);
}

/**
 * Convierte un instante REAL ("ahora") a su equivalente en el esquema
 * "naive" (dígitos de RD etiquetados como UTC) -- para comparar contra
 * campos naive como Cita.inicio/fin desde código que sí maneja instantes
 * reales (ej. `new Date()` en un cron). Resta las 4 horas de offset; el
 * resultado NO es un instante real, es un valor en el mismo esquema
 * mal-etiquetado que usan las citas, a propósito.
 */
export function ahoraNaiveRD(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() - OFFSET_RD_MS);
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

// ======================= HORA EN 12 HORAS =======================
//
// Formato de salida fijo en todo el proyecto para cualquier hora que vea
// el usuario: "H:mm AP" -- sin cero a la izquierda en la hora, AM/PM en
// mayúsculas, un espacio ASCII normal, armado a mano (sin Intl ni
// toLocaleTimeString, que dependen del locale/TZ del runtime y pueden
// variar el separador o el espacio). 12:00 AM = medianoche, 12:00 PM =
// mediodía. Mismo criterio que ya usa el frontend (AgendaPage.tsx#labelTime12
// y sus 3 copias duplicadas) -- estas funciones son el equivalente del
// lado del backend, para texto que NO pasa por un conversor del frontend
// (WhatsApp, correos, avisos internos, recibos, reportes exportados).
//
// Cada función toma un tipo de entrada distinto -- usar la que corresponda
// al campo real, igual que con los rangos de arriba:
//   - horaDe24a12: string "HH:mm" ya extraído (ej. de un formulario).
//   - hora12DeNaive: Date "naive" (Cita.inicio/fin) -- lee con
//     getUTCHours/getUTCMinutes (los dígitos YA SON la hora de RD).
//   - hora12DeInstante / fechaHora12DeInstante: Date instante REAL
//     (createdAt, fechaCierre) -- resta las 4h de offset antes de leer.

function formatearHora12(horas: number, minutos: number): string {
  const periodo = horas < 12 ? 'AM' : 'PM';
  const horas12 = horas === 0 ? 12 : horas > 12 ? horas - 12 : horas;
  return `${horas12}:${String(minutos).padStart(2, '0')} ${periodo}`;
}

const FORMATO_HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** string "HH:mm" (24h) -> "H:mm AP". Entrada inválida: devuelve la
 * cadena original tal cual, sin lanzar. */
export function horaDe24a12(hhmm: string): string {
  const m = FORMATO_HHMM.exec(hhmm);
  if (!m) return hhmm;
  return formatearHora12(Number(m[1]), Number(m[2]));
}

/** Date "naive" (Cita.inicio/fin) -> "H:mm AP", leyendo los dígitos tal
 * cual con getUTC* (son la hora de RD, no un instante UTC real). Date
 * inválida: no lanza, devuelve String(d) ("Invalid Date"). */
export function hora12DeNaive(d: Date): string {
  if (isNaN(d.getTime())) return String(d);
  return formatearHora12(d.getUTCHours(), d.getUTCMinutes());
}

/** Date instante REAL (createdAt, fechaCierre) -> "H:mm AP" en hora de
 * RD -- resta las 4h de offset antes de leer. Date inválida: no lanza,
 * devuelve String(d). */
export function hora12DeInstante(d: Date): string {
  if (isNaN(d.getTime())) return String(d);
  const naive = new Date(d.getTime() - OFFSET_RD_MS);
  return formatearHora12(naive.getUTCHours(), naive.getUTCMinutes());
}

/** Date instante REAL -> "dd/mm/yyyy H:mm AP" (fecha Y hora en RD), ej.
 * "21/11/2026 8:25 PM" para una venta cobrada a las 20:25 RD. Date
 * inválida: no lanza, devuelve String(d). */
export function fechaHora12DeInstante(d: Date): string {
  if (isNaN(d.getTime())) return String(d);
  const naive = new Date(d.getTime() - OFFSET_RD_MS);
  const dd = String(naive.getUTCDate()).padStart(2, '0');
  const mm = String(naive.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = naive.getUTCFullYear();
  return `${dd}/${mm}/${yyyy} ${formatearHora12(naive.getUTCHours(), naive.getUTCMinutes())}`;
}
