import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModeloPago, RoleKey } from '@prisma/client';
import { getCurrentUser, TenantStore } from '../tenant/tenant-context';

export interface InquilinoInfo {
  esInquilino: boolean;
  empleadoId: string | null;
}

/**
 * Identidad del inquilino de alquiler de silla (Fase B2, Pieza 3). Punto
 * único de donde sale "¿el usuario actual es un inquilino, y cuál es su
 * empleadoId?" — todo el filtrado forzado del backend (agenda, ventas,
 * deudas, POS) se apoya en este helper. Nunca confía en lo que mande el
 * cliente: solo mira el rol del JWT y el vínculo usuario→empleado en BD.
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
}
