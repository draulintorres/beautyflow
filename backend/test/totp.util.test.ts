import test from 'node:test';
import * as assert from 'node:assert/strict';
import { generateSync, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import {
  generarSecretoTotp,
  construirUriTotp,
  verificarCodigoTotp,
} from '../src/core/common/totp.util';

const PERIODO = 30;

// ---------- Vectores oficiales RFC 6238 Apéndice B ----------
// SHA1, 8 dígitos (el RFC solo publica vectores de 8 dígitos; producción
// usa 6 -- ver DIGITS en totp.util.ts). Secreto: ASCII "12345678901234567890"
// (20 bytes), tal cual especifica el Apéndice B para el caso SHA1.
test('vectores RFC 6238 (Apéndice B, SHA1, 8 dígitos): coinciden exactamente', () => {
  const secret = Buffer.from('12345678901234567890', 'ascii');
  const crypto = new NobleCryptoPlugin();
  const vectores: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ];
  for (const [epoch, esperado] of vectores) {
    const code = generateSync({ secret, epoch, period: PERIODO, digits: 8, algorithm: 'sha1', crypto });
    assert.equal(code, esperado, `epoch=${epoch}`);
  }
});

// ---------- verificarCodigoTotp() (6 dígitos, el real de producción) ----------

function pasoDe(epochSeconds: number): number {
  return Math.floor(epochSeconds / PERIODO);
}

function generarCodigoEnPaso(secret: string, paso: number): string {
  // Mismo cálculo que hace internamente totp.util.ts (digits=6, sha1,
  // period=30) pero generando en un paso de tiempo arbitrario -- para
  // construir los casos de la ventana ±1 sin esperar reloj real.
  const base32 = new ScureBase32Plugin();
  const raw = base32.decode(secret);
  return generateSync({
    secret: raw,
    epoch: paso * PERIODO,
    period: PERIODO,
    digits: 6,
    algorithm: 'sha1',
    crypto: new NobleCryptoPlugin(),
  });
}

test('ventana ±1: paso actual-1 se acepta y devuelve el paso correcto', async () => {
  const secret = generarSecretoTotp();
  const pasoActual = pasoDe(Date.now() / 1000);
  const codigo = generarCodigoEnPaso(secret, pasoActual - 1);
  const resultado = await verificarCodigoTotp(codigo, secret);
  assert.equal(resultado.valido, true);
  assert.equal(resultado.paso, pasoActual - 1);
});

test('ventana ±1: paso actual+1 se acepta y devuelve el paso correcto', async () => {
  const secret = generarSecretoTotp();
  const pasoActual = pasoDe(Date.now() / 1000);
  const codigo = generarCodigoEnPaso(secret, pasoActual + 1);
  const resultado = await verificarCodigoTotp(codigo, secret);
  assert.equal(resultado.valido, true);
  assert.equal(resultado.paso, pasoActual + 1);
});

test('fuera de la ventana: paso actual-2 se rechaza', async () => {
  const secret = generarSecretoTotp();
  const pasoActual = pasoDe(Date.now() / 1000);
  const codigo = generarCodigoEnPaso(secret, pasoActual - 2);
  const resultado = await verificarCodigoTotp(codigo, secret);
  assert.equal(resultado.valido, false);
});

test('fuera de la ventana: paso actual+2 se rechaza', async () => {
  const secret = generarSecretoTotp();
  const pasoActual = pasoDe(Date.now() / 1000);
  const codigo = generarCodigoEnPaso(secret, pasoActual + 2);
  const resultado = await verificarCodigoTotp(codigo, secret);
  assert.equal(resultado.valido, false);
});

test('paso actual: se acepta y coincide con pasoDe(ahora)', async () => {
  const secret = generarSecretoTotp();
  const pasoActual = pasoDe(Date.now() / 1000);
  const codigo = generarCodigoEnPaso(secret, pasoActual);
  const resultado = await verificarCodigoTotp(codigo, secret);
  assert.equal(resultado.valido, true);
  assert.equal(resultado.paso, pasoActual);
});

test('anti-repetición: un paso <= ultimoPasoAceptado se rechaza aunque esté en la ventana', async () => {
  const secret = generarSecretoTotp();
  const pasoActual = pasoDe(Date.now() / 1000);
  const codigo = generarCodigoEnPaso(secret, pasoActual);
  const resultado = await verificarCodigoTotp(codigo, secret, pasoActual);
  assert.equal(resultado.valido, false);
});

test('anti-repetición: un paso > ultimoPasoAceptado dentro de la ventana sigue válido', async () => {
  const secret = generarSecretoTotp();
  const pasoActual = pasoDe(Date.now() / 1000);
  const codigo = generarCodigoEnPaso(secret, pasoActual);
  const resultado = await verificarCodigoTotp(codigo, secret, pasoActual - 1);
  assert.equal(resultado.valido, true);
  assert.equal(resultado.paso, pasoActual);
});

// ---------- construirUriTotp() ----------

test('URI otpauth: issuer Estixa, label = email, trae el secreto', () => {
  const secret = generarSecretoTotp();
  const uri = construirUriTotp(secret, 'admin@estixa.com');
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /issuer=Estixa/);
  assert.match(uri, /admin%40estixa\.com/);
  assert.match(uri, new RegExp(`secret=${secret}`));
});
