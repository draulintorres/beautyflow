import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmpresaStatus, RoleKey } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { ModulosEfectivosService } from '../../modules/superadmin/modulos-efectivos.service';
import { EmailService } from '../email/email.service';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type WebAuthnCredential as SimpleWebAuthnCredential,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';

interface JwtPayload {
  sub: string;
  empresaId: string;
  rol: string;
}

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtl: string;
  private readonly refreshTtlMs: number;
  private readonly webauthnRpId: string;
  private readonly webauthnOrigin: string;
  private readonly webauthnRpName: string;
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly modulosEfectivos: ModulosEfectivosService,
    private readonly email: EmailService,
  ) {
    this.accessSecret = this.config.getOrThrow('JWT_ACCESS_SECRET');
    this.refreshSecret = this.config.getOrThrow('JWT_REFRESH_SECRET');
    this.accessTtl = this.config.get('JWT_ACCESS_TTL') ?? '15m';
    this.refreshTtlMs = 7 * 24 * 60 * 60 * 1000; // 7 días
    this.webauthnRpId = this.config.getOrThrow('WEBAUTHN_RP_ID');
    this.webauthnOrigin = this.config.getOrThrow('WEBAUTHN_ORIGIN');
    this.webauthnRpName = this.config.get('WEBAUTHN_RP_NAME') ?? 'Estixa';
    this.frontendUrl = this.config.getOrThrow('FRONTEND_URL');
  }

  /**
   * Resuelve la empresa a partir de lo que la persona escribió en el campo
   * "Empresa" del login, tolerando que no haya escrito los guiones exactos
   * (ej. "chenarbarbershop" o "Chenar Barber Shop" → "chenar-barber-shop").
   * 1) Intento exacto contra el slug normalizado (minúsculas, espacios→guión).
   * 2) Si no hay match, comparo ese mismo valor SIN guiones contra los
   *    slugs de empresas activas también sin guiones — la tabla es chica,
   *    trae los candidatos y compara en código es más simple que SQL crudo.
   *    Si hay más de una coincidencia (colisión), no adivino: se trata
   *    igual que "no encontrada", y la persona debe escribir el slug
   *    completo con guiones.
   */
  private async resolverEmpresaPorSlug(slugInput: string) {
    const normalizado = slugInput.trim().toLowerCase().replace(/\s+/g, '-');

    const exacta = await this.prisma.empresa.findUnique({
      where: { slug: normalizado },
    });
    if (exacta) return exacta;

    const sinGuiones = normalizado.replace(/-/g, '');
    if (!sinGuiones) return null;

    const activas = await this.prisma.empresa.findMany({
      where: { estado: EmpresaStatus.ACTIVE, deletedAt: null },
    });
    const coincidencias = activas.filter(
      (e) => e.slug.toLowerCase().replace(/-/g, '') === sinGuiones,
    );
    return coincidencias.length === 1 ? coincidencias[0] : null;
  }

  // ---------- LOGIN ----------
  async login(empresaSlug: string, email: string, password: string) {
    const empresa = await this.resolverEmpresaPorSlug(empresaSlug);
    if (!empresa || empresa.deletedAt || empresa.estado !== EmpresaStatus.ACTIVE) {
      throw new UnauthorizedException('Empresa no disponible');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { empresaId_email: { empresaId: empresa.id, email } },
      include: { rol: true },
    });
    if (!usuario || usuario.deletedAt || !usuario.activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const valid = await bcrypt.compare(password, usuario.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoLogin: new Date() },
    });

    return this.buildAuthResponse(usuario, usuario.rol.roleKey, empresa.id, empresa.slug);
  }

  // ---------- REFRESH ----------
  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        usuarioId: payload.sub,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!stored) {
      throw new UnauthorizedException('Sesión no válida');
    }

    // Rotación: revocar el usado y emitir uno nuevo
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens({
      sub: payload.sub,
      empresaId: payload.empresaId,
      rol: payload.rol,
    });
  }

  // ---------- LOGOUT ----------
  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  // ---------- FORGOT PASSWORD ----------
  async forgotPassword(empresaSlug: string, email: string) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { slug: empresaSlug },
    });

    // Respuesta uniforme para no filtrar si el email existe
    const generic = {
      message:
        'Si el correo existe, recibirás instrucciones para restablecer tu contraseña.',
    };
    if (!empresa) return generic;

    const usuario = await this.prisma.usuario.findUnique({
      where: { empresaId_email: { empresaId: empresa.id, email } },
    });
    if (!usuario || !usuario.activo || usuario.deletedAt) return generic;

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { resetToken: tokenHash, resetTokenExpires: expires },
    });

    // El correo se manda "fire and forget" (no se espera aquí, ni su
    // fallo cambia la respuesta): la respuesta al pedir el reseteo debe
    // ser SIEMPRE la misma, exista la cuenta o no, y sin importar si el
    // envío del correo en sí tuvo éxito — eso es responsabilidad de
    // EmailService (loguea el error, nunca lo relanza).
    const link = `${this.frontendUrl}/reset-password?token=${rawToken}`;
    void this.email.enviar(
      email,
      'Restablecer tu contraseña — Estixa',
      `
        <p>Recibimos una solicitud para restablecer tu contraseña en <b>${empresa.nombre}</b>.</p>
        <p><a href="${link}">Haz clic aquí para crear una contraseña nueva</a></p>
        <p>Este enlace vence en 1 hora. Si no pediste este cambio, puedes ignorar este correo — tu contraseña actual sigue funcionando igual.</p>
      `,
    );

    // Solo en desarrollo, para poder probar el flujo sin depender del
    // correo real llegando a tiempo.
    const devToken =
      this.config.get('NODE_ENV') !== 'production' ? rawToken : undefined;

    return { ...generic, devToken };
  }

  // ---------- RESET PASSWORD ----------
  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.hashToken(token);
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        resetToken: tokenHash,
        resetTokenExpires: { gt: new Date() },
      },
    });
    if (!usuario) {
      throw new UnauthorizedException('Token de recuperación inválido o expirado');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpires: null,
        // Si por casualidad este era el flujo usado en vez del de cambio
        // obligatorio (ej. el dueño de una empresa nueva usa "olvidé mi
        // contraseña" antes de loguearse la primera vez), igual cuenta
        // como haber cambiado la temporal — se limpia la bandera acá también.
        debeChangePassword: false,
      },
    });

    // Invalidar todas las sesiones activas tras el cambio
    await this.prisma.refreshToken.updateMany({
      where: { usuarioId: usuario.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  // ---------- CAMBIO OBLIGATORIO DE CONTRASEÑA (primer login) ----------
  /**
   * Usuario ya autenticado (OWNER de una empresa nueva, o empleado con
   * acceso recién creado) reemplaza la contraseña temporal que le
   * asignaron. A diferencia de resetPassword(), no valida ningún token ni
   * pide la contraseña actual — la sesión ya prueba quién es. No revoca
   * el resto de sesiones activas a propósito: normalmente no hay
   * ninguna otra todavía, y revocar la propia rompería el "seguir
   * navegando sin volver a iniciar sesión" que pide este flujo.
   */
  async cambiarPasswordInicial(usuarioId: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { passwordHash, debeChangePassword: false },
    });
    return { success: true };
  }

  // ---------- ME ----------
  async me(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: { rol: true, empresa: true, empleado: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      telefono: usuario.telefono,
      rol: usuario.rol.roleKey,
      modulos: await this.modulosEfectivos.obtenerEfectivosParaRol(usuario.empresa.id, usuario.rol.roleKey),
      permisos: usuario.rol.permisos,
      empresa: {
        id: usuario.empresa.id,
        nombre: usuario.empresa.nombre,
        slug: usuario.empresa.slug,
        verticales: usuario.empresa.verticales,
        // Candado de PIN para anular ventas (Parte B): expuesto aquí (no
        // solo en GET /empresa) porque /auth/me no tiene gate de módulo y
        // lo necesita cualquier usuario con permiso de anular (OWNER/ADMIN)
        // para saber si el modal de "Anular venta" debe pedir PIN.
        pinAnulacionActivo: usuario.empresa.pinAnulacionActivo,
        // % de ITBIS de la empresa: expuesto aquí (no solo en GET /empresa,
        // que es OWNER/ADMIN-only) porque el POS lo necesita para CUALQUIER
        // usuario (incluyendo cajeros) para estimar el total antes de
        // cobrar — debe coincidir con lo que ventas.service.ts calculará
        // al confirmar la venta.
        itbisPct: Number(usuario.empresa.itbisPct),
      },
      empleadoId: usuario.empleado?.id ?? null,
    };
  }

  // ---------- WEBAUTHN (login biométrico) ----------
  // Atajo adicional en UN dispositivo — nunca reemplaza el login por
  // contraseña. El registro (activar) exige sesión ya iniciada; el login
  // biométrico en sí ocurre SIN sesión (es justo lo que la reemplaza), así
  // que ahí se usa `this.prisma.*` sin scope de tenant — ver nota en
  // prisma.service.ts / en el modelo WebAuthnCredential del schema.

  /** Paso 1 de activar: opciones de registro para ESTE usuario ya logueado. */
  async webauthnRegisterOptions(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    const existentes = await this.prisma.webAuthnCredential.findMany({
      where: { usuarioId },
      select: { credentialId: true, transports: true },
    });

    const options = await generateRegistrationOptions({
      rpName: this.webauthnRpName,
      rpID: this.webauthnRpId,
      userID: new TextEncoder().encode(usuario.id),
      userName: usuario.email,
      userDisplayName: usuario.nombre,
      attestationType: 'none',
      excludeCredentials: existentes.map((c) => ({
        id: c.credentialId,
        transports: c.transports as any,
      })),
      authenticatorSelection: {
        residentKey: 'discouraged',
        userVerification: 'required',
        authenticatorAttachment: 'platform',
      },
    });

    this.webauthnChallenges.set(`reg:${usuarioId}`, {
      challenge: options.challenge,
      expiresAt: Date.now() + this.WEBAUTHN_CHALLENGE_TTL_MS,
    });

    return options;
  }

  /** Paso 2 de activar: valida la respuesta del navegador y guarda la credencial. */
  async webauthnRegisterVerify(
    usuarioId: string,
    empresaId: string,
    response: RegistrationResponseJSON,
    deviceLabel?: string,
  ) {
    const pending = this.webauthnChallenges.get(`reg:${usuarioId}`);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new BadRequestException(
        'La solicitud de activación expiró. Intenta de nuevo.',
      );
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: this.webauthnOrigin,
        expectedRPID: this.webauthnRpId,
      });
    } catch {
      throw new BadRequestException('No se pudo verificar la huella/Face ID.');
    }
    this.webauthnChallenges.delete(`reg:${usuarioId}`);

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('No se pudo verificar la huella/Face ID.');
    }

    const { credential } = verification.registrationInfo;

    const creado = await this.prisma.webAuthnCredential.create({
      data: {
        empresaId,
        usuarioId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        deviceLabel: deviceLabel?.trim() || null,
      },
    });

    return {
      id: creado.id,
      deviceLabel: creado.deviceLabel,
      createdAt: creado.createdAt,
    };
  }

  /** Paso 1 de entrar con huella: desafío para el credentialId que ya tiene este dispositivo. */
  async webauthnLoginOptions(credentialId: string) {
    const cred = await this.prisma.webAuthnCredential.findUnique({
      where: { credentialId },
      select: { credentialId: true, transports: true },
    });
    if (!cred) {
      // No se revela más detalle: este dispositivo tiene un credentialId
      // guardado que ya no existe en el servidor (se "olvidó" desde otro
      // lugar, o nunca fue válido) — el frontend debe limpiar su bandera
      // local y caer al login normal.
      throw new UnauthorizedException('Credencial no reconocida.');
    }

    const options = await generateAuthenticationOptions({
      rpID: this.webauthnRpId,
      allowCredentials: [{ id: cred.credentialId, transports: cred.transports as any }],
      userVerification: 'required',
    });

    this.webauthnChallenges.set(`auth:${credentialId}`, {
      challenge: options.challenge,
      expiresAt: Date.now() + this.WEBAUTHN_CHALLENGE_TTL_MS,
    });

    return options;
  }

  /** Paso 2 de entrar con huella: valida la firma y entrega los MISMOS tokens que un login normal. */
  async webauthnLoginVerify(credentialId: string, response: AuthenticationResponseJSON) {
    const pending = this.webauthnChallenges.get(`auth:${credentialId}`);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new UnauthorizedException('La solicitud expiró. Intenta de nuevo.');
    }

    const cred = await this.prisma.webAuthnCredential.findUnique({
      where: { credentialId },
      include: {
        usuario: { include: { rol: true, empresa: true } },
      },
    });
    if (!cred) {
      throw new UnauthorizedException('Credencial no reconocida.');
    }
    const { usuario } = cred;
    if (!usuario || usuario.deletedAt || !usuario.activo || usuario.empresa.deletedAt) {
      throw new UnauthorizedException('Cuenta no disponible.');
    }

    const authenticator: SimpleWebAuthnCredential = {
      id: cred.credentialId,
      publicKey: new Uint8Array(cred.publicKey),
      counter: cred.counter,
      transports: cred.transports as any,
    };

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: this.webauthnOrigin,
        expectedRPID: this.webauthnRpId,
        credential: authenticator,
      });
    } catch {
      throw new UnauthorizedException('No se pudo verificar la huella/Face ID.');
    }
    this.webauthnChallenges.delete(`auth:${credentialId}`);

    if (!verification.verified) {
      throw new UnauthorizedException('No se pudo verificar la huella/Face ID.');
    }

    await this.prisma.webAuthnCredential.update({
      where: { id: cred.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      },
    });
    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoLogin: new Date() },
    });

    return this.buildAuthResponse(
      usuario,
      usuario.rol.roleKey,
      usuario.empresa.id,
      usuario.empresa.slug,
    );
  }

  /** Dispositivos con huella/Face ID activada del usuario logueado. */
  async webauthnListDevices(usuarioId: string) {
    // `.db.*` aísla por empresaId automáticamente (WebAuthnCredential está
    // en TENANT_MODELS); el filtro por usuarioId además lo acota a los
    // dispositivos del propio usuario, no los de toda la empresa.
    const rows = await this.prisma.db.webAuthnCredential.findMany({
      where: { usuarioId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      // credentialId no es secreto (la clave privada nunca sale del
      // dispositivo) — se expone para que el frontend pueda marcar cuál
      // de estos es "este dispositivo" comparando contra lo que tiene en
      // su propio localStorage.
      credentialId: r.credentialId,
      deviceLabel: r.deviceLabel,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
    }));
  }

  /** "Olvidar este dispositivo": revoca una credencial propia por su id de fila. */
  async webauthnRevokeDevice(usuarioId: string, deviceId: string) {
    // El `where` con usuarioId (además del empresaId que `.db.*` ya
    // inyecta solo) garantiza que nadie pueda borrar el dispositivo de
    // OTRO usuario de la misma empresa pasando su id de fila a mano.
    const cred = await this.prisma.db.webAuthnCredential.findFirst({
      where: { id: deviceId, usuarioId },
    });
    if (!cred) throw new NotFoundException('Dispositivo no encontrado');
    await this.prisma.db.webAuthnCredential.delete({ where: { id: deviceId } });
    return { success: true };
  }

  // ---------- HELPERS ----------
  /** Arma la misma respuesta (tokens + user) para login por contraseña y por huella. */
  private async buildAuthResponse(
    usuario: {
      id: string;
      nombre: string;
      email: string;
      debeChangePassword: boolean;
    },
    rolKey: RoleKey,
    empresaId: string,
    empresaSlug: string,
  ) {
    const tokens = await this.issueTokens({
      sub: usuario.id,
      empresaId,
      rol: rolKey,
    });
    return {
      ...tokens,
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: rolKey,
        modulos: await this.modulosEfectivos.obtenerEfectivosParaRol(empresaId, rolKey),
        empresaId,
        empresaSlug,
        // El frontend bloquea el acceso al resto de la app (ProtectedRoute)
        // hasta que el usuario complete /auth/cambiar-password-inicial.
        debeChangePassword: usuario.debeChangePassword,
      },
    };
  }

  // Desafíos de WebAuthn pendientes (registro y login), en memoria — mismo
  // criterio ya usado para el candado de PIN de anulación en
  // ventas.service.ts: vive un instante (unos minutos) y solo importa en
  // esta misma instancia del proceso; si algún día hay más de una
  // instancia del backend corriendo a la vez, esto debería moverse a Redis
  // o similar.
  private readonly WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
  private readonly webauthnChallenges = new Map<
    string,
    { challenge: string; expiresAt: number }
  >();

  private async issueTokens(payload: JwtPayload) {
    const accessToken = this.jwt.sign(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessTtl,
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: '7d',
    });

    // Persistir hash del refresh token para poder revocarlo
    await this.prisma.refreshToken.create({
      data: {
        usuarioId: payload.sub,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
