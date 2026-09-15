import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantStoreOrNull } from '../tenant/tenant-context';

export interface AuditEntry {
  modulo: string;
  entidad: string;
  entidadId?: string;
  accion: string;
  datosAntes?: any;
  datosDespues?: any;
  ip?: string;
}

export interface AuditFiltros {
  modulo?: string;
  accion?: string;
  usuarioId?: string;
  entidad?: string;
  entidadId?: string;
  desde?: string;
  hasta?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditListItem {
  id: string;
  usuarioId: string | null;
  usuarioNombre: string;
  modulo: string;
  entidad: string;
  entidadId: string | null;
  accion: string;
  datosAntes: any;
  datosDespues: any;
  createdAt: Date;
}

export interface AuditListResult {
  items: AuditListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Servicio central de auditoría. Registra acciones críticas del sistema y
 * expone el historial para la pantalla "Auditoría" (OWNER-only).
 *
 * Diseño: el log es best-effort y NO debe romper la operación de negocio.
 * Si el registro falla, se loguea el error pero la acción principal continúa.
 * El empresaId y usuarioId se toman del contexto de tenant automáticamente
 * — nunca vienen del caller, así que no hay forma de auditar "a nombre de"
 * otra empresa u otro usuario.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    const store = getTenantStoreOrNull();
    if (!store?.empresaId) return; // sin contexto no se audita

    try {
      await this.prisma.db.auditLog.create({
        data: {
          empresaId: store.empresaId,
          usuarioId: store.usuarioId,
          modulo: entry.modulo,
          entidad: entry.entidad,
          entidadId: entry.entidadId,
          accion: entry.accion,
          datosAntes: entry.datosAntes ?? undefined,
          datosDespues: entry.datosDespues ?? undefined,
          ip: entry.ip,
        } as any,
      });
    } catch (err) {
      // Nunca propagar: la auditoría no debe tumbar la operación principal
      this.logger.error(
        `No se pudo registrar auditoría (${entry.modulo}/${entry.accion})`,
        (err as Error)?.message,
      );
    }
  }

  /**
   * Historial paginado para la pantalla de Auditoría. `empresaId` sale del
   * contexto de tenant (nunca del query) — ver nota de aislamiento en
   * `listar` del controller. El resto de filtros son opcionales.
   */
  async listar(filtros: AuditFiltros): Promise<AuditListResult> {
    const store = getTenantStoreOrNull();
    if (!store?.empresaId) return { items: [], total: 0, page: 1, pageSize: 0 };

    const page = Math.max(1, filtros.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filtros.pageSize ?? 25));

    const where = {
      ...(filtros.modulo && { modulo: filtros.modulo }),
      ...(filtros.accion && { accion: filtros.accion }),
      ...(filtros.usuarioId && { usuarioId: filtros.usuarioId }),
      ...(filtros.entidad && { entidad: filtros.entidad }),
      ...(filtros.entidadId && { entidadId: filtros.entidadId }),
      ...((filtros.desde || filtros.hasta) && {
        createdAt: {
          ...(filtros.desde && { gte: new Date(`${filtros.desde}T00:00:00`) }),
          ...(filtros.hasta && { lte: new Date(`${filtros.hasta}T23:59:59.999`) }),
        },
      }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.db.auditLog.count({ where }),
    ]);

    // AuditLog.usuarioId no tiene relación declarada en el schema (a
    // propósito — no se quiere un FK duro a Usuario para no perder el
    // registro si el usuario se borra) así que el nombre se resuelve aparte,
    // en un solo query por página.
    const usuarioIds = [
      ...new Set(rows.map((r) => r.usuarioId).filter((x): x is string => !!x)),
    ];
    const usuarios = usuarioIds.length
      ? await this.prisma.db.usuario.findMany({
          where: { id: { in: usuarioIds } },
          select: { id: true, nombre: true },
        })
      : [];
    const nombreMap = new Map(usuarios.map((u) => [u.id, u.nombre]));

    return {
      items: rows.map((r) => ({
        id: r.id,
        usuarioId: r.usuarioId,
        usuarioNombre: r.usuarioId ? (nombreMap.get(r.usuarioId) ?? 'Usuario eliminado') : 'Sistema',
        modulo: r.modulo,
        entidad: r.entidad,
        entidadId: r.entidadId,
        accion: r.accion,
        datosAntes: r.datosAntes,
        datosDespues: r.datosDespues,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }
}
