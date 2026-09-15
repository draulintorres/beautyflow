import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/prisma/prisma.service';
import { NotificationService } from '../notificaciones/notification.service';
import { tenantContext } from '../../core/tenant/tenant-context';
import {
  SolicitarOtpDto,
  VerificarOtpDto,
} from './dto/portal.dto';
import { NotificacionEvento, CanalNotificacion, EmpresaStatus } from '@prisma/client';
import { createHash, randomInt, randomBytes } from 'crypto';

@Injectable()
export class PortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notif: NotificationService,
  ) {}

  // ---------- SOLICITAR OTP ----------
  async solicitarOtp(dto: SolicitarOtpDto) {
    const empresa = await this.resolverEmpresa(dto.empresaSlug);

    // Buscar cliente por teléfono, whatsapp o email dentro de la empresa
    const cliente = await this.prisma.cliente.findFirst({
      where: {
        empresaId: empresa.id,
        deletedAt: null,
        activo: true,
        OR: [
          { telefono: dto.destino },
          { whatsapp: dto.destino },
          { email: dto.destino },
        ],
      },
      select: { id: true },
    });

    // Generar OTP de 6 dígitos. Se registra siempre (no revela si el cliente existe).
    const codigo = String(randomInt(100000, 999999));
    const codigoHash = this.hash(codigo);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await this.prisma.clienteOtp.create({
      data: {
        empresaId: empresa.id,
        clienteId: cliente?.id,
        destino: dto.destino,
        codigoHash,
        expiresAt,
      },
    });

    // Enviar OTP por el canal correspondiente (solo si el cliente existe)
    if (cliente) {
      const esEmail = dto.destino.includes('@');
      await tenantContext.run(
        { empresaId: empresa.id, usuarioId: cliente.id, rol: 'CLIENTE' },
        async () => {
          await this.notif.notificar({
            evento: NotificacionEvento.CONFIRMACION,
            clienteId: cliente.id,
            canal: esEmail ? CanalNotificacion.EMAIL : CanalNotificacion.WHATSAPP,
            destinatario: dto.destino,
            variables: { cliente: '', codigo },
          });
        },
      );
    }

    // En desarrollo se devuelve el OTP para poder probar
    const devOtp = this.config.get('NODE_ENV') !== 'production' ? codigo : undefined;
    return {
      message: 'Si el contacto existe, recibirás un código de acceso.',
      ...(devOtp ? { devOtp } : {}),
    };
  }

  // ---------- VERIFICAR OTP ----------
  async verificarOtp(dto: VerificarOtpDto) {
    const empresa = await this.resolverEmpresa(dto.empresaSlug);

    const otp = await this.prisma.clienteOtp.findFirst({
      where: {
        empresaId: empresa.id,
        destino: dto.destino,
        usadoAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) {
      throw new UnauthorizedException('Código inválido o expirado');
    }
    if (otp.intentos >= 5) {
      throw new UnauthorizedException('Demasiados intentos. Solicita un nuevo código.');
    }

    if (this.hash(dto.codigo) !== otp.codigoHash) {
      await this.prisma.clienteOtp.update({
        where: { id: otp.id },
        data: { intentos: { increment: 1 } },
      });
      throw new UnauthorizedException('Código incorrecto');
    }
    if (!otp.clienteId) {
      throw new UnauthorizedException('No existe un cliente con ese contacto');
    }

    // Marcar OTP como usado
    await this.prisma.clienteOtp.update({
      where: { id: otp.id },
      data: { usadoAt: new Date() },
    });

    return this.emitirTokens(otp.clienteId, empresa.id);
  }

  // ---------- REFRESH ----------
  async refresh(refreshToken: string) {
    const tokenHash = this.hash(refreshToken);
    const stored = await this.prisma.clienteRefreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { cliente: { select: { id: true, empresaId: true } } },
    });
    if (!stored) throw new UnauthorizedException('Sesión no válida');

    await this.prisma.clienteRefreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.emitirTokens(stored.cliente.id, stored.cliente.empresaId);
  }

  // ---------- helpers ----------
  private async resolverEmpresa(slug: string) {
    const empresa = await this.prisma.empresa.findUnique({ where: { slug } });
    if (!empresa || empresa.deletedAt || empresa.estado !== EmpresaStatus.ACTIVE) {
      throw new BadRequestException('Empresa no disponible');
    }
    return empresa;
  }

  private async emitirTokens(clienteId: string, empresaId: string) {
    const payload = { sub: clienteId, empresaId, tipo: 'portal' };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: '1h',
    });
    const refreshRaw = randomBytes(32).toString('hex');
    await this.prisma.clienteRefreshToken.create({
      data: {
        clienteId,
        tokenHash: this.hash(refreshRaw),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días
      },
    });
    return { accessToken, refreshToken: refreshRaw };
  }

  private hash(v: string): string {
    return createHash('sha256').update(v).digest('hex');
  }
}
