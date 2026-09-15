import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleKey } from '@prisma/client';
import { MODULOS_KEY } from '../decorators/auth.decorators';
import { Modulo, MATRIZ } from '../permisos.matrix';
import { ModulosEfectivosService } from '../../../modules/superadmin/modulos-efectivos.service';

/**
 * Valida que el usuario tenga acceso a al menos uno de los módulos declarados
 * con @Modulos(), considerando TANTO su rol como el plan de su empresa.
 *
 * módulos efectivos del usuario = MATRIZ[rol] ∩ (MODULOS_BASE ∪ gateables activos de empresa)
 *
 * Cache: ModulosEfectivosService mantiene un cache por empresa de 60 s.
 * Invalidación: se limpia al cambiar el plan o hacer un override manual.
 *
 * Nota sobre staleness: si el SA cambia el plan mientras un usuario tiene
 * sesión activa, el guard bloquea de inmediato (lee DB con 60 s de delay máx),
 * pero la UI puede mostrar entradas de nav desactualizadas hasta el próximo
 * login o /auth/me. Los 403 se propagan como errores de query (no auto-logout).
 */
@Injectable()
export class ModulosGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly modulosEfectivos: ModulosEfectivosService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const modulos = this.reflector.getAllAndOverride<Modulo[]>(MODULOS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!modulos || modulos.length === 0) return true;

    const request = ctx.switchToHttp().getRequest();
    const rol: RoleKey = request.user?.rol;
    const empresaId: string = request.user?.empresaId;

    if (!rol) throw new ForbiddenException('Rol no resuelto');
    if (!empresaId) throw new ForbiddenException('Empresa no resuelta');

    // Módulos disponibles para esta empresa según plan (cacheado 60 s)
    const planModulos = await this.modulosEfectivos.obtenerParaEmpresa(empresaId);

    // Set de módulos que el rol puede ver
    const rolModulos = new Set<string>(MATRIZ[rol] ?? []);

    // El usuario tiene acceso si al menos uno de los @Modulos() está en su
    // intersección rol ∩ plan. Esto habilita recursos compartidos: un endpoint
    // con @Modulos('sucursales','equipo','reportes') pasará si el usuario tiene
    // 'equipo' aunque 'sucursales' esté inactivo por el plan.
    const tieneAcceso = modulos.some(
      (m) => rolModulos.has(m) && planModulos.has(m),
    );

    if (!tieneAcceso) {
      throw new ForbiddenException(
        `No tienes acceso al módulo requerido (${modulos.join(', ')})`,
      );
    }
    return true;
  }
}