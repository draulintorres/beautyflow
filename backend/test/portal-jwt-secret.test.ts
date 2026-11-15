/**
 * Prueba de la separación de secretos del portal (ETAPA P3, commit 1).
 * node:test, sin base de datos. Usa JwtService y ConfigService REALES
 * (ambos instanciables directamente, sin DI) -- no son mocks: firma y
 * verifica tokens JWT de verdad contra PortalAuthGuard y TenantMiddleware
 * reales, igual que pasaría en producción.
 */
import test from 'node:test';
import * as assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext } from '@nestjs/common';
import { PortalAuthGuard } from '../src/modules/portal/guards/portal-auth.guard';
import { TenantMiddleware } from '../src/core/tenant/tenant.middleware';

const PORTAL_SECRET = 'portal-secret-de-prueba-xyz';
const ACCESS_SECRET = 'access-secret-de-prueba-xyz';

function makeConfig(): ConfigService {
  return new ConfigService({
    JWT_PORTAL_SECRET: PORTAL_SECRET,
    JWT_ACCESS_SECRET: ACCESS_SECRET,
  });
}

function makeContext(authHeader?: string): ExecutionContext {
  function fakeHandler() {}
  class FakeController {}
  const request: any = { headers: { authorization: authHeader } };
  return {
    getHandler: () => fakeHandler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

test('PortalAuthGuard: token de portal firmado con JWT_PORTAL_SECRET -> lo acepta', async () => {
  const jwt = new JwtService();
  const token = jwt.sign(
    { sub: 'cliente-1', empresaId: 'empresa-1', tipo: 'portal' },
    { secret: PORTAL_SECRET },
  );
  const guard = new PortalAuthGuard(new Reflector(), jwt, makeConfig());
  const ctx = makeContext(`Bearer ${token}`);

  const permitido = await guard.canActivate(ctx);
  assert.equal(permitido, true);
});

test('TenantMiddleware: un token de portal NO verifica con JWT_ACCESS_SECRET y no puebla req.user', () => {
  const jwt = new JwtService();
  const config = makeConfig();

  // Confirma primero que el token de portal, verificado directo contra
  // el secreto de acceso, lanza (son secretos distintos).
  const token = jwt.sign(
    { sub: 'cliente-1', empresaId: 'empresa-1', tipo: 'portal' },
    { secret: PORTAL_SECRET },
  );
  assert.throws(() => jwt.verify(token, { secret: ACCESS_SECRET }));

  // Y reproduce el comportamiento real de TenantMiddleware.use(): captura
  // ese error y sigue sin tocar req.user (equivalente a "ruta pública o
  // token no verificable con este secreto" -- ver su propio catch {}).
  const middleware = new TenantMiddleware(jwt, config);
  const req: any = { headers: { authorization: `Bearer ${token}` } };
  let nextCalled = false;
  middleware.use(req, {} as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user, undefined);
});

test('PortalAuthGuard: token de personal firmado con JWT_ACCESS_SECRET -> lo rechaza', async () => {
  const jwt = new JwtService();
  const token = jwt.sign(
    { sub: 'empleado-1', empresaId: 'empresa-1', rol: 'OWNER' },
    { secret: ACCESS_SECRET },
  );
  const guard = new PortalAuthGuard(new Reflector(), jwt, makeConfig());
  const ctx = makeContext(`Bearer ${token}`);

  await assert.rejects(() => guard.canActivate(ctx), /Token inválido o expirado/);
});
