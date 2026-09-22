import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { getEmpresaId } from '../../core/tenant/tenant-context';

type RecursoLimitado = 'usuarios' | 'sucursales' | 'empleados';

/**
 * Valida los límites del plan de la empresa actual antes de crear recursos.
 * Lo consultan Usuarios, Sucursales y Empleados. Si el plan no define límite
 * (null), el recurso es ilimitado.
 */
@Injectable()
export class LimitsService {
  constructor(private readonly prisma: PrismaService) {}

  async verificar(recurso: RecursoLimitado): Promise<void> {
    const empresaId = getEmpresaId();

    const sub = await this.prisma.subscription.findUnique({
      where: { empresaId },
      include: { planRef: true },
    });
    // Sin plan asignado → sin límites (no bloquear)
    if (!sub?.planRef) return;

    const plan = sub.planRef;
    let limite: number | null = null;
    if (recurso === 'usuarios') limite = plan.maxUsuarios;
    else if (recurso === 'sucursales') limite = plan.maxSucursales;
    else if (recurso === 'empleados') limite = plan.maxEmpleados;

    if (limite === null || limite === undefined) return; // ilimitado

    const actual = await this.contar(recurso, empresaId);
    if (actual >= limite) {
      throw new ForbiddenException(
        `Ha alcanzado el límite de ${recurso} de su plan (${limite}). Actualice su plan para agregar más.`,
      );
    }
  }

  private async contar(
    recurso: RecursoLimitado,
    empresaId: string,
  ): Promise<number> {
    if (recurso === 'usuarios') {
      return this.prisma.usuario.count({
        where: { empresaId, deletedAt: null },
      });
    }
    if (recurso === 'sucursales') {
      return this.prisma.sucursal.count({
        where: { empresaId, deletedAt: null },
      });
    }
    return this.prisma.empleado.count({
      // esCuentaDueno=true no es personal contratado (ni inquilino de
      // Alquiler de Silla) — es solo la fila técnica que `ventas.service.ts`
      // le crea al OWNER para poder cobrar sin depender de tener staff
      // cargado. No debe "gastar" cupo del límite del plan.
      where: { empresaId, deletedAt: null, esCuentaDueno: false },
    });
  }
}
