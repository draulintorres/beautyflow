import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { getEmpresaId } from '../../core/tenant/tenant-context';
import { CrearNotificacionInternaParams } from './dto/notificacion-interna.dto';

/**
 * Centro de notificaciones internas del staff (campana). Cualquier módulo
 * inyecta este servicio y llama a `crear(...)` / `crearParaVarios(...)`
 * para avisar a uno o varios usuarios dentro de la propia app.
 *
 * Best-effort: nunca lanza; una notificación fallida no debe tumbar la
 * operación de negocio que la disparó (crear una cita, cerrar una venta...).
 */
@Injectable()
export class NotificacionesInternasService {
  private readonly logger = new Logger('NotificacionInterna');

  constructor(private readonly prisma: PrismaService) {}

  async crear(params: CrearNotificacionInternaParams): Promise<void> {
    try {
      const empresaId = params.empresaId ?? getEmpresaId();
      await this.prisma.db.notificacionInterna.create({
        data: {
          empresaId,
          usuarioId: params.usuarioId,
          tipo: params.tipo,
          titulo: params.titulo,
          cuerpo: params.cuerpo,
          referenciaTipo: params.referenciaTipo,
          referenciaId: params.referenciaId,
        },
      });
    } catch (err) {
      this.logger.error(
        `Error creando notificación interna (tipo ${params.tipo}, usuario ${params.usuarioId})`,
        (err as Error)?.message,
      );
    }
  }

  /** Emite la misma notificación a varios destinatarios en una operación. */
  async crearParaVarios(
    usuarioIds: string[],
    datos: Omit<CrearNotificacionInternaParams, 'usuarioId'>,
  ): Promise<void> {
    if (usuarioIds.length === 0) return;
    try {
      const empresaId = datos.empresaId ?? getEmpresaId();
      await this.prisma.db.$transaction(
        usuarioIds.map((usuarioId) =>
          this.prisma.db.notificacionInterna.create({
            data: {
              empresaId,
              usuarioId,
              tipo: datos.tipo,
              titulo: datos.titulo,
              cuerpo: datos.cuerpo,
              referenciaTipo: datos.referenciaTipo,
              referenciaId: datos.referenciaId,
            },
          }),
        ),
      );
    } catch (err) {
      this.logger.error(
        `Error creando notificación interna para varios (tipo ${datos.tipo})`,
        (err as Error)?.message,
      );
    }
  }

  /** Lista las notificaciones del usuario logueado, más recientes primero. */
  async findAllForUsuario(usuarioId: string, antes?: string) {
    return this.prisma.db.notificacionInterna.findMany({
      where: {
        usuarioId,
        ...(antes && { createdAt: { lt: new Date(antes) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  async contarNoLeidas(usuarioId: string): Promise<{ noLeidas: number }> {
    const noLeidas = await this.prisma.db.notificacionInterna.count({
      where: { usuarioId, leidaAt: null },
    });
    return { noLeidas };
  }

  /** Marca una notificación como leída, solo si pertenece al usuario. */
  async marcarLeida(id: string, usuarioId: string) {
    const { count } = await this.prisma.db.notificacionInterna.updateMany({
      where: { id, usuarioId, leidaAt: null },
      data: { leidaAt: new Date() },
    });
    return { actualizadas: count };
  }

  async marcarTodasLeidas(usuarioId: string) {
    const { count } = await this.prisma.db.notificacionInterna.updateMany({
      where: { usuarioId, leidaAt: null },
      data: { leidaAt: new Date() },
    });
    return { actualizadas: count };
  }
}
