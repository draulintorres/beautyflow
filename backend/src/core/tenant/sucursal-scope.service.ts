import { Injectable } from '@nestjs/common';
import { RoleKey } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getCurrentUser } from './tenant-context';

export interface SucursalScope {
  /** true = la vista debe limitarse a `sucursalId`. false = ve todo el negocio. */
  scoped: boolean;
  /** sucursal a la que limitar, o null si ve todo. */
  sucursalId: string | null;
  /** por qué se resolvió así (para logs / reporte). */
  motivo:
    | 'owner'
    | 'sin-empleado'
    | 'empleado-sin-sucursal'
    | 'empleado-con-sucursal';
}

/**
 * Aislamiento por sucursal para usuarios que NO son OWNER.
 *
 * Regla (pedido de Draulin, sept 2026): cualquier usuario no-OWNER asignado a
 * una sucursal solo debe ver datos de esa sucursal en sus vistas normales. El
 * OWNER ve todo el negocio. La pestaña de comparación por sucursal del OWNER
 * es aparte y no usa esto.
 *
 * La sucursal del usuario sale de `Empleado.sucursalId` (por `usuarioId`). No
 * está en el JWT a propósito — así no hay que forzar re-login y el cambio es
 * puramente aditivo. Es una consulta indexada por request; los servicios la
 * llaman una vez y reparten el resultado.
 */
@Injectable()
export class SucursalScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(): Promise<SucursalScope> {
    const user = getCurrentUser();

    if (user.rol === RoleKey.OWNER) {
      return { scoped: false, sucursalId: null, motivo: 'owner' };
    }

    const empleado = await this.prisma.db.empleado.findFirst({
      where: { usuarioId: user.usuarioId },
      select: { sucursalId: true },
    });

    if (!empleado) {
      // Usuario no-OWNER sin ficha de empleado (p. ej. un ADMIN "puro").
      // No se puede aislar → ve todo. Se reporta para que Draulin decida.
      return { scoped: false, sucursalId: null, motivo: 'sin-empleado' };
    }

    if (!empleado.sucursalId) {
      // Empleado sin sucursal asignada → ve todo. Se reporta.
      return {
        scoped: false,
        sucursalId: null,
        motivo: 'empleado-sin-sucursal',
      };
    }

    return {
      scoped: true,
      sucursalId: empleado.sucursalId,
      motivo: 'empleado-con-sucursal',
    };
  }

  /**
   * Azúcar para `where` de Prisma: devuelve `{ sucursalId }` si hay que
   * aislar, o `{}` si no. Pensado para hacer spread dentro de un where:
   *   where: { ...(await scope.whereSucursal()), estado: ... }
   */
  async whereSucursal(): Promise<{ sucursalId?: string }> {
    const s = await this.resolve();
    return s.scoped && s.sucursalId ? { sucursalId: s.sucursalId } : {};
  }
}
