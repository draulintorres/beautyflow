import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { getTenantStoreOrNull } from '../../core/tenant/tenant-context';
import {
  CanalProvider,
  WhatsAppStubProvider,
  EmailStubProvider,
  SmsStubProvider,
} from './channels/providers';
import { PLANTILLAS_DEFECTO } from './dto/notificacion.dto';
import {
  NotificacionEvento,
  CanalNotificacion,
  NotificacionStatus,
} from '@prisma/client';

export interface NotificarParams {
  evento: NotificacionEvento;
  clienteId?: string;
  /** Canal preferido; si no se indica, se elige por disponibilidad del cliente. */
  canal?: CanalNotificacion;
  /** Variables para la plantilla: { cliente, fecha, hora, total, ... } */
  variables?: Record<string, string | number>;
  referenciaTipo?: string;
  referenciaId?: string;
  /** Destinatario explícito (si no hay clienteId). */
  destinatario?: string;
}

/**
 * Servicio central de notificaciones. Cualquier módulo lo inyecta y llama
 * a `notificar(...)`. Resuelve plantilla (de BD o por defecto), reemplaza
 * variables, elige canal y proveedor, envía y registra el resultado.
 *
 * Best-effort: nunca lanza; si falla, registra la notificación como FALLIDA.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger('Notification');
  private readonly providers: Record<CanalNotificacion, CanalProvider>;

  constructor(
    private readonly prisma: PrismaService,
    whatsapp: WhatsAppStubProvider,
    email: EmailStubProvider,
    sms: SmsStubProvider,
  ) {
    this.providers = {
      [CanalNotificacion.WHATSAPP]: whatsapp,
      [CanalNotificacion.EMAIL]: email,
      [CanalNotificacion.SMS]: sms,
    };
  }

  async notificar(params: NotificarParams): Promise<void> {
    const store = getTenantStoreOrNull();
    if (!store?.empresaId) return;
    const empresaId = store.empresaId;

    try {
      // Resolver cliente y destinatario
      let destinatario = params.destinatario;
      let clienteNombre = '';
      let canal = params.canal;

      if (params.clienteId) {
        const cliente = await this.prisma.db.cliente.findFirst({
          where: { id: params.clienteId },
          select: { nombre: true, whatsapp: true, telefono: true, email: true },
        });
        if (cliente) {
          clienteNombre = cliente.nombre;
          // Elegir canal por disponibilidad si no se especificó
          if (!canal) {
            if (cliente.whatsapp || cliente.telefono) canal = CanalNotificacion.WHATSAPP;
            else if (cliente.email) canal = CanalNotificacion.EMAIL;
          }
          if (!destinatario) {
            destinatario =
              canal === CanalNotificacion.EMAIL
                ? cliente.email ?? undefined
                : cliente.whatsapp ?? cliente.telefono ?? undefined;
          }
        }
      }

      canal = canal ?? CanalNotificacion.WHATSAPP;
      if (!destinatario) {
        this.logger.warn(
          `Sin destinatario para evento ${params.evento} (cliente ${params.clienteId})`,
        );
        return;
      }

      // Resolver plantilla (BD o por defecto)
      const plantilla = await this.resolverPlantilla(empresaId, params.evento, canal);

      // Reemplazar variables
      const variables = {
        cliente: clienteNombre,
        ...params.variables,
      };
      const cuerpo = this.render(plantilla.cuerpo, variables);
      const asunto = plantilla.asunto
        ? this.render(plantilla.asunto, variables)
        : undefined;

      // Enviar por el canal
      const provider = this.providers[canal];
      const resultado = await provider.enviar({ destinatario, asunto, cuerpo });

      // Registrar
      await this.prisma.notificacion.create({
        data: {
          empresaId,
          clienteId: params.clienteId,
          evento: params.evento,
          canal,
          destinatario,
          asunto,
          cuerpo,
          status: resultado.exito
            ? NotificacionStatus.ENVIADA
            : NotificacionStatus.FALLIDA,
          error: resultado.error,
          referenciaTipo: params.referenciaTipo,
          referenciaId: params.referenciaId,
          enviadaAt: resultado.exito ? new Date() : undefined,
        },
      });
    } catch (err) {
      // Nunca propagar: la notificación no debe tumbar la operación de negocio
      this.logger.error(
        `Error notificando evento ${params.evento}`,
        (err as Error)?.message,
      );
    }
  }

  // ---------- consulta de historial ----------
  async findAll(filtros: { clienteId?: string; status?: NotificacionStatus }) {
    return this.prisma.db.notificacion.findMany({
      where: {
        ...(filtros.clienteId && { clienteId: filtros.clienteId }),
        ...(filtros.status && { status: filtros.status }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ---------- helpers ----------
  private async resolverPlantilla(
    empresaId: string,
    evento: NotificacionEvento,
    canal: CanalNotificacion,
  ): Promise<{ asunto?: string; cuerpo: string }> {
    const personalizada = await this.prisma.db.plantillaNotificacion.findFirst({
      where: { empresaId, evento, canal, activa: true },
    });
    if (personalizada) {
      return {
        asunto: personalizada.asunto ?? undefined,
        cuerpo: personalizada.cuerpo,
      };
    }
    return PLANTILLAS_DEFECTO[evento];
  }

  /** Reemplaza {{variable}} por su valor. */
  private render(texto: string, variables: Record<string, any>): string {
    return texto.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = variables[key];
      return val !== undefined && val !== null ? String(val) : '';
    });
  }
}
