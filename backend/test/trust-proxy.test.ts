/**
 * Prueba de integración local de TRUST_PROXY_HOPS (ETAPA 10a, commit 2).
 * No requiere base de datos: levanta una instancia mínima de Express (la
 * misma librería que usa Nest por debajo) y aplica exactamente la misma
 * llamada que main.ts hace sobre la app de Nest: app.set('trust proxy', n).
 *
 * Correr con: npx ts-node --transpile-only -r ts-node/register --test test/trust-proxy.test.ts
 *   (o: node -r ts-node/register --test test/trust-proxy.test.ts)
 */
import test from 'node:test';
import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import express from 'express';
import { resolveTrustProxyHops } from '../src/core/common/trust-proxy.util';

function startServer(trustProxyHops: number): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.set('trust proxy', trustProxyHops);
  app.get('/ip', (req, res) => res.json({ ip: req.ip }));

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as any;
      resolve({
        url: `http://127.0.0.1:${port}/ip`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function getJson(url: string, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    http
      .get(url, { headers }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(JSON.parse(body)));
      })
      .on('error', reject);
  });
}

test('resolveTrustProxyHops: default es 1 cuando la variable no está definida', () => {
  assert.equal(resolveTrustProxyHops(undefined), 1);
  assert.equal(resolveTrustProxyHops(''), 1);
});

test('resolveTrustProxyHops: acepta enteros entre 0 y 5', () => {
  for (const v of ['0', '1', '2', '5']) {
    assert.equal(resolveTrustProxyHops(v), Number(v));
  }
});

test('resolveTrustProxyHops: rechaza valores inválidos (la app no debe arrancar)', () => {
  for (const v of ['abc', '-1', '6', '1.5', 'NaN', '2,']) {
    assert.throws(() => resolveTrustProxyHops(v), /TRUST_PROXY_HOPS inválido/);
  }
});

test('con trust proxy = 1 (Caddy delante), req.ip toma el valor de X-Forwarded-For', async () => {
  const server = await startServer(1);
  try {
    const body = await getJson(server.url, { 'X-Forwarded-For': '203.0.113.9' });
    assert.equal(body.ip, '203.0.113.9');
  } finally {
    await server.close();
  }
});

test('con trust proxy = 0, X-Forwarded-For se ignora y req.ip es la conexión directa', async () => {
  const server = await startServer(0);
  try {
    const body = await getJson(server.url, { 'X-Forwarded-For': '203.0.113.9' });
    assert.notEqual(body.ip, '203.0.113.9');
    assert.match(body.ip, /127\.0\.0\.1|::ffff:127\.0\.0\.1/);
  } finally {
    await server.close();
  }
});
