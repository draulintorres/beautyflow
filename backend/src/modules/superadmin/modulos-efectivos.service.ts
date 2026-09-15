import { Injectable, Logger } from '@nestjs/common';
import { RoleKey } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  Modulo,
  MODULOS_BASE,
  MODULOS_GATEABLES,
  MATRIZ,
} from '../../core/auth/permisos.matrix';

@Injectable()
export class ModulosEfectivosService {
  private readonly logger = new Logger(ModulosEfectivosService.name);
  private readonly cache = new Map<
    string,
    { modulos: Set<string>; expiresAt: number }
  >();
  private readonly TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Devuelve el conjunto de módulos disponibles para una empresa:
   *   MODULOS_BASE ∪ gateables activos según modulos_activos
   * Resultado cacheado 60 s por empresaId.
   */
  async obtenerParaEmpresa(empresaId: string): Promise<Set<string>> {
    const cached = this.cache.get(empresaId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.modulos;
    }

    const rows = await this.prisma.moduloActivo.findMany({
      where: { empresaId },
      select: { modulo: true, activo: true },
    });

    let modulos: Set<string>;

    if (rows.length === 0) {
      // Fallback anti-lockout: empresa sin datos de plan → todos los gateables activos
      this.logger.warn(
        `Empresa ${empresaId} sin filas en modulos_activos — fallback anti-lockout (todos los gateables activos)`,
      );
      modulos = new Set<string>([...MODULOS_BASE, ...MODULOS_GATEABLES]);
    } else {
      const activos = rows.filter((r) => r.activo).map((r) => r.modulo);
      modulos = new Set<string>([...MODULOS_BASE, ...activos]);
    }

    this.cache.set(empresaId, { modulos, expiresAt: Date.now() + this.TTL_MS });
    return modulos;
  }

  /**
   * Módulos efectivos del usuario = MATRIZ[rol] ∩ disponibles(empresa).
   * Usado en login y /auth/me.
   */
  async obtenerEfectivosParaRol(empresaId: string, rol: RoleKey): Promise<Modulo[]> {
    const disponibles = await this.obtenerParaEmpresa(empresaId);
    const deRol = MATRIZ[rol] ?? [];
    return deRol.filter((m) => disponibles.has(m));
  }

  /** Invalida el cache de una empresa (llamar tras sync/override). */
  invalidar(empresaId: string): void {
    this.cache.delete(empresaId);
  }
}