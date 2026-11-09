/**
 * Prueba unitaria de RateLimiterService (ETAPA 10b, commit 1). Sin base de
 * datos, sin dependencias nuevas: node:test + reloj simulado inyectado con
 * setClockForTesting().
 *
 * Correr con: node -r ts-node/register --test test/rate-limiter.service.test.ts
 */
import test from 'node:test';
import * as assert from 'node:assert/strict';
import { RateLimiterService } from '../src/core/common/rate-limiter.service';

function withClock(startMs = 0) {
  let now = startMs;
  const svc = new RateLimiterService();
  svc.setClockForTesting(() => now);
  return {
    svc,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test('límite alcanzado: bloquea exactamente después de maxAttempts fallos', () => {
  const { svc } = withClock();
  const key = 'ip1|empresa|correo@test.com';

  for (let i = 0; i < 5; i++) {
    const check = svc.estaBloqueado(key, 5, 15 * 60 * 1000);
    assert.equal(check.allowed, true, `intento ${i + 1} debería permitirse`);
    svc.registrarFallo(key, 15 * 60 * 1000);
  }

  const sexto = svc.estaBloqueado(key, 5, 15 * 60 * 1000);
  assert.equal(sexto.allowed, false);
  assert.ok(sexto.retryAfterSeconds > 0);
});

test('ventana que expira: tras pasar windowMs, la llave vuelve a estar libre', () => {
  const { svc, advance } = withClock();
  const key = 'ip2|empresa|correo@test.com';
  const windowMs = 15 * 60 * 1000;

  for (let i = 0; i < 5; i++) svc.registrarFallo(key, windowMs);
  assert.equal(svc.estaBloqueado(key, 5, windowMs).allowed, false);

  advance(windowMs); // exactamente al borde: ya expiró (>=)
  const check = svc.estaBloqueado(key, 5, windowMs);
  assert.equal(check.allowed, true);
  assert.equal(check.remaining, 5);
});

test('un intento exitoso (reset) reinicia el contador', () => {
  const { svc } = withClock();
  const key = 'ip3|empresa|correo@test.com';
  const windowMs = 15 * 60 * 1000;

  for (let i = 0; i < 4; i++) svc.registrarFallo(key, windowMs);
  assert.equal(svc.estaBloqueado(key, 5, windowMs).allowed, true);

  svc.reset(key);
  assert.equal(svc.estaBloqueado(key, 5, windowMs).remaining, 5);
});

test('limpieza de entradas vencidas: una llave vieja se elimina del mapa tras el barrido (maximo cada 30s)', () => {
  const { svc, advance } = withClock();
  const windowMs = 1000;

  svc.registrarFallo('vieja', windowMs);
  assert.equal(svc.size(), 1);

  advance(31_000); // vencida Y ya pasaron los 30s del barrido periodico
  // registrar un fallo de OTRA llave dispara el barrido general
  svc.registrarFallo('nueva', windowMs);

  assert.equal(svc.size(), 1); // "vieja" fue barrida, solo queda "nueva"
});

test('limpieza NO corre en cada fallo: antes de los 30s, una llave vencida sigue en el mapa (pero no bloquea)', () => {
  const { svc, advance } = withClock();
  const windowMs = 1000;

  svc.registrarFallo('vieja2', windowMs);
  advance(5000); // vencida por su propia ventana, pero faltan los 30s del barrido
  svc.registrarFallo('nueva2', windowMs);

  assert.equal(svc.size(), 2); // el barrido global todavía no corrió
  // pero el chequeo por llave sigue siendo correcto: "vieja2" ya no bloquea
  assert.equal(svc.estaBloqueado('vieja2', 1, windowMs).allowed, true);
});

test('tope de entradas: con más de 10.000 llaves distintas, descarta las más viejas', () => {
  const { svc, advance } = withClock();
  const windowMs = 60 * 60 * 1000; // ventana larga: nada expira por sí solo

  for (let i = 0; i < 10_000; i++) {
    svc.registrarFallo(`llave-${i}`, windowMs);
    advance(1); // cada una un poco más vieja que la anterior
  }
  assert.equal(svc.size(), 10_000);

  svc.registrarFallo('llave-nueva-10001', windowMs);

  assert.equal(svc.size(), 10_000); // se mantiene en el tope
  // la más vieja (llave-0) debe haber sido descartada
  assert.equal(svc.estaBloqueado('llave-0', 1, windowMs).remaining, 1);
  // la más nueva sigue presente con su fallo contado
  assert.equal(svc.estaBloqueado('llave-nueva-10001', 1, windowMs).allowed, false);
});

test('rendimiento: llenar 10.000+ llaves ya no tarda ~1s (barrido no es O(n) por intento)', () => {
  const { svc, advance } = withClock();
  const windowMs = 60 * 60 * 1000;

  const inicio = Date.now(); // tiempo real de ejecución, no el reloj simulado
  for (let i = 0; i < 10_000; i++) {
    svc.registrarFallo(`perf-${i}`, windowMs);
    advance(1); // nunca llega a los 30s del barrido durante todo el llenado
  }
  const ms = Date.now() - inicio;

  assert.equal(svc.size(), 10_000);
  assert.ok(ms < 300, `se esperaba <300ms con el barrido gateado, tardó ${ms}ms`);
});

test('normalización de llaves: trim, minúsculas y la misma normalización de slug que el login', () => {
  const { svc } = withClock();
  const windowMs = 15 * 60 * 1000;

  svc.registrarFallo('  IP1|Chenar Barber Shop|Owner@Test.com  ', windowMs);
  // Misma llave lógica escrita distinto (como el input crudo del login,
  // antes de slug con guiones) debe caer en el MISMO contador.
  const check = svc.estaBloqueado('ip1|chenar-barber-shop|owner@test.com', 1, windowMs);
  assert.equal(check.allowed, false); // ya tiene 1 fallo, tope 1 → bloqueada
});
