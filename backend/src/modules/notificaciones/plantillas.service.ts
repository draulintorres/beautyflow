import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { NotificationService } from './notification.service';
import { UpsertPlantillaDto, PLANTILLAS_DEFECTO } from './dto/notificacion.dto';
import { getEmpresaId } from '../../core/tenant/tenant-context';
import {
  NotificacionEvento,
  CanalNotificacion,
  VentaStatus,
  CitaStatus,
} from '@prisma/client';

@Injectable()
export class PlantillasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista las plantillas (personalizadas + las por defecto que falten). */
  async findAll() {
    const personalizadas = await this.prisma.db.plantillaNotificacion.findMany({
      orderBy: { evento: 'asc' },
    });
    return {
      personalizadas,
      porDefecto: PLANTILLAS_DEFECTO,
    };
  }

  async upsert(dto: UpsertPlantillaDto) {
    const empresaId = getEmpresaId();
    const existing = await this.prisma.db.plantillaNotificacion.findFirst({
      where: { evento: dto.evento, canal: dto.canal },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.db.plantillaNotificacion.update({
        where: { id: existing.id },
        data: {
          asunto: dto.asunto,
          cuerpo: dto.cuerpo,
          activa: dto.activa ?? true,
        },
      });
    }
    return this.prisma.db.plantillaNotificacion.create({
      data: {
        empresaId,
        evento: dto.evento,
        canal: dto.canal,
        asunto: dto.asunto,
        cuerpo: dto.cuerpo,
        activa: dto.activa ?? true,
      },
    });
  }
}

/**
 * Disparadores programados. En producción se invocan desde un cron
 * (ej. @nestjs/schedule). Aquí se exponen como métodos llamables vía
 * endpoint para poder probarlos y para que un scheduler externo los dispare.
 */
@Injectable()
export class NotificacionesJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationService,
  ) {}

  /** Recordatorio 24h: citas de mañana, estado activo. */
  async recordatorios24h(): Promise<{ enviados: number }> {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    const ini = new Date(manana);
    ini.setHours(0, 0, 0, 0);
    const fin = new Date(manana);
    fin.setHours(23, 59, 59, 999);

    const citas = await this.prisma.db.cita.findMany({
      where: {
        inicio: { gte: ini, lte: fin },
        estado: { in: [CitaStatus.SCHEDULED, CitaStatus.CONFIRMED] },
      },
      include: { cliente: { select: { id: true } } },
    });

    let enviados = 0;
    for (const c of citas) {
      if (!c.clienteId) continue;
      await this.notif.notificar({
        evento: NotificacionEvento.RECORDATORIO_24H,
        clienteId: c.clienteId,
        variables: {
          fecha: c.inicio.toISOString().slice(0, 10),
          hora: this.hhmm(c.inicio),
        },
        referenciaTipo: 'CITA',
        referenciaId: c.id,
      });
      enviados++;
    }
    return { enviados };
  }

  /** Felicitaciones de cumpleaños: clientes que cumplen hoy. */
  async cumpleanos(): Promise<{ enviados: number }> {
    const hoy = new Date();
    const mes = hoy.getMonth() + 1;
    const dia = hoy.getDate();

    // Filtrar en memoria por mes/día (fechaNac es Date)
    const clientes = await this.prisma.db.cliente.findMany({
      where: { activo: true, fechaNac: { not: null } },
      select: { id: true, fechaNac: true },
    });

    let enviados = 0;
    for (const c of clientes) {
      if (!c.fechaNac) continue;
      const f = new Date(c.fechaNac);
      if (f.getMonth() + 1 === mes && f.getDate() === dia) {
        await this.notif.notificar({
          evento: NotificacionEvento.CUMPLEANOS,
          clienteId: c.id,
        });
        enviados++;
      }
    }
    return { enviados };
  }

  /** Aviso de deuda: clientes con saldo pendiente. */
  async avisosDeuda(): Promise<{ enviados: number }> {
    const ventas = await this.prisma.db.venta.groupBy({
      by: ['clienteId'],
      where: {
        clienteId: { not: null },
        estado: { in: [VentaStatus.PENDIENTE, VentaStatus.ABONO_PARCIAL] },
      },
      _sum: { saldo: true },
    });

    let enviados = 0;
    for (const v of ventas) {
      if (!v.clienteId) continue;
      const saldo = Number(v._sum.saldo ?? 0);
      if (saldo <= 0) continue;
      await this.notif.notificar({
        evento: NotificacionEvento.AVISO_DEUDA,
        clienteId: v.clienteId,
        variables: { saldo: saldo.toFixed(2) },
      });
      enviados++;
    }
    return { enviados };
  }

  private hhmm(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
