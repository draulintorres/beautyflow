import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  createParamDecorator,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { tenantContext } from '../../../core/tenant/tenant-context';

/** Marca rutas públicas del portal (login, solicitar OTP). */
export const PORTAL_PUBLIC = 'portalPublic';
export const PortalPublic = () => SetMetadata(PORTAL_PUBLIC, true);

/** Inyecta el cliente autenticado del portal. */
export const CurrentCliente = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.portalCliente;
  },
);

interface PortalPayload {
  sub: string; // clienteId
  empresaId: string;
  tipo: 'portal';
}

/**
 * Guard del portal del cliente. Valida el token de cliente (distinto del
 * de empleados: lleva tipo='portal') y propaga el contexto de tenant con
 * el empresaId del cliente. NO da acceso a datos de otros clientes: los
 * servicios del portal siempre filtran por el clienteId del token.
 */
@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PORTAL_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest();

    if (isPublic) {
      return true;
    }

    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Autenticación de cliente requerida');
    }

    let payload: PortalPayload;
    try {
      payload = this.jwt.verify<PortalPayload>(auth.slice(7), {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    if (payload.tipo !== 'portal' || !payload.sub || !payload.empresaId) {
      throw new UnauthorizedException('Token de portal inválido');
    }

    req.portalCliente = { clienteId: payload.sub, empresaId: payload.empresaId };

    // Propagar contexto de tenant para que prisma.db filtre por empresa.
    // El rol 'CLIENTE' nunca pasa los guards internos (no es RoleKey de empleado).
    return new Promise((resolve) => {
      tenantContext.run(
        {
          empresaId: payload.empresaId,
          usuarioId: payload.sub,
          rol: 'CLIENTE',
        },
        () => resolve(true),
      );
    });
  }
}
