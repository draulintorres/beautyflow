/**
 * Todas las entradas son cadenas con "Z" o fechas "YYYY-MM-DD"/"YYYY-MM" --
 * a propósito, para que estas pruebas den el mismo resultado sin importar
 * la TZ de la máquina que las corre (TZ=UTC y TZ=America/Santo_Domingo).
 */
import test from 'node:test';
import * as assert from 'node:assert/strict';
import {
  construirRangosDashboard,
  rangoDesglosarMes,
  rangoUltimos12Meses,
} from '../src/modules/dashboard/dashboard-rangos.util';
import { fechaRDDeInstante, mesRDDeInstante } from '../src/core/common/fecha-rd.util';

// ---------- construirRangosDashboard: "hoy" para Venta.createdAt ----------

test('venta 21/11 20:25 RD (=00:25Z del 22) cuenta en "hoy" del 21, no del 22', () => {
  const { diaReal } = construirRangosDashboard('2026-11-21');
  const createdAt = new Date('2026-11-22T00:25:00.000Z');
  assert.equal(createdAt.getTime() >= diaReal.gte.getTime(), true);
  assert.equal(createdAt.getTime() < diaReal.lt.getTime(), true);
});

test('venta del 20/11 21:00 RD (=01:00Z del 21) NO cuenta en "hoy" del 21', () => {
  const { diaReal } = construirRangosDashboard('2026-11-21');
  const createdAt = new Date('2026-11-21T01:00:00.000Z'); // 20/11 21:00 RD real
  assert.equal(createdAt.getTime() < diaReal.gte.getTime(), true); // es del día anterior
});

test('construirRangosDashboard: diaNaive sigue siendo el esquema naive (con Z, sin offset)', () => {
  const { diaNaive } = construirRangosDashboard('2026-11-21');
  assert.equal(diaNaive.inicio.toISOString(), '2026-11-21T00:00:00.000Z');
  assert.equal(diaNaive.fin.toISOString(), '2026-11-21T23:59:59.999Z');
});

test('construirRangosDashboard: mesReal cubre el mes completo de "hoy", instante real', () => {
  const { mesReal } = construirRangosDashboard('2026-11-21');
  assert.equal(mesReal.gte.toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(mesReal.lt.toISOString(), '2026-12-01T04:00:00.000Z');
});

test('construirRangosDashboard: hace30Dias se calcula sobre diaReal.gte (instante real)', () => {
  const { diaReal, hace30Dias } = construirRangosDashboard('2026-11-21');
  assert.equal(hace30Dias.getTime(), diaReal.gte.getTime() - 30 * 24 * 60 * 60 * 1000);
});

// ---------- rangoDesglosarMes: desglose diario de un mes ----------

test('30/11 21:00 RD (=01:00Z del 1/12) cuenta en noviembre y en el día 30', () => {
  const { gte, lt, clavesDias } = rangoDesglosarMes(2026, 11);
  const createdAt = new Date('2026-12-01T01:00:00.000Z');

  assert.equal(createdAt.getTime() >= gte.getTime(), true);
  assert.equal(createdAt.getTime() < lt.getTime(), true);
  assert.equal(fechaRDDeInstante(createdAt), '2026-11-30');
  assert.equal(clavesDias.includes('2026-11-30'), true);
  assert.equal(clavesDias.length, 30); // noviembre tiene 30 días
  assert.equal(clavesDias[0], '2026-11-01');
  assert.equal(clavesDias[29], '2026-11-30');
});

test('rangoDesglosarMes: febrero de año bisiesto tiene 29 llaves de día', () => {
  const { clavesDias } = rangoDesglosarMes(2028, 2);
  assert.equal(clavesDias.length, 29);
  assert.equal(clavesDias[28], '2028-02-29');
});

test('rangoDesglosarMes: febrero de año NO bisiesto tiene 28 llaves de día', () => {
  const { clavesDias } = rangoDesglosarMes(2026, 2);
  assert.equal(clavesDias.length, 28);
  assert.equal(clavesDias[27], '2026-02-28');
});

// ---------- rangoUltimos12Meses ----------

test('31/12 21:00 RD (=01:00Z del 1/1) cae en el año viejo (año explícito)', () => {
  const anioViejo = rangoUltimos12Meses('2026-06-15', 2026);
  const anioNuevo = rangoUltimos12Meses('2026-06-15', 2027);
  const createdAt = new Date('2027-01-01T01:00:00.000Z');

  assert.equal(createdAt.getTime() >= anioViejo.gte.getTime(), true);
  assert.equal(createdAt.getTime() < anioViejo.lt!.getTime(), true);
  assert.equal(createdAt.getTime() < anioNuevo.gte.getTime(), true);
  assert.equal(mesRDDeInstante(createdAt), '2026-12');
});

test('rangoUltimos12Meses con año explícito: 12 llaves, enero a diciembre de ese año', () => {
  const { clavesMeses } = rangoUltimos12Meses('2026-06-15', 2026);
  assert.equal(clavesMeses.length, 12);
  assert.equal(clavesMeses[0], '2026-01');
  assert.equal(clavesMeses[11], '2026-12');
});

test('rangoUltimos12Meses sin año (ventana móvil): 12 llaves terminando en el mes de "hoy", sin tope superior', () => {
  const { lt, clavesMeses } = rangoUltimos12Meses('2026-11-21');
  assert.equal(lt, undefined);
  assert.equal(clavesMeses.length, 12);
  assert.equal(clavesMeses[11], '2026-11'); // el mes de "hoy" es el último
  assert.equal(clavesMeses[0], '2025-12'); // 11 meses antes de noviembre 2026
});

test('rangoUltimos12Meses sin año: la ventana móvil cruza el fin de año correctamente', () => {
  const { clavesMeses } = rangoUltimos12Meses('2026-02-10');
  // Último mes = feb 2026; 11 meses antes = marzo 2025.
  assert.equal(clavesMeses[11], '2026-02');
  assert.equal(clavesMeses[0], '2025-03');
  assert.equal(clavesMeses.includes('2025-12'), true);
  assert.equal(clavesMeses.includes('2026-01'), true);
});
