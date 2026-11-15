/**
 * Prueba unitaria de parseAllowedOrigins() (ETAPA P2, Cambio 3). Sin base
 * de datos, sin dependencias nuevas.
 *
 * Correr con: node -r ts-node/register --test test/allowed-origins.util.test.ts
 */
import test from 'node:test';
import * as assert from 'node:assert/strict';
import { parseAllowedOrigins } from '../src/core/common/allowed-origins.util';

test('con espacios: cada entrada se recorta', () => {
  const result = parseAllowedOrigins('https://app.estixa.com, https://admin.estixa.com');
  assert.deepEqual(result, ['https://app.estixa.com', 'https://admin.estixa.com']);
});

test('vacía: definida pero sin contenido real -> arreglo vacío, no true', () => {
  assert.deepEqual(parseAllowedOrigins(''), []);
  assert.deepEqual(parseAllowedOrigins('   '), []);
  assert.deepEqual(parseAllowedOrigins(',,'), []);
});

test('una sola entrada: sin coma', () => {
  assert.deepEqual(parseAllowedOrigins('https://app.estixa.com'), ['https://app.estixa.com']);
});

test('undefined: variable no definida -> true (cualquier origen)', () => {
  assert.equal(parseAllowedOrigins(undefined), true);
});

test('descarta entradas vacías entre comas sin perder las válidas', () => {
  const result = parseAllowedOrigins('https://app.estixa.com,, https://admin.estixa.com,');
  assert.deepEqual(result, ['https://app.estixa.com', 'https://admin.estixa.com']);
});
