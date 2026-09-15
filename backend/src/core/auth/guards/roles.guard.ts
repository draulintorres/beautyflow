import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleKey } from '@prisma/client';
import { ROLES_KEY } from '../decorators/auth.decorators';

/**
 * Restringe el acceso a los roles declarados con @Roles(). Si no hay
 * @Roles() en la ruta, permite el paso (la autenticación ya la cubre
 * JwtAuthGuard). OWNER siempre tiene acceso.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleKey[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = ctx.switchToHttp().getRequest();
    const rol: RoleKey = request.user?.rol;

    if (!rol) {
      throw new ForbiddenException('Rol no resuelto');
    }
    if (rol === RoleKey.OWNER) return true; // OWNER omnipotente dentro de su empresa
    if (!required.includes(rol)) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    return true;
  }
}
