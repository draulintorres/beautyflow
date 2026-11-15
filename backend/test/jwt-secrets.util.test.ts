/**
 * Prueba unitaria de validateJwtSecrets() (ETAPA P3, commit 1). Sin base
 * de datos, sin dependencias nuevas.
 *
 * Correr con: node -r ts-node/register --test test/jwt-secrets.util.test.ts
 */
import test from 'node:test';
import * as assert from 'node:assert/strict';
import { validateJwtSecrets } from '../src/core/common/jwt-secrets.util';

const LARGO_VALIDO_A = 'a'.repeat(32);
const LARGO_VALIDO_B = 'b'.repeat(32);
const LARGO_VALIDO_C = 'c'.repeat(32);
const LARGO_VALIDO_D = 'd'.repeat(32);

function envBase(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    JWT_ACCESS_SECRET: LARGO_VALIDO_A,
    JWT_REFRESH_SECRET: LARGO_VALIDO_B,
    JWT_SUPERADMIN_SECRET: LARGO_VALIDO_C,
    JWT_PORTAL_SECRET: LARGO_VALIDO_D,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

test('falta una variable: lanza nombrándola', () => {
  const env = envBase({ JWT_PORTAL_SECRET: undefined });
  assert.throws(() => validateJwtSecrets(env), /JWT_PORTAL_SECRET/);
});

test('variable vacía: lanza nombrándola', () => {
  const env = envBase({ JWT_REFRESH_SECRET: '' });
  assert.throws(() => validateJwtSecrets(env), /JWT_REFRESH_SECRET/);
});

test('variable solo con espacios: lanza nombrándola', () => {
  const env = envBase({ JWT_SUPERADMIN_SECRET: '    ' });
  assert.throws(() => validateJwtSecrets(env), /JWT_SUPERADMIN_SECRET/);
});

test('fuera de producción: acepta secretos cortos (como los de backend/.env.example)', () => {
  const env = envBase({
    NODE_ENV: 'development',
    JWT_ACCESS_SECRET: 'cambiar-en-produccion-access',
    JWT_REFRESH_SECRET: 'cambiar-en-produccion-refresh',
    JWT_SUPERADMIN_SECRET: 'cambiar-en-produccion-superadmin',
    JWT_PORTAL_SECRET: 'cambiar-en-produccion-portal',
  });
  assert.doesNotThrow(() => validateJwtSecrets(env));
});

test('producción con uno de menos de 32 caracteres: lanza nombrándolo', () => {
  const env = envBase({ NODE_ENV: 'production', JWT_PORTAL_SECRET: 'corto' });
  assert.throws(() => validateJwtSecrets(env), /JWT_PORTAL_SECRET/);
});

test('producción con dos secretos iguales: lanza nombrando ambas variables', () => {
  const env = envBase({ NODE_ENV: 'production', JWT_PORTAL_SECRET: LARGO_VALIDO_A }); // igual a JWT_ACCESS_SECRET
  assert.throws(
    (() => validateJwtSecrets(env)) as () => void,
    (err: unknown) => {
      const msg = (err as Error).message;
      return msg.includes('JWT_ACCESS_SECRET') && msg.includes('JWT_PORTAL_SECRET');
    },
  );
});

test('caso válido en producción: no lanza', () => {
  const env = envBase({ NODE_ENV: 'production' });
  assert.doesNotThrow(() => validateJwtSecrets(env));
});

test('el mensaje de error nunca contiene el valor del secreto (caso: muy corto)', () => {
  const valorSecreto = 'valor-secreto-corto';
  const env = envBase({ NODE_ENV: 'production', JWT_PORTAL_SECRET: valorSecreto });
  assert.throws(() => validateJwtSecrets(env), (err: unknown) => {
    const msg = (err as Error).message;
    assert.ok(!msg.includes(valorSecreto), 'el mensaje no debe contener el valor del secreto');
    assert.ok(msg.includes('JWT_PORTAL_SECRET'), 'el mensaje debe nombrar la variable');
    return true;
  });
});

test('el mensaje de error nunca contiene el valor del secreto (caso: duplicado)', () => {
  const env = envBase({ NODE_ENV: 'production', JWT_PORTAL_SECRET: LARGO_VALIDO_A }); // igual a JWT_ACCESS_SECRET
  assert.throws(() => validateJwtSecrets(env), (err: unknown) => {
    const msg = (err as Error).message;
    assert.ok(!msg.includes(LARGO_VALIDO_A), 'el mensaje no debe contener el valor del secreto duplicado');
    return true;
  });
});
