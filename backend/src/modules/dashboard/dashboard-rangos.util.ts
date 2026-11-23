/**
 * Lógica pura (sin Prisma, sin `this`) de los rangos de fecha y las llaves
 * de agrupación que usa dashboard.service.ts -- separada a propósito para
 * poder probarla sin base de datos. SOLO para campos que son INSTANTES
 * REALES (Venta.createdAt, DeudaAlquiler.createdAt, etc.) -- Cita.inicio/
 * fin sigue con rangoDiaRDNaive directo en el servicio, nunca pasa por
 * aquí.
 */
import {
  rangoDiaRDNaive,
  rangoDiaRDReal,
  rangoMesRDReal,
  rangoAnioRDReal,
} from '../../core/common/fecha-rd.util';

export interface RangosDashboard {
  diaReal: { gte: Date; lt: Date };
  diaNaive: { inicio: Date; fin: Date };
  mesReal: { gte: Date; lt: Date };
  hace30Dias: Date;
}

/** Los 4 rangos que usa kpis()/porSucursal(), a partir de la fecha-calendario
 * RD de "hoy" (fechaHoyRD()) -- recibida como parámetro para que esto sea
 * puro y testeable sin depender del reloj real. */
export function construirRangosDashboard(hoy: string): RangosDashboard {
  const diaReal = rangoDiaRDReal(hoy);
  const diaNaive = rangoDiaRDNaive(hoy);
  const [anio, mes] = hoy.split('-').map(Number);
  const mesReal = rangoMesRDReal(`${anio}-${String(mes).padStart(2, '0')}`);
  const hace30Dias = new Date(diaReal.gte.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { diaReal, diaNaive, mesReal, hace30Dias };
}

export interface DesgloseMes {
  gte: Date;
  lt: Date;
  /** Una llave "YYYY-MM-DD" por cada día del mes, en orden -- para
   * sembrar el mapa con todos los días en 0 antes de sumarles ventas. */
  clavesDias: string[];
}

/** Rango [gte, lt) de un mes específico (año + mes 1-indexado) en
 * instantes reales, más las llaves de TODOS sus días -- aritmética UTC
 * pura, sin Date(y, m, d) ni getters locales (el número de días del mes
 * sale de Date.UTC(anio, mes, 0), que ya normaliza bisiestos solo). */
export function rangoDesglosarMes(anio: number, mes: number): DesgloseMes {
  const mesStr = `${anio}-${String(mes).padStart(2, '0')}`;
  const { gte, lt } = rangoMesRDReal(mesStr);
  const diasEnMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const clavesDias: string[] = [];
  for (let dia = 1; dia <= diasEnMes; dia++) {
    clavesDias.push(`${mesStr}-${String(dia).padStart(2, '0')}`);
  }
  return { gte, lt, clavesDias };
}

export interface RangoDoceMeses {
  gte: Date;
  /** Solo presente cuando se pidió un año explícito (cierra el rango;
   * la ventana móvil de "últimos 12 meses" queda abierta, igual que
   * antes). */
  lt?: Date;
  /** Una llave "YYYY-MM" por cada uno de los 12 meses, en orden. */
  clavesMeses: string[];
}

/** Rango de 12 meses -- año explícito (enero a diciembre completo) o
 * ventana móvil de los últimos 12 meses terminando en el mes de "hoy"
 * (fecha-calendario RD, recibida como parámetro). Aritmética con
 * Date.UTC y getUTC* -- nunca local -- así que el resultado no depende
 * de la TZ del proceso. */
export function rangoUltimos12Meses(hoy: string, anio?: number): RangoDoceMeses {
  let gte: Date;
  let lt: Date | undefined;

  if (anio) {
    const r = rangoAnioRDReal(anio);
    gte = r.gte;
    lt = r.lt;
  } else {
    const [anioHoy, mesHoy] = hoy.split('-').map(Number);
    // Date.UTC normaliza un mes negativo (mesHoy - 1 - 11) restando años
    // solo -- sin esto habría que calcular el acarreo de año a mano.
    const base = new Date(Date.UTC(anioHoy, mesHoy - 1 - 11, 1));
    gte = rangoMesRDReal(
      `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}`,
    ).gte;
  }

  const anioInicio = gte.getUTCFullYear();
  const mesInicio = gte.getUTCMonth(); // 0-indexado
  const clavesMeses: string[] = [];
  for (let i = 0; i < 12; i++) {
    const total = mesInicio + i;
    const anioClave = anioInicio + Math.floor(total / 12);
    const mesClave = (((total % 12) + 12) % 12) + 1; // módulo seguro + 1-indexado
    clavesMeses.push(`${anioClave}-${String(mesClave).padStart(2, '0')}`);
  }

  return { gte, lt, clavesMeses };
}
