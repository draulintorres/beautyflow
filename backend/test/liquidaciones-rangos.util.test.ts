/**
 * Todas las entradas son cadenas con "Z" o fechas "YYYY-MM-DD" -- a
 * propósito, para que estas pruebas den el mismo resultado sin importar
 * la TZ de la máquina que las corre (TZ=UTC y TZ=America/Santo_Domingo).
 */
import test from 'node:test';
import * as assert from 'node:assert/strict';
import {
  ventaElegibleParaLiquidar,
  esLineaDeArrastre,
} from '../src/modules/liquidaciones/liquidaciones-rangos.util';

test('venta 15/11 20:25 RD (=00:25Z del 16) entra en el corte "hasta 15/11"', () => {
  const createdAt = new Date('2026-11-16T00:25:00.000Z');
  assert.equal(ventaElegibleParaLiquidar(createdAt, '2026-11-15'), true);
});

test('venta 15/11 20:25 RD (=00:25Z del 16) NO entra en el corte "hasta 14/11"', () => {
  const createdAt = new Date('2026-11-16T00:25:00.000Z');
  assert.equal(ventaElegibleParaLiquidar(createdAt, '2026-11-14'), false);
});

test('venta 15/11 19:59 RD (=23:59Z del 15) entra en el corte "hasta 15/11"', () => {
  const createdAt = new Date('2026-11-15T23:59:00.000Z');
  assert.equal(ventaElegibleParaLiquidar(createdAt, '2026-11-15'), true);
});

test('venta vieja sin liquidar sigue entrando en el corte (sin cota inferior)', () => {
  const createdAtViejisima = new Date('2020-01-01T00:00:00.000Z');
  assert.equal(ventaElegibleParaLiquidar(createdAtViejisima, '2026-11-15'), true);
});

test('esLineaDeArrastre: borde exacto 04:00Z -- justo en el inicio de "desde" NO es arrastre', () => {
  const inicioExacto = new Date('2026-11-01T04:00:00.000Z'); // 00:00 RD del 1/11
  assert.equal(esLineaDeArrastre(inicioExacto, '2026-11-01'), false);
});

test('esLineaDeArrastre: 1 ms antes del borde SÍ es arrastre', () => {
  const unMsAntes = new Date('2026-11-01T03:59:59.999Z');
  assert.equal(esLineaDeArrastre(unMsAntes, '2026-11-01'), true);
});

test('esLineaDeArrastre: sin "desde" (preview sin filtro de inicio), nunca es arrastre', () => {
  const cualquiera = new Date('2020-01-01T00:00:00.000Z');
  assert.equal(esLineaDeArrastre(cualquiera, undefined), false);
});
