/**
 * Prueba unitaria de JwtAuthGuard (ETAPA 10a, ajuste 4). node:test, sin
 * base de datos y sin dependencias nuevas -- Reflector es instanciable
 * directamente (no requiere DI), y un ExecutionContext/Request se simulan
 * con objetos mínimos, igual que haría Nest en tiempo de ejecución.
 */
import test from 'node:test';
import * as assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../src/core/auth/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../src/core/auth/decorators/auth.decorators';

function makeContext(options: { user?: any; isPublic?: boolean }): ExecutionContext {
  class FakeController {}
  function fakeHandler() {}

  if (options.isPublic) {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, fakeHandler);
  }

  const request = { user: options.user };

  return {
    getHandler: () => fakeHandler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

test('JwtAuthGuard: token de portal (tipo==="portal") -> 401', () => {
  const guard = new JwtAuthGuard(new Reflector());
  const ctx = makeContext({ user: { usuarioId: 'cliente-1', tipo: 'portal' } });
  assert.throws(() => guard.canActivate(ctx), /Autenticación requerida/);
});

test('JwtAuthGuard: usuario de personal con usuarioId -> permite', () => {
  const guard = new JwtAuthGuard(new Reflector());
  const ctx = makeContext({ user: { usuarioId: 'empleado-1', rol: 'OWNER' } });
  assert.equal(guard.canActivate(ctx), true);
});

test('JwtAuthGuard: ruta @Public() -> permite sin mirar el usuario', () => {
  const guard = new JwtAuthGuard(new Reflector());
  const ctx = makeContext({ isPublic: true, user: undefined });
  assert.equal(guard.canActivate(ctx), true);
});

test('JwtAuthGuard: sin usuario -> 401', () => {
  const guard = new JwtAuthGuard(new Reflector());
  const ctx = makeContext({ user: undefined });
  assert.throws(() => guard.canActivate(ctx), /Autenticación requerida/);
});
