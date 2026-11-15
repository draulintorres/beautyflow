import test from 'node:test';
import * as assert from 'node:assert/strict';
import {
  generarCodigosRespaldo,
  normalizarCodigoRespaldo,
  hashCodigoRespaldo,
} from '../src/core/common/codigos-respaldo.util';

test('genera 8 códigos distintos entre sí, en grupos separados por guion', () => {
  const codigos = generarCodigosRespaldo();
  assert.equal(codigos.length, 8);
  assert.equal(new Set(codigos).size, 8);
  for (const c of codigos) {
    assert.match(c, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  }
});

test('cada código tiene 80 bits de entropía (16 caracteres Crockford sin contar guiones)', () => {
  const [codigo] = generarCodigosRespaldo(1);
  const sinGuiones = codigo.replace(/-/g, '');
  assert.equal(sinGuiones.length, 16);
});

test('normalización: mayúsculas, sin guiones ni espacios (sin caracteres ambiguos)', () => {
  // Ningún carácter de este código real es O/I/L (el alfabeto Crockford ya
  // los excluye) -- esta prueba cubre solo mayúsculas + separadores.
  assert.equal(normalizarCodigoRespaldo('abcd-efgh-jkmn-pqrs'), 'ABCDEFGHJKMNPQRS');
  assert.equal(normalizarCodigoRespaldo('ABCD EFGH JKMN PQRS'), 'ABCDEFGHJKMNPQRS');
  assert.equal(normalizarCodigoRespaldo('AbCd-EfGh-jKmN-pQrS'), 'ABCDEFGHJKMNPQRS');
});

test('normalización: O/I/L (mayúsculas o minúsculas) se mapean a 0/1/1', () => {
  assert.equal(normalizarCodigoRespaldo('O'), '0');
  assert.equal(normalizarCodigoRespaldo('o'), '0');
  assert.equal(normalizarCodigoRespaldo('I'), '1');
  assert.equal(normalizarCodigoRespaldo('i'), '1');
  assert.equal(normalizarCodigoRespaldo('L'), '1');
  assert.equal(normalizarCodigoRespaldo('l'), '1');
  assert.equal(normalizarCodigoRespaldo('O-I-L'), '011');
});

test('hash estable: el mismo código normalizado da siempre el mismo hash SHA-256 (hex)', () => {
  const [codigo] = generarCodigosRespaldo(1);
  const hash1 = hashCodigoRespaldo(codigo);
  const hash2 = hashCodigoRespaldo(codigo);
  assert.equal(hash1, hash2);
  assert.match(hash1, /^[0-9a-f]{64}$/);
});

test('hash estable entre formatos equivalentes (mayúsculas/minúsculas, con/sin guiones)', () => {
  const [codigo] = generarCodigosRespaldo(1);
  const hashOriginal = hashCodigoRespaldo(codigo);
  assert.equal(hashCodigoRespaldo(codigo.toLowerCase()), hashOriginal);
  assert.equal(hashCodigoRespaldo(codigo.replace(/-/g, ' ')), hashOriginal);
});

test('hash distinto para códigos distintos', () => {
  const [codigoA, codigoB] = generarCodigosRespaldo(2);
  assert.notEqual(hashCodigoRespaldo(codigoA), hashCodigoRespaldo(codigoB));
});
