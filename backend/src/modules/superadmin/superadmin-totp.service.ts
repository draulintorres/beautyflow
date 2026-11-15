import { Injectable, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import qrcode from 'qrcode-generator';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RateLimiterService } from '../../core/common/rate-limiter.service';
import { TooManyRequestsException } from '../../core/common/too-many-requests.exception';
import { normalizarIp } from '../../core/common/normalizar-ip.util';
import { cifrarSecreto, descifrarSecreto, TotpDecryptError } from '../../core/common/totp-crypto.util';
import { generarSecretoTotp, construirUriTotp, verificarCodigoTotp } from '../../core/common/totp.util';
import { generarCodigosRespaldo, hashCodigoRespaldo } from '../../core/common/codigos-respaldo.util';

type Fase = 'alta' | 'verificar';

interface ChallengePayload {
  sub: string;
  tipo: 'superadmin-challenge';
  fase: Fase;
}

interface AdminActivo {
  id: string;
  nombre: string;
  email: string;
  totpActivo: boolean;
  totpSecretCifrado: string | null;
  totpUltimoPaso: number | null;
}

export interface AdminPublico {
  id: string;
  nombre: string;
  email: string;
}

const MENSAJE_CODIGO_INVALIDO = 'Código incorrecto.';

/**
 * Segundo factor (TOTP) del SuperAdmin -- toda la lógica del login en dos
 * pasos vive aquí (challenge token, alta, verificación), separada de
 * SuperAdminService para poder probarla con un Prisma falso en memoria,
 * sin tocar la base real.
 */
@Injectable()
export class SuperAdminTotpService {
  private readonly logger = new Logger(SuperAdminTotpService.name);

  private static readonly CHALLENGE_TTL = '5m';
  private static readonly ACCESS_TTL = '8h';

  // Límite propio de iniciar-alta: cuenta toda SOLICITUD (éxito o no) --
  // limita con qué frecuencia se puede pedir un QR nuevo, no intentos
  // fallidos de un código.
  private static readonly ALTA_MAX = 10;
  private static readonly ALTA_WINDOW_MS = 15 * 60 * 1000;

  // confirmar-alta y verificar-totp comparten estas dos llaves -- cuentan
  // solo FALLOS (código incorrecto, repetido, o respaldo ya usado).
  private static readonly VERIF_MAX = 5;
  private static readonly VERIF_WINDOW_MS = 15 * 60 * 1000;
  private static readonly GLOBAL_MAX = 20;
  private static readonly GLOBAL_WINDOW_MS = 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /** Firma el token de desafío (fase 'alta' o 'verificar') que emite login()
   * tras una contraseña correcta -- NUNCA un accessToken real. */
  emitirChallenge(adminId: string, fase: Fase): string {
    const payload: ChallengePayload = { sub: adminId, tipo: 'superadmin-challenge', fase };
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_SUPERADMIN_SECRET'),
      expiresIn: SuperAdminTotpService.CHALLENGE_TTL,
    });
  }

  /** Verifica firma, expiración, tipo y fase del challenge token, y
   * RECARGA el admin de la base (activo, sin deletedAt) -- nunca confía
   * en nada del claim más allá del id. Un accessToken normal (tipo
   * 'superadmin') no pasa el chequeo de tipo de aquí. */
  private async verificarChallenge(token: string, faseEsperada: Fase): Promise<AdminActivo> {
    let payload: ChallengePayload;
    try {
      payload = this.jwt.verify<ChallengePayload>(token, {
        secret: this.config.getOrThrow('JWT_SUPERADMIN_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token de desafío inválido o expirado.');
    }

    if (payload.tipo !== 'superadmin-challenge' || payload.fase !== faseEsperada || !payload.sub) {
      throw new UnauthorizedException('Token de desafío inválido.');
    }

    const admin = await this.prisma.superAdmin.findFirst({
      where: { id: payload.sub, activo: true, deletedAt: null },
      select: {
        id: true,
        nombre: true,
        email: true,
        totpActivo: true,
        totpSecretCifrado: true,
        totpUltimoPaso: true,
      },
    });
    if (!admin) {
      throw new UnauthorizedException('Token de desafío inválido.');
    }
    return admin;
  }

  /** cifrarSecreto()/descifrarSecreto() leen process.env por defecto -- acá
   * se usa siempre el ConfigService inyectado (igual que el resto del
   * servicio), no el proceso global, para que las pruebas con un
   * ConfigService falso funcionen sin tocar process.env real. */
  private envTotp(): NodeJS.ProcessEnv {
    return { TOTP_ENCRYPTION_KEY: this.config.getOrThrow('TOTP_ENCRYPTION_KEY') } as NodeJS.ProcessEnv;
  }

  private emitirAccessToken(adminId: string): string {
    return this.jwt.sign(
      { sub: adminId, tipo: 'superadmin' },
      { secret: this.config.getOrThrow('JWT_SUPERADMIN_SECRET'), expiresIn: SuperAdminTotpService.ACCESS_TTL },
    );
  }

  private asegurarNoBloqueado(key: string, max: number, windowMs: number): void {
    const check = this.rateLimiter.estaBloqueado(key, max, windowMs);
    if (!check.allowed) {
      throw new TooManyRequestsException(
        check.retryAfterSeconds,
        `Demasiados intentos. Intenta de nuevo en ${Math.ceil(check.retryAfterSeconds / 60)} minutos.`,
      );
    }
  }

  /** Registra un fallo en ambas llaves (IP+admin y global del admin) y
   * devuelve el mismo mensaje genérico para código incorrecto, repetido o
   * respaldo ya usado -- sin pistas de cuál fue el caso. */
  private registrarFalloSegundoPaso(ipKey: string, globalKey: string, adminId: string, ip: string): string {
    this.rateLimiter.registrarFallo(ipKey, SuperAdminTotpService.VERIF_WINDOW_MS);
    this.rateLimiter.registrarFallo(globalKey, SuperAdminTotpService.GLOBAL_WINDOW_MS);
    this.logger.warn(`Fallo de segundo factor (adminId=${adminId}, ip=${normalizarIp(ip)})`);

    const check = this.rateLimiter.estaBloqueado(ipKey, SuperAdminTotpService.VERIF_MAX, SuperAdminTotpService.VERIF_WINDOW_MS);
    return check.remaining > 0
      ? `${MENSAJE_CODIGO_INVALIDO} Intentos restantes: ${check.remaining}.`
      : MENSAJE_CODIGO_INVALIDO;
  }

  /** Genera (o reemplaza) el secreto TOTP pendiente y devuelve su QR --
   * SVG generado en el servidor, nunca con un servicio externo. */
  async iniciarAlta(challengeToken: string, ip: string): Promise<{ qr: string; secretoManual: string }> {
    const admin = await this.verificarChallenge(challengeToken, 'alta');

    const rlKey = `admin-totp-alta:${normalizarIp(ip)}|${admin.id}`;
    this.asegurarNoBloqueado(rlKey, SuperAdminTotpService.ALTA_MAX, SuperAdminTotpService.ALTA_WINDOW_MS);
    this.rateLimiter.registrarFallo(rlKey, SuperAdminTotpService.ALTA_WINDOW_MS);

    // Chequeado en la BASE (admin ya recargado arriba), no en el claim del
    // challenge token.
    if (admin.totpActivo) {
      throw new ForbiddenException('El segundo factor ya está activo para esta cuenta.');
    }

    const secreto = generarSecretoTotp();
    const cifrado = cifrarSecreto(secreto, admin.id, this.envTotp());
    await this.prisma.superAdmin.update({
      where: { id: admin.id },
      data: { totpSecretCifrado: cifrado },
    });

    const uri = construirUriTotp(secreto, admin.email);
    const qr = qrcode(0, 'M');
    qr.addData(uri);
    qr.make();
    const svg = qr.createSvgTag({ scalable: true });
    const qrDataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

    return { qr: qrDataUri, secretoManual: secreto };
  }

  /** Confirma la alta con el primer código, activa el 2FA (updateMany
   * condicional) y genera los 8 códigos de respaldo -- todo en una
   * transacción. Devuelve el accessToken real recién ahí. */
  async confirmarAlta(
    challengeToken: string,
    codigo: string | undefined,
    ip: string,
  ): Promise<{ accessToken: string; admin: AdminPublico; codigosRespaldo: string[] }> {
    const admin = await this.verificarChallenge(challengeToken, 'alta');

    if (admin.totpActivo) {
      throw new ForbiddenException('El segundo factor ya está activo para esta cuenta.');
    }
    if (!admin.totpSecretCifrado) {
      throw new ForbiddenException('No hay una alta de segundo factor pendiente -- solicita un QR nuevo.');
    }

    const ipKey = `admin-totp:${normalizarIp(ip)}|${admin.id}`;
    const globalKey = `admin-totp-global:${admin.id}`;
    this.asegurarNoBloqueado(ipKey, SuperAdminTotpService.VERIF_MAX, SuperAdminTotpService.VERIF_WINDOW_MS);
    this.asegurarNoBloqueado(globalKey, SuperAdminTotpService.GLOBAL_MAX, SuperAdminTotpService.GLOBAL_WINDOW_MS);

    let secretoPlano: string;
    try {
      secretoPlano = descifrarSecreto(admin.totpSecretCifrado, admin.id, this.envTotp());
    } catch (err) {
      if (err instanceof TotpDecryptError) {
        this.logger.error(`Fallo al descifrar el secreto TOTP pendiente (adminId=${admin.id})`);
        throw new UnauthorizedException(this.registrarFalloSegundoPaso(ipKey, globalKey, admin.id, ip));
      }
      throw err;
    }

    const resultado = await verificarCodigoTotp(codigo, secretoPlano, admin.totpUltimoPaso ?? undefined);
    if (!resultado.valido) {
      throw new UnauthorizedException(this.registrarFalloSegundoPaso(ipKey, globalKey, admin.id, ip));
    }

    const codigosRespaldo = generarCodigosRespaldo();
    const hashes = codigosRespaldo.map((c) => hashCodigoRespaldo(c));

    const activado = await this.prisma.$transaction(async (tx) => {
      const resultadoUpdate = await tx.superAdmin.updateMany({
        where: { id: admin.id, totpActivo: false },
        data: { totpActivo: true, totpUltimoPaso: resultado.paso },
      });
      if (resultadoUpdate.count !== 1) return false;

      await tx.superAdminCodigoRespaldo.deleteMany({ where: { superAdminId: admin.id } });
      await tx.superAdminCodigoRespaldo.createMany({
        data: hashes.map((codigoHash) => ({ superAdminId: admin.id, codigoHash })),
      });
      return true;
    });

    if (!activado) {
      // Alguien más ya activó esta cuenta entre el chequeo y el commit.
      throw new ForbiddenException('El segundo factor ya está activo para esta cuenta.');
    }

    this.rateLimiter.reset(ipKey);
    await this.prisma.superAdmin.update({ where: { id: admin.id }, data: { ultimoLogin: new Date() } });
    this.logger.log(`Segundo factor activado (adminId=${admin.id})`);

    return {
      accessToken: this.emitirAccessToken(admin.id),
      admin: { id: admin.id, nombre: admin.nombre, email: admin.email },
      codigosRespaldo,
    };
  }

  /** Verifica el segundo paso de un login ya con 2FA activo -- código TOTP
   * o un código de respaldo. Éxito: accessToken real de 8h, igual que el
   * login de antes. */
  async verificarTotp(
    challengeToken: string,
    codigo: string | undefined,
    codigoRespaldo: string | undefined,
    ip: string,
  ): Promise<{ accessToken: string; admin: AdminPublico }> {
    const admin = await this.verificarChallenge(challengeToken, 'verificar');

    if (!admin.totpActivo) {
      throw new ForbiddenException('El segundo factor no está activo para esta cuenta.');
    }

    const ipKey = `admin-totp:${normalizarIp(ip)}|${admin.id}`;
    const globalKey = `admin-totp-global:${admin.id}`;
    this.asegurarNoBloqueado(ipKey, SuperAdminTotpService.VERIF_MAX, SuperAdminTotpService.VERIF_WINDOW_MS);
    this.asegurarNoBloqueado(globalKey, SuperAdminTotpService.GLOBAL_MAX, SuperAdminTotpService.GLOBAL_WINDOW_MS);

    const usaRespaldo = typeof codigoRespaldo === 'string' && codigoRespaldo.trim() !== '';

    if (usaRespaldo) {
      // Camino de código de respaldo: NUNCA toca totpSecretCifrado -- si el
      // secreto TOTP quedara indescifrable, los códigos de respaldo
      // siguen funcionando igual (son independientes, por hash).
      const consumido = await this.consumirCodigoRespaldo(admin.id, codigoRespaldo as string);
      if (!consumido) {
        throw new UnauthorizedException(this.registrarFalloSegundoPaso(ipKey, globalKey, admin.id, ip));
      }
      this.logger.warn(`Código de respaldo consumido (adminId=${admin.id})`);
    } else {
      if (!admin.totpSecretCifrado) {
        throw new UnauthorizedException(this.registrarFalloSegundoPaso(ipKey, globalKey, admin.id, ip));
      }

      let secretoPlano: string;
      try {
        secretoPlano = descifrarSecreto(admin.totpSecretCifrado, admin.id, this.envTotp());
      } catch (err) {
        if (err instanceof TotpDecryptError) {
          this.logger.error(`Fallo al descifrar el secreto TOTP (adminId=${admin.id})`);
          throw new UnauthorizedException(this.registrarFalloSegundoPaso(ipKey, globalKey, admin.id, ip));
        }
        throw err;
      }

      const resultado = await verificarCodigoTotp(codigo, secretoPlano, admin.totpUltimoPaso ?? undefined);
      if (!resultado.valido) {
        throw new UnauthorizedException(this.registrarFalloSegundoPaso(ipKey, globalKey, admin.id, ip));
      }

      // Anti-repetición real en la base: avanza totpUltimoPaso solo si el
      // paso nuevo es mayor que el último aceptado -- count!==1 significa
      // que este paso (o uno más reciente) ya se usó.
      const avance = await this.prisma.superAdmin.updateMany({
        where: {
          id: admin.id,
          OR: [{ totpUltimoPaso: null }, { totpUltimoPaso: { lt: resultado.paso } }],
        },
        data: { totpUltimoPaso: resultado.paso },
      });
      if (avance.count !== 1) {
        throw new UnauthorizedException(this.registrarFalloSegundoPaso(ipKey, globalKey, admin.id, ip));
      }
    }

    this.rateLimiter.reset(ipKey);
    await this.prisma.superAdmin.update({ where: { id: admin.id }, data: { ultimoLogin: new Date() } });

    return {
      accessToken: this.emitirAccessToken(admin.id),
      admin: { id: admin.id, nombre: admin.nombre, email: admin.email },
    };
  }

  private async consumirCodigoRespaldo(superAdminId: string, entrada: string): Promise<boolean> {
    const hash = hashCodigoRespaldo(entrada);
    const fila = await this.prisma.superAdminCodigoRespaldo.findFirst({
      where: { superAdminId, codigoHash: hash, usadoEn: null },
    });
    if (!fila) return false;

    const consumo = await this.prisma.superAdminCodigoRespaldo.updateMany({
      where: { id: fila.id, usadoEn: null },
      data: { usadoEn: new Date() },
    });
    return consumo.count === 1;
  }
}
