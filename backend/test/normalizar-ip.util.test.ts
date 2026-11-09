/**
 * Prueba unitaria de normalizarIp() (ETAPA 10b, ajuste "IPv6 por /64").
 * Sin base de datos, sin dependencias nuevas.
 *
 * Correr con: node -r ts-node/register --test test/normalizar-ip.util.test.ts
 */
import test from 'node:test';
import * as assert from 'node:assert/strict';
import { normalizarIp } from '../src/core/common/normalizar-ip.util';

test('IPv4: se devuelve igual', () => {
  assert.equal(normalizarIp('203.0.113.9'), '203.0.113.9');
  assert.equal(normalizarIp('127.0.0.1'), '127.0.0.1');
});

test('IPv4 mapeada en IPv6 (::ffff:a.b.c.d): se extrae la parte IPv4', () => {
  assert.equal(normalizarIp('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(normalizarIp('::FFFF:203.0.113.9'), '203.0.113.9');
});

test('IPv6: dos direcciones del mismo /64 dan la misma llave', () => {
  const a = normalizarIp('2001:db8:85a3::8a2e:370:7334');
  const b = normalizarIp('2001:db8:85a3::1');
  assert.equal(a, b);
});

test('IPv6: direcciones de /64 distintos dan llaves distintas', () => {
  const a = normalizarIp('2001:db8:85a3:0000::1');
  const b = normalizarIp('2001:db8:85a4:0000::1');
  assert.notEqual(a, b);
});

test('IPv6: misma /64 escrita con y sin ceros a la izquierda da la misma llave', () => {
  const a = normalizarIp('2001:0db8:0000:0042:0000:8a2e:0370:7334');
  const b = normalizarIp('2001:db8:0:42::1');
  assert.equal(a, b);
});

test('IPv6: loopback (::1) no rompe', () => {
  assert.equal(normalizarIp('::1'), '0:0:0:0');
});

test('vacío, undefined, null o inválido: llave fija "desconocida"', () => {
  assert.equal(normalizarIp(''), 'desconocida');
  assert.equal(normalizarIp('   '), 'desconocida');
  assert.equal(normalizarIp(undefined), 'desconocida');
  assert.equal(normalizarIp(null), 'desconocida');
  assert.equal(normalizarIp('no-es-una-ip'), 'desconocida');
  assert.equal(normalizarIp('1:2:3:4:5:6:7:8:9'), 'desconocida'); // demasiados grupos
  assert.equal(normalizarIp('1::2::3'), 'desconocida'); // dos "::"
});
