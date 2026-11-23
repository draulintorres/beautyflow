export const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function mesCorto(yyyyMM: string): string {
  const idx = parseInt(yyyyMM.split('-')[1]) - 1;
  return MESES_CORTOS[idx] ?? yyyyMM;
}

export function initiales(nombre: string): string {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/** Máscara de teléfono dominicano 3-3-4 (ej. "809-313-6783") mientras se escribe. */
export function fmtTelefono(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

const FORMATO_HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const OFFSET_RD_MS = 4 * 60 * 60 * 1000;

function formatearHora12(horas: number, minutos: number): string {
  const periodo = horas < 12 ? 'AM' : 'PM';
  const horas12 = horas === 0 ? 12 : horas > 12 ? horas - 12 : horas;
  return `${horas12}:${String(minutos).padStart(2, '0')} ${periodo}`;
}

/**
 * "H:mm AP" -- sin cero a la izquierda en la hora, AM/PM en mayúsculas,
 * espacio ASCII normal, armado a mano (sin Intl ni toLocaleTimeString).
 * 12:00 AM = medianoche, 12:00 PM = mediodía. Mismo formato que ya usa
 * Agenda (AgendaPage.tsx#labelTime12 y sus copias) -- este es el
 * equivalente genérico para el resto del proyecto.
 *
 * Acepta dos tipos de entrada:
 * - string "HH:mm" (24h, ya extraído de un formulario o de un campo
 *   type="time") -- se usa tal cual, sin convertir zona horaria.
 * - Date, o string ISO con "Z" (instante real -- ej. createdAt que llega
 *   de la API) -- se le restan las 4h de offset de RD antes de leer la
 *   hora, igual que `hora12DeInstante()` del backend.
 *
 * Entrada inválida: devuelve la entrada original tal cual, sin lanzar.
 */
export function formatHora12(entrada: string | Date): string {
  if (typeof entrada === 'string') {
    const m = FORMATO_HHMM.exec(entrada);
    if (m) return formatearHora12(Number(m[1]), Number(m[2]));
  }
  const d = entrada instanceof Date ? entrada : new Date(entrada);
  if (isNaN(d.getTime())) return typeof entrada === 'string' ? entrada : String(entrada);
  const naive = new Date(d.getTime() - OFFSET_RD_MS);
  return formatearHora12(naive.getUTCHours(), naive.getUTCMinutes());
}
