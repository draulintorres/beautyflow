import test from 'node:test';
import * as assert from 'node:assert/strict';
import {
  generarCodigosRespaldo,
  normalizarCodigoRespaldo,
  hashCodigoRespaldo,
  verificarCodigoRespaldo,
} from '../src/core/common/codigos-respaldo.util';

test('genera 8 códigos distintos entre sí, en grupos separados por guion', () => {
  const codigos = generarCodigosRespaldo();
  assert.equal(codigos.length, 8);
  assert.equal(new Set(codigos).size, 8);
  for (const c of codigos) {
    assert.match(c, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  }
});

test('normalización: mayúsculas, sin guiones ni espacios', () => {
  assert.equal(normalizarCodigoRespaldo('abcd-efgh-jkmn-pqrs'), 'ABCDEFGHJKMNPQRS');
  assert.equal(normalizarCodigoRespaldo('ABCD EFGH JKMN PQRS'), 'ABCDEFGHJKMNPQRS');
  assert.equal(normalizarCodigoRespaldo('AbCd-EfGh-jKmN-pQrS'), 'ABCDEFGHJKMNPQRS');
});

test('código válido: verifica correctamente contra su propio hash, en cualquier formato', async () => {
  const [codigo] = generarCodigosRespaldo(1);
  const hash = await hashCodigoRespaldo(codigo);

  assert.equal(await verificarCodigoRespaldo(codigo, hash), true);
  assert.equal(await verificarCodigoRespaldo(codigo.toLowerCase(), hash), true);
  assert.equal(await verificarCodigoRespaldo(codigo.replace(/-/g, ' '), hash), true);
});

test('código inválido: no verifica contra un hash de otro código', async () => {
  const [codigoA, codigoB] = generarCodigosRespaldo(2);
  const hashA = await hashCodigoRespaldo(codigoA);
  assert.equal(await verificarCodigoRespaldo(codigoB, hashA), false);
});

test('hash distinto cada vez, incluso para el mismo código (salt de bcrypt)', async () => {
  const [codigo] = generarCodigosRespaldo(1);
  const hash1 = await hashCodigoRespaldo(codigo);
  const hash2 = await hashCodigoRespaldo(codigo);
  assert.notEqual(hash1, hash2);
  assert.equal(await verificarCodigoRespaldo(codigo, hash1), true);
  assert.equal(await verificarCodigoRespaldo(codigo, hash2), true);
});
