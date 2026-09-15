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

export const SA_PUBLIC = 'saPublic';
export const SaPublic = () => SetMetadata(SA_PUBLIC, true);

export const CurrentSuperAdmin = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest().superAdmin;
  },
);

interface SaPayload {
  sub: string;
  tipo: 'superadmin';
}

/**
 * Guard del Super Admin. Valida un token tipo='superadmin' firmado con un
 * secret SEPARADO (JWT_SUPERADMIN_SECRET). A diferencia del resto del
 * sistema, NO activa contexto de tenant: el super admin opera sobre todas
 * las empresas usando el cliente Prisma crudo (sin filtro por empresaId).
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(SA_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Autenticación de super admin requerida');
    }

    let payload: SaPayload;
    try {
      payload = this.jwt.verify<SaPayload>(auth.slice(7), {
        secret: this.config.getOrThrow('JWT_SUPERADMIN_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    if (payload.tipo !== 'superadmin' || !payload.sub) {
      throw new UnauthorizedException('Token de super admin inválido');
    }

    req.superAdmin = { id: payload.sub };
    return true;
  }
}
