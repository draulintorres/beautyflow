import {
  SetMetadata,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { RoleKey } from '@prisma/client';
import { Modulo } from '../permisos.matrix';

/** Marca una ruta como pública (omite JwtAuthGuard). */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restringe una ruta a ciertos roles. */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleKey[]) => SetMetadata(ROLES_KEY, roles);

/** Restringe una ruta a roles que tengan al menos uno de los módulos indicados. */
export const MODULOS_KEY = 'modulos';
export const Modulos = (...modulos: Modulo[]) => SetMetadata(MODULOS_KEY, modulos);

/** Inyecta el usuario autenticado (del contexto de tenant) en el handler. */
export const CurrentUser = createParamDecorator(
  (data: keyof any | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
