/**
 * Pruebas del login en dos pasos del SuperAdmin -- SIN base de datos real:
 * un Prisma falso en memoria (FakeSuperAdminPrisma) implementa solo los
 * métodos que SuperAdminTotpService usa de verdad. JwtService/ConfigService
 * son reales (igual que en portal-jwt-secret.test.ts) -- firman y
 * verifican JWT de verdad.
 */
import test from 'node:test';
import * as assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin, generateSync } from 'otplib';
import { SuperAdminTotpService } from '../src/modules/superadmin/superadmin-totp.service';
import { SuperAdminService } from '../src/modules/superadmin/superadmin.service';
import { SuperAdminGuard } from '../src/modules/superadmin/guards/superadmin.guard';
import { RateLimiterService } from '../src/core/common/rate-limiter.service';
import { TooManyRequestsException } from '../src/core/common/too-many-requests.exception';
import { cifrarSecreto } from '../src/core/common/totp-crypto.util';

const JWT_SUPERADMIN_SECRET = 'superadmin-secret-de-prueba-xyz';
const TOTP_ENCRYPTION_KEY = 'a'.repeat(64);

function makeConfig(): ConfigService {
  return new ConfigService({
    JWT_SUPERADMIN_SECRET,
    TOTP_ENCRYPTION_KEY,
    FRONTEND_URL: 'http://localhost',
  });
}

// ---------- Prisma falso en memoria ----------

interface FilaAdmin {
  id: string;
  nombre: string;
  email: string;
  passwordHash: string;
  activo: boolean;
  deletedAt: Date | null;
  totpActivo: boolean;
  totpSecretCifrado: string | null;
  totpUltimoPaso: number | null;
  ultimoLogin: Date | null;
}

interface FilaCodigo {
  id: string;
  superAdminId: string;
  codigoHash: string;
  usadoEn: Date | null;
}

class FakeSuperAdminPrisma {
  admins = new Map<string, FilaAdmin>();
  codigos: FilaCodigo[] = [];
  private contador = 0;

  crearAdmin(datos: Partial<FilaAdmin> & { id: string }): FilaAdmin {
    const fila: FilaAdmin = {
      nombre: 'Draulin',
      email: 'admin@estixa.com',
      passwordHash: '',
      activo: true,
      deletedAt: null,
      totpActivo: false,
      totpSecretCifrado: null,
      totpUltimoPaso: null,
      ultimoLogin: null,
      ...datos,
    };
    this.admins.set(fila.id, fila);
    return fila;
  }

  superAdmin = {
    findUnique: async ({ where }: any) => {
      if (where.id) return this.admins.get(where.id) ?? null;
      if (where.email) return [...this.admins.values()].find((a) => a.email === where.email) ?? null;
      return null;
    },
    findFirst: async ({ where, select }: any) => {
      const fila = [...this.admins.values()].find(
        (a) =>
          a.id === where.id &&
          (where.activo === undefined || a.activo === where.activo) &&
          (where.deletedAt === undefined || a.deletedAt === where.deletedAt),
      );
      if (!fila) return null;
      if (!select) return { ...fila };
      const proyectada: any = {};
      for (const k of Object.keys(select)) proyectada[k] = (fila as any)[k];
      return proyectada;
    },
    update: async ({ where, data }: any) => {
      const fila = this.admins.get(where.id);
      if (!fila) throw new Error('fila inexistente');
      Object.assign(fila, data);
      return { ...fila };
    },
    updateMany: async ({ where, data }: any) => {
      const candidatos = [...this.admins.values()].filter((a) => {
        if (a.id !== where.id) return false;
        if (where.totpActivo !== undefined && a.totpActivo !== where.totpActivo) return false;
        if (where.OR) {
          const pasaOr = where.OR.some((cond: any) => {
            if (Object.prototype.hasOwnProperty.call(cond, 'totpUltimoPaso') && cond.totpUltimoPaso === null) {
              return a.totpUltimoPaso === null;
            }
            if (cond.totpUltimoPaso?.lt !== undefined) {
              return a.totpUltimoPaso !== null && a.totpUltimoPaso < cond.totpUltimoPaso.lt;
            }
            return false;
          });
          if (!pasaOr) return false;
        }
        return true;
      });
      for (const fila of candidatos) Object.assign(fila, data);
      return { count: candidatos.length };
    },
  };

  superAdminCodigoRespaldo = {
    deleteMany: async ({ where }: any) => {
      const antes = this.codigos.length;
      this.codigos = this.codigos.filter((c) => c.superAdminId !== where.superAdminId);
      return { count: antes - this.codigos.length };
    },
    createMany: async ({ data }: any) => {
      for (const d of data) {
        this.codigos.push({ id: `codigo-${++this.contador}`, usadoEn: null, ...d });
      }
      return { count: data.length };
    },
    findFirst: async ({ where }: any) => {
      return (
        this.codigos.find(
          (c) => c.superAdminId === where.superAdminId && c.codigoHash === where.codigoHash && c.usadoEn === where.usadoEn,
        ) ?? null
      );
    },
    updateMany: async ({ where, data }: any) => {
      const candidatos = this.codigos.filter(
        (c) => c.id === where.id && (where.usadoEn === undefined || c.usadoEn === where.usadoEn),
      );
      for (const c of candidatos) Object.assign(c, data);
      return { count: candidatos.length };
    },
  };

  async $transaction(cb: (tx: this) => Promise<any>) {
    return cb(this);
  }
}

function makeServicio(prisma: FakeSuperAdminPrisma) {
  return new SuperAdminTotpService(
    prisma as any,
    new JwtService(),
    makeConfig(),
    new RateLimiterService(),
  );
}

function generarCodigoEnPaso(secretoBase32: string, paso: number): string {
  const base32 = new ScureBase32Plugin();
  const raw = base32.decode(secretoBase32);
  return generateSync({
    secret: raw,
    epoch: paso * 30,
    period: 30,
    digits: 6,
    algorithm: 'sha1',
    crypto: new NobleCryptoPlugin(),
  });
}

function pasoActual(): number {
  return Math.floor(Date.now() / 1000 / 30);
}

// ---------- login() nunca devuelve accessToken ----------

test('login(): con contraseña correcta, nunca devuelve accessToken (solo challengeToken)', async () => {
  const bcrypt = await import('bcrypt');
  const prisma = new FakeSuperAdminPrisma();
  const passwordHash = await bcrypt.hash('Password123', 10);
  prisma.crearAdmin({ id: 'admin-1', passwordHash });

  const totp = makeServicio(prisma);
  const sa = new SuperAdminService(
    prisma as any,
    makeConfig(),
    {} as any, // ModulosEfectivosService -- no lo usa login()
    {} as any, // EmailService -- no lo usa login()
    new RateLimiterService(),
    totp,
  );

  const resultado: any = await sa.login({ email: 'admin@estixa.com', password: 'Password123' }, '1.2.3.4');
  assert.equal('accessToken' in resultado, false);
  assert.equal(typeof resultado.challengeToken, 'string');
  assert.equal(resultado.requiereAlta, true); // admin nuevo, sin 2FA activo
});

// ---------- el token de desafío nunca sirve como accessToken ----------

test('SuperAdminGuard real: rechaza un token de desafío (tipo superadmin-challenge)', () => {
  const jwt = new JwtService();
  const config = makeConfig();
  const totp = makeServicio(new FakeSuperAdminPrisma());

  const challenge = totp.emitirChallenge('admin-1', 'alta');
  const guard = new SuperAdminGuard(new Reflector(), jwt, config);

  function fakeHandler() {}
  class FakeController {}
  const request: any = { headers: { authorization: `Bearer ${challenge}` } };
  const ctx = {
    getHandler: () => fakeHandler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  assert.throws(() => guard.canActivate(ctx), UnauthorizedException);
});

test('un accessToken normal (tipo superadmin) es rechazado por los endpoints de segundo paso', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1' });
  const totp = makeServicio(prisma);

  const jwt = new JwtService();
  const accessTokenNormal = jwt.sign({ sub: 'admin-1', tipo: 'superadmin' }, { secret: JWT_SUPERADMIN_SECRET, expiresIn: '8h' });

  await assert.rejects(() => totp.iniciarAlta(accessTokenNormal, '1.2.3.4'), UnauthorizedException);
});

// ---------- desafío vencido / firmado con otro secreto ----------

test('desafío vencido: rechazado', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1' });
  const totp = makeServicio(prisma);

  const jwt = new JwtService();
  const vencido = jwt.sign(
    { sub: 'admin-1', tipo: 'superadmin-challenge', fase: 'alta' },
    { secret: JWT_SUPERADMIN_SECRET, expiresIn: -10 },
  );

  await assert.rejects(() => totp.iniciarAlta(vencido, '1.2.3.4'), UnauthorizedException);
});

test('desafío firmado con otro secreto: rechazado', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1' });
  const totp = makeServicio(prisma);

  const jwt = new JwtService();
  const otroSecreto = jwt.sign(
    { sub: 'admin-1', tipo: 'superadmin-challenge', fase: 'alta' },
    { secret: 'otro-secreto-cualquiera', expiresIn: '5m' },
  );

  await assert.rejects(() => totp.iniciarAlta(otroSecreto, '1.2.3.4'), UnauthorizedException);
});

// ---------- iniciar-alta / confirmar-alta rechazan si totpActivo=true ----------

test('iniciar-alta: 403 si el admin ya tiene totpActivo=true (comprobado en la base)', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1', totpActivo: true });
  const totp = makeServicio(prisma);
  const challenge = totp.emitirChallenge('admin-1', 'alta');

  await assert.rejects(() => totp.iniciarAlta(challenge, '1.2.3.4'), ForbiddenException);
});

test('confirmar-alta: 403 si el admin ya tiene totpActivo=true', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1', totpActivo: true });
  const totp = makeServicio(prisma);
  const challenge = totp.emitirChallenge('admin-1', 'alta');

  await assert.rejects(() => totp.confirmarAlta(challenge, '123456', '1.2.3.4'), ForbiddenException);
});

// ---------- confirmar-alta exitoso ----------

test('confirmar-alta con código correcto: activa, devuelve 8 códigos de respaldo y accessToken', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1' });
  const totp = makeServicio(prisma);

  const challengeAlta = totp.emitirChallenge('admin-1', 'alta');
  const { secretoManual, qr } = await totp.iniciarAlta(challengeAlta, '1.2.3.4');

  assert.match(qr, /^data:image\/svg\+xml;base64,/);
  const svgDecodificado = Buffer.from(qr.split(',')[1], 'base64').toString('utf8');
  assert.equal(svgDecodificado.startsWith('<svg'), true);
  assert.equal(svgDecodificado.includes(secretoManual), false);

  const paso = pasoActual();
  const codigo = generarCodigoEnPaso(secretoManual, paso);

  const resultado = await totp.confirmarAlta(challengeAlta, codigo, '1.2.3.4');
  assert.equal(typeof resultado.accessToken, 'string');
  assert.equal(resultado.codigosRespaldo.length, 8);
  assert.equal(new Set(resultado.codigosRespaldo).size, 8);

  const filaAdmin = prisma.admins.get('admin-1')!;
  assert.equal(filaAdmin.totpActivo, true);
  assert.equal(filaAdmin.totpUltimoPaso, paso);
  assert.equal(filaAdmin.ultimoLogin !== null, true);
  assert.equal(prisma.codigos.length, 8);
});

// ---------- repetición del mismo paso ----------

test('verificar-totp: repetir el mismo paso ya usado se rechaza (updateMany count 0)', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1' });
  const totp = makeServicio(prisma);

  const challengeAlta = totp.emitirChallenge('admin-1', 'alta');
  const { secretoManual } = await totp.iniciarAlta(challengeAlta, '1.2.3.4');
  const paso = pasoActual();
  const codigo = generarCodigoEnPaso(secretoManual, paso);
  await totp.confirmarAlta(challengeAlta, codigo, '1.2.3.4'); // activa, totpUltimoPaso=paso

  const challengeVerificar = totp.emitirChallenge('admin-1', 'verificar');
  // Mismo código, mismo paso -> ya se usó para activar.
  await assert.rejects(() => totp.verificarTotp(challengeVerificar, codigo, undefined, '1.2.3.4'), UnauthorizedException);
});

// ---------- código de respaldo: un solo uso ----------

test('verificar-totp: un código de respaldo usado dos veces -- el segundo falla', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1' });
  const totp = makeServicio(prisma);

  const challengeAlta = totp.emitirChallenge('admin-1', 'alta');
  const { secretoManual } = await totp.iniciarAlta(challengeAlta, '1.2.3.4');
  const { codigosRespaldo } = await totp.confirmarAlta(
    challengeAlta,
    generarCodigoEnPaso(secretoManual, pasoActual()),
    '1.2.3.4',
  );

  const challengeVerificar1 = totp.emitirChallenge('admin-1', 'verificar');
  const r1 = await totp.verificarTotp(challengeVerificar1, undefined, codigosRespaldo[0], '1.2.3.4');
  assert.equal(typeof r1.accessToken, 'string');

  const challengeVerificar2 = totp.emitirChallenge('admin-1', 'verificar');
  await assert.rejects(
    () => totp.verificarTotp(challengeVerificar2, undefined, codigosRespaldo[0], '1.2.3.4'),
    UnauthorizedException,
  );
});

// ---------- límite IP+admin y tope global ----------

test('verificar-totp: límite IP+admin (5 fallos/15min) bloquea con 429', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1' });
  const totp = makeServicio(prisma);

  const challengeAlta = totp.emitirChallenge('admin-1', 'alta');
  const { secretoManual } = await totp.iniciarAlta(challengeAlta, '1.2.3.4');
  await totp.confirmarAlta(challengeAlta, generarCodigoEnPaso(secretoManual, pasoActual()), '1.2.3.4');

  for (let i = 0; i < 5; i++) {
    const challenge = totp.emitirChallenge('admin-1', 'verificar');
    await assert.rejects(() => totp.verificarTotp(challenge, '000000', undefined, '9.9.9.9'), UnauthorizedException);
  }

  const challenge6 = totp.emitirChallenge('admin-1', 'verificar');
  await assert.rejects(() => totp.verificarTotp(challenge6, '000000', undefined, '9.9.9.9'), TooManyRequestsException);
});

test('verificar-totp: tope global (20 fallos/60min) bloquea aunque cada intento venga de una IP distinta', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1' });
  const totp = makeServicio(prisma);

  const challengeAlta = totp.emitirChallenge('admin-1', 'alta');
  const { secretoManual } = await totp.iniciarAlta(challengeAlta, '1.2.3.4');
  await totp.confirmarAlta(challengeAlta, generarCodigoEnPaso(secretoManual, pasoActual()), '1.2.3.4');

  // 20 fallos, cada uno desde una IP distinta -- el límite IP+admin (5)
  // nunca se alcanza porque cada IP solo falla una vez, pero el tope
  // global por admin sí debe acumular los 20.
  for (let i = 0; i < 20; i++) {
    const challenge = totp.emitirChallenge('admin-1', 'verificar');
    await assert.rejects(
      () => totp.verificarTotp(challenge, '000000', undefined, `10.0.0.${i}`),
      UnauthorizedException,
    );
  }

  const challengeFinal = totp.emitirChallenge('admin-1', 'verificar');
  await assert.rejects(
    () => totp.verificarTotp(challengeFinal, '000000', undefined, '10.0.0.99'),
    TooManyRequestsException,
  );
});

// ---------- fallo de descifrado cierra, pero el respaldo sigue sirviendo ----------

test('verificar-totp: secreto TOTP indescifrable falla cerrado, pero un código de respaldo sigue funcionando', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1' });
  const totp = makeServicio(prisma);

  const challengeAlta = totp.emitirChallenge('admin-1', 'alta');
  const { secretoManual } = await totp.iniciarAlta(challengeAlta, '1.2.3.4');
  const { codigosRespaldo } = await totp.confirmarAlta(
    challengeAlta,
    generarCodigoEnPaso(secretoManual, pasoActual()),
    '1.2.3.4',
  );

  // Corrompe el secreto cifrado guardado (simula clave rotada / dato alterado).
  const fila = prisma.admins.get('admin-1')!;
  fila.totpSecretCifrado = 'v1:aaaa:bbbb:cccc';

  const challengeConCodigo = totp.emitirChallenge('admin-1', 'verificar');
  await assert.rejects(
    () => totp.verificarTotp(challengeConCodigo, '123456', undefined, '1.2.3.4'),
    UnauthorizedException,
  );

  // El código de respaldo no depende de totpSecretCifrado -- sigue funcionando.
  const challengeConRespaldo = totp.emitirChallenge('admin-1', 'verificar');
  const resultado = await totp.verificarTotp(challengeConRespaldo, undefined, codigosRespaldo[0], '1.2.3.4');
  assert.equal(typeof resultado.accessToken, 'string');
});
