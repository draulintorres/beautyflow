import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModeloPago, RoleKey } from '@prisma/client';
import { getCurrentUser, TenantStore } from '../tenant/tenant-context';

export interface InquilinoInfo {
  esInquilino: boolean;
  empleadoId: string | null;
}

/**
 * Permiso de visibilidad/operación por ROL, independiente del criterio de
 * negocio de abajo. `restringido=true` significa "el rol del JWT es
 * ALQUILER" — a secas, sin mirar modeloPago ni alquilerConfig. Corrección
 * (ETAPA 3/4, bug confirmado en staging): un empleado con modeloPago
 * ALQUILER + alquilerConfig activa que recibió por error un acceso con rol
 * BARBERO (o cualquier rol no-ALQUILER) quedaba SIN restricción alguna en
 * agenda/ventas/deudas — veía todo el salón. La causa era que todo el
 * filtrado forzado dependía de `resolverInquilino()` (abajo), que exige
 * TAMBIÉN modeloPago+config, y esas dos cosas se configuran en pantallas
 * completamente separadas de "Crear acceso". Este método en cambio corta
 * en seco por el rol solamente: con rol ALQUILER, SIEMPRE queda acotado a
 * su propio empleado (o a nada si no tiene uno vinculado) — nunca cae de
 * vuelta en "sin restricción" por una desincronización en otra pantalla.
 */
export interface PermisoAlquilerInfo {
  restringido: boolean;
  empleadoId: string | null;
}

/**
 * Identidad del inquilino de alquiler de silla (Fase B2, Pieza 3) a
 * efectos de NEGOCIO (comisión, dashboard, KPIs de ingreso) — criterio
 * modeloPago ALQUILER + alquilerConfig activa, sin cambios. Para permisos
 * de visibilidad/operación por rol usar `resolverPermisoAlquiler()` en
 * vez de este método — ver su comentario para el porqué de la separación.
 */
@Injectable()
export class InquilinoService {
  constructor(private readonly prisma: PrismaService) {}

  async resolverInquilino(
    user: TenantStore = getCurrentUser(),
  ): Promise<InquilinoInfo> {
    if (user.rol !== RoleKey.ALQUILER) {
      return { esInquilino: false, empleadoId: null };
    }

    const empleado = await this.prisma.db.empleado.findFirst({
      where: { usuarioId: user.usuarioId },
      select: {
        id: true,
        modeloPago: true,
        alquilerConfig: { select: { activo: true } },
      },
    });

    const esInquilino =
      !!empleado &&
      empleado.modeloPago === ModeloPago.ALQUILER &&
      !!empleado.alquilerConfig?.activo;

    return { esInquilino, empleadoId: esInquilino ? empleado!.id : null };
  }

  /**
   * Fallo cerrado por rol — ver el comentario de `PermisoAlquilerInfo`.
   * Usar en toda decisión de PERMISO (qué puede ver/operar el usuario
   * actual): agenda (findByFecha/findOne/create/reschedule/
   * assertPropiaSiInquilino), POS (create/findOne/findAll de ventas),
   * alquiler (listarDeudas/findDeuda) e historial de citas del cliente.
   * NO usar para decisiones de negocio (comisión, dashboard, KPIs,
   * "factura limpia") — esas siguen en `resolverInquilino()`.
   */
  async resolverPermisoAlquiler(
    user: TenantStore = getCurrentUser(),
  ): Promise<PermisoAlquilerInfo> {
    if (user.rol !== RoleKey.ALQUILER) {
      return { restringido: false, empleadoId: null };
    }

    const empleado = await this.prisma.db.empleado.findFirst({
      where: { usuarioId: user.usuarioId },
      select: { id: true },
    });

    return { restringido: true, empleadoId: empleado?.id ?? null };
  }
}
