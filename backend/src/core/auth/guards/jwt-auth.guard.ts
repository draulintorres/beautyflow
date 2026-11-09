import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';

/**
 * Exige un usuario de personal autenticado en el request (resuelto por
 * TenantMiddleware), salvo en rutas marcadas con @Public(). Rechaza
 * explícitamente los tokens de portal (tipo==='portal'): esos solo deben
 * dar acceso a /portal/*, que valida con su propio PortalAuthGuard y está
 * marcado @Public() a nivel de este guard -- sin este chequeo, un token de
 * portal (firmado con el mismo secret que el de personal) podía pasar
 * JwtAuthGuard en cualquier ruta de personal sin @Roles()/@Modulos().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const request = ctx.switchToHttp().getRequest();
    if (!request.user?.usuarioId || request.user?.tipo === 'portal') {
      throw new UnauthorizedException('Autenticación requerida');
    }
    return true;
  }
}
