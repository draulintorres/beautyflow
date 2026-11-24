/**
 * Pruebas del login en dos pasos del SuperAdmin -- SIN base de datos real:
 * un Prisma falso en memoria (FakeSuperAdminPrisma) implementa solo los
 * métodos que SuperAdminTotpService usa de verdad. JwtService/ConfigService
 * son reales (igual que en portal-jwt-secret.test.ts) -- firman y
 * verifican JWT de verdad.
 */
import test from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin, generateSync } from 'otplib';
import { HEADERS_METADATA } from '@nestjs/common/constants.js';
import { SuperAdminTotpService } from '../src/modules/superadmin/superadmin-totp.service';
import { SuperAdminController } from '../src/modules/superadmin/superadmin.controller';
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
        if (where.totpSecretCifrado !== undefined && a.totpSecretCifrado !== where.totpSecretCifrado) return false;
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

// ---------- ETAPA 10c, commit 3b ----------
//
// Las pruebas de una verdadera carrera a nivel de base (dos solicitudes
// HTTP concurrentes, Promise.all contra Postgres real) están en la prueba
// de humo del PASO 2, no acá: el Prisma falso de este archivo es código
// síncrono en memoria -- un Promise.all sobre él nunca abre una ventana de
// carrera real, así que "probarlo" acá sería fingir una concurrencia que
// no existe. Lo que SÍ se puede probar con este Prisma falso es la lógica
// de la condición atómica en sí (el WHERE de cada updateMany), que es lo
// que de verdad impide la carrera cuando corre contra una base real.

// ---------- (a) iniciarAlta: una sola operación atómica ----------

test('iniciarAlta: si totpActivo ya es true, el updateMany atómico rechaza sin escribir ningún secreto (count 0)', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1', totpActivo: true });
  const totp = makeServicio(prisma);
  const challenge = totp.emitirChallenge('admin-1', 'alta');

  await assert.rejects(() => totp.iniciarAlta(challenge, '1.2.3.4'), ForbiddenException);
  // Nada se escribió: el secreto pendiente sigue null.
  assert.equal(prisma.admins.get('admin-1')!.totpSecretCifrado, null);
});

test('iniciarAlta: de dos altas sucesivas para el mismo admin, solo la última queda vigente -- la primera ya no puede confirmarse', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1' });
  const totp = makeServicio(prisma);

  const challenge1 = totp.emitirChallenge('admin-1', 'alta');
  const { secretoManual: secreto1 } = await totp.iniciarAlta(challenge1, '1.2.3.4');
  const codigo1 = generarCodigoEnPaso(secreto1, pasoActual());

  // Segunda alta (ej. el admin pidió un QR nuevo) pisa el secreto pendiente.
  const challenge2 = totp.emitirChallenge('admin-1', 'alta');
  const { secretoManual: secreto2 } = await totp.iniciarAlta(challenge2, '1.2.3.4');
  assert.notEqual(secreto1, secreto2);

  // El código de la PRIMERA alta ya no sirve: la base tiene el secreto de la segunda.
  const challengeConfirmar1 = totp.emitirChallenge('admin-1', 'alta');
  await assert.rejects(() => totp.confirmarAlta(challengeConfirmar1, codigo1, '1.2.3.4'), UnauthorizedException);

  // El código de la SEGUNDA sí activa.
  const codigo2 = generarCodigoEnPaso(secreto2, pasoActual());
  const challengeConfirmar2 = totp.emitirChallenge('admin-1', 'alta');
  const resultado = await totp.confirmarAlta(challengeConfirmar2, codigo2, '1.2.3.4');
  assert.equal(typeof resultado.accessToken, 'string');
});

// ---------- (b) confirmarAlta: compare-and-swap sobre totpSecretCifrado ----------

// Las dos pruebas de abajo parchan `updateMany` para simular, de forma
// determinista, una escritura concurrente justo entre la verificación del
// código (ya hecha, en memoria, con el secreto correcto) y el commit de la
// activación -- el único punto donde el CAS (y no el chequeo temprano de
// `admin.totpActivo` ni el descifrado) es lo que debe rechazar. Sin este
// parche, un Prisma falso y síncrono nunca abre esa ventana por sí solo.

test('confirmarAlta: CAS -- si totpSecretCifrado cambia justo antes del commit (otra iniciarAlta concurrente), rechaza aunque el código fuera válido', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1' });
  const totp = makeServicio(prisma);

  const challengeAlta = totp.emitirChallenge('admin-1', 'alta');
  const { secretoManual } = await totp.iniciarAlta(challengeAlta, '1.2.3.4');
  const codigo = generarCodigoEnPaso(secretoManual, pasoActual());

  const original = prisma.superAdmin.updateMany.bind(prisma.superAdmin);
  let parcheActivo = true;
  (prisma.superAdmin as any).updateMany = async (args: any) => {
    if (parcheActivo && args.data?.totpActivo === true) {
      parcheActivo = false;
      prisma.admins.get('admin-1')!.totpSecretCifrado = 'v1:b3RyYQ==:b3RyYQ==:b3RyYQ==';
    }
    return original(args);
  };

  const challengeConfirmar = totp.emitirChallenge('admin-1', 'alta');
  await assert.rejects(() => totp.confirmarAlta(challengeConfirmar, codigo, '1.2.3.4'), ForbiddenException);

  const fila = prisma.admins.get('admin-1')!;
  assert.equal(fila.totpActivo, false);
  assert.equal(prisma.codigos.length, 0);
});

test('confirmarAlta: código inválido no activa el 2FA (totpActivo sigue false y no se crean códigos de respaldo)', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1' });
  const totp = makeServicio(prisma);

  const challengeAlta = totp.emitirChallenge('admin-1', 'alta');
  await totp.iniciarAlta(challengeAlta, '1.2.3.4');

  const challengeConfirmar = totp.emitirChallenge('admin-1', 'alta');
  await assert.rejects(() => totp.confirmarAlta(challengeConfirmar, '000000', '1.2.3.4'), UnauthorizedException);

  const fila = prisma.admins.get('admin-1')!;
  assert.equal(fila.totpActivo, false);
  assert.equal(prisma.codigos.length, 0);
});

test('confirmarAlta: CAS -- si totpActivo se vuelve true justo antes del commit (otra confirmarAlta concurrente ganó), rechaza', async () => {
  const prisma = new FakeSuperAdminPrisma();
  prisma.crearAdmin({ id: 'admin-1' });
  const totp = makeServicio(prisma);

  const challengeAlta = totp.emitirChallenge('admin-1', 'alta');
  const { secretoManual } = await totp.iniciarAlta(challengeAlta, '1.2.3.4');
  const codigo = generarCodigoEnPaso(secretoManual, pasoActual());

  // A diferencia de mutar totpActivo ANTES de llamar a confirmarAlta (lo
  // que caería en el chequeo temprano de admin.totpActivo, no en el CAS),
  // el parche lo cambia DESPUÉS de que esta llamada ya pasó ese chequeo y
  // verificó el código -- justo antes de su propio updateMany de
  // activación -- para aislar específicamente la condición del CAS.
  const original = prisma.superAdmin.updateMany.bind(prisma.superAdmin);
  let parcheActivo = true;
  (prisma.superAdmin as any).updateMany = async (args: any) => {
    if (parcheActivo && args.data?.totpActivo === true) {
      parcheActivo = false;
      prisma.admins.get('admin-1')!.totpActivo = true;
    }
    return original(args);
  };

  const challengeConfirmar = totp.emitirChallenge('admin-1', 'alta');
  await assert.rejects(() => totp.confirmarAlta(challengeConfirmar, codigo, '1.2.3.4'), ForbiddenException);
  assert.equal(prisma.codigos.length, 0);
});

// ---------- (c) cabeceras no-store en los 3 endpoints ----------

test('cabeceras: iniciarAltaTotp, confirmarAltaTotp y verificarTotp declaran Cache-Control: no-store y Pragma: no-cache', () => {
  const metodos = ['iniciarAltaTotp', 'confirmarAltaTotp', 'verificarTotp'] as const;
  for (const metodo of metodos) {
    const headers: Array<{ name: string; value: string }> =
      Reflect.getMetadata(HEADERS_METADATA, (SuperAdminController.prototype as any)[metodo]) ?? [];
    const cacheControl = headers.find((h) => h.name === 'Cache-Control');
    const pragma = headers.find((h) => h.name === 'Pragma');
    assert.equal(cacheControl?.value, 'no-store', `${metodo} debe declarar Cache-Control: no-store`);
    assert.equal(pragma?.value, 'no-cache', `${metodo} debe declarar Pragma: no-cache`);
  }
});

// ---------- (d) comentario del schema no debe mentir sobre el algoritmo ----------

test('schema.prisma: el comentario de SuperAdminCodigoRespaldo.codigoHash dice SHA-256 (coherente con hashCodigoRespaldo)', () => {
  const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const inicio = schema.indexOf('model SuperAdminCodigoRespaldo');
  assert.notEqual(inicio, -1);
  const bloque = schema.slice(Math.max(0, inicio - 200), inicio + 400);
  assert.match(bloque, /SHA-256/);
  assert.doesNotMatch(bloque, /bcrypt/i);
});
