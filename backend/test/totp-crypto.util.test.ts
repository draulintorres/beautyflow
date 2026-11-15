import test from 'node:test';
import * as assert from 'node:assert/strict';
import {
  validateTotpEncryptionKey,
  cifrarSecreto,
  descifrarSecreto,
  TotpDecryptError,
} from '../src/core/common/totp-crypto.util';

const CLAVE_VALIDA = 'a'.repeat(64);
const CLAVE_VALIDA_2 = 'b'.repeat(64);

function envBase(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'development',
    TOTP_ENCRYPTION_KEY: CLAVE_VALIDA,
    ...overrides,
  };
}

// ---------- validateTotpEncryptionKey ----------

test('falta la variable: lanza nombrándola', () => {
  const env = envBase({ TOTP_ENCRYPTION_KEY: undefined });
  assert.throws(() => validateTotpEncryptionKey(env), /TOTP_ENCRYPTION_KEY/);
});

test('variable vacía: lanza nombrándola', () => {
  assert.throws(() => validateTotpEncryptionKey(envBase({ TOTP_ENCRYPTION_KEY: '' })), /TOTP_ENCRYPTION_KEY/);
});

test('variable solo con espacios: lanza nombrándola', () => {
  assert.throws(() => validateTotpEncryptionKey(envBase({ TOTP_ENCRYPTION_KEY: '   ' })), /TOTP_ENCRYPTION_KEY/);
});

test('formato inválido: largo incorrecto', () => {
  assert.throws(() => validateTotpEncryptionKey(envBase({ TOTP_ENCRYPTION_KEY: 'a'.repeat(32) })), /TOTP_ENCRYPTION_KEY/);
});

test('formato inválido: no es hex', () => {
  const noHex = 'g'.repeat(64);
  assert.throws(() => validateTotpEncryptionKey(envBase({ TOTP_ENCRYPTION_KEY: noHex })), /TOTP_ENCRYPTION_KEY/);
});

test('producción: igual a un JWT -> lanza nombrando ambas variables', () => {
  const env = envBase({
    NODE_ENV: 'production',
    TOTP_ENCRYPTION_KEY: CLAVE_VALIDA,
    JWT_ACCESS_SECRET: CLAVE_VALIDA,
  });
  assert.throws(() => validateTotpEncryptionKey(env), /JWT_ACCESS_SECRET/);
});

test('producción: válida y distinta de los 4 JWT -> no lanza', () => {
  const env = envBase({
    NODE_ENV: 'production',
    TOTP_ENCRYPTION_KEY: CLAVE_VALIDA,
    JWT_ACCESS_SECRET: 'c'.repeat(64),
    JWT_REFRESH_SECRET: 'd'.repeat(64),
    JWT_SUPERADMIN_SECRET: 'e'.repeat(64),
    JWT_PORTAL_SECRET: 'f'.repeat(64),
  });
  assert.doesNotThrow(() => validateTotpEncryptionKey(env));
});

test('fuera de producción: acepta aunque coincida con un JWT', () => {
  const env = envBase({
    NODE_ENV: 'development',
    TOTP_ENCRYPTION_KEY: CLAVE_VALIDA,
    JWT_ACCESS_SECRET: CLAVE_VALIDA,
  });
  assert.doesNotThrow(() => validateTotpEncryptionKey(env));
});

test('el mensaje de error nunca contiene el valor de la clave', () => {
  try {
    validateTotpEncryptionKey(envBase({ TOTP_ENCRYPTION_KEY: 'g'.repeat(64) }));
    assert.fail('debía lanzar');
  } catch (err) {
    const msg = (err as Error).message;
    assert.equal(msg.includes('g'.repeat(64)), false);
  }
});

// ---------- cifrarSecreto / descifrarSecreto ----------

function envCripto(clave = CLAVE_VALIDA): NodeJS.ProcessEnv {
  return { TOTP_ENCRYPTION_KEY: clave };
}

test('cifrar/descifrar ida y vuelta: devuelve el texto original', () => {
  const env = envCripto();
  const cifrado = cifrarSecreto('SECRETO-TOTP-BASE32', 'admin-1', env);
  const plano = descifrarSecreto(cifrado, 'admin-1', env);
  assert.equal(plano, 'SECRETO-TOTP-BASE32');
});

test('descifrar con otra clave: falla con TotpDecryptError', () => {
  const cifrado = cifrarSecreto('secreto', 'admin-1', envCripto(CLAVE_VALIDA));
  assert.throws(
    () => descifrarSecreto(cifrado, 'admin-1', envCripto(CLAVE_VALIDA_2)),
    TotpDecryptError,
  );
});

test('descifrar con otro adminId (AAD distinto): falla con TotpDecryptError', () => {
  const env = envCripto();
  const cifrado = cifrarSecreto('secreto', 'admin-1', env);
  assert.throws(() => descifrarSecreto(cifrado, 'admin-2', env), TotpDecryptError);
});

test('descifrar con el texto alterado: falla con TotpDecryptError', () => {
  const env = envCripto();
  const cifrado = cifrarSecreto('secreto', 'admin-1', env);
  const partes = cifrado.split(':');
  // Altera un byte del texto cifrado (última parte) sin tocar el formato.
  const ctAlterado = Buffer.from(partes[3], 'base64');
  ctAlterado[0] ^= 0xff;
  const alterado = [partes[0], partes[1], partes[2], ctAlterado.toString('base64')].join(':');
  assert.throws(() => descifrarSecreto(alterado, 'admin-1', env), TotpDecryptError);
});

test('dos cifrados del mismo texto plano dan resultados distintos (IV aleatorio)', () => {
  const env = envCripto();
  const a = cifrarSecreto('mismo-secreto', 'admin-1', env);
  const b = cifrarSecreto('mismo-secreto', 'admin-1', env);
  assert.notEqual(a, b);
  // Pero ambos descifran al mismo texto plano.
  assert.equal(descifrarSecreto(a, 'admin-1', env), 'mismo-secreto');
  assert.equal(descifrarSecreto(b, 'admin-1', env), 'mismo-secreto');
});
