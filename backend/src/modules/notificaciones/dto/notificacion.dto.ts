import { IsEnum, IsString, IsOptional, IsBoolean, IsUUID, MaxLength } from 'class-validator';
import { NotificacionEvento, CanalNotificacion } from '@prisma/client';

/**
 * Plantillas por defecto (español, contexto RD). Soportan variables
 * con sintaxis {{variable}} que NotificationService reemplaza.
 */
export const PLANTILLAS_DEFECTO: Record<
  NotificacionEvento,
  { asunto?: string; cuerpo: string }
> = {
  CITA_CREADA: {
    asunto: 'Cita agendada',
    cuerpo:
      'Hola {{cliente}}, tu cita en {{empresa}} quedó agendada para el {{fecha}} a las {{hora}}. ¡Te esperamos!',
  },
  RECORDATORIO_24H: {
    asunto: 'Recordatorio de tu cita',
    cuerpo:
      'Hola {{cliente}}, te recordamos tu cita mañana {{fecha}} a las {{hora}} en {{empresa}}.',
  },
  CONFIRMACION: {
    asunto: 'Cita confirmada',
    cuerpo: 'Hola {{cliente}}, tu cita del {{fecha}} a las {{hora}} ha sido confirmada.',
  },
  CANCELACION: {
    asunto: 'Cita cancelada',
    cuerpo:
      'Hola {{cliente}}, tu cita del {{fecha}} fue cancelada. Contáctanos para reagendar.',
  },
  REPROGRAMACION: {
    asunto: 'Cita reprogramada',
    cuerpo:
      'Hola {{cliente}}, tu cita se reprogramó para el {{fecha}} a las {{hora}}.',
  },
  FACTURA_EMITIDA: {
    asunto: 'Tu factura',
    cuerpo:
      'Hola {{cliente}}, gracias por tu visita. Factura {{factura}} por {{total}}.',
  },
  PAGO_RECIBIDO: {
    asunto: 'Pago recibido',
    cuerpo:
      'Hola {{cliente}}, recibimos tu pago de {{monto}}. Saldo pendiente: {{saldo}}.',
  },
  CUMPLEANOS: {
    asunto: '¡Feliz cumpleaños!',
    cuerpo:
      '¡Feliz cumpleaños {{cliente}}! 🎉 De parte de {{empresa}}, te deseamos un día especial. Pasa a celebrar con nosotros.',
  },
  AVISO_DEUDA: {
    asunto: 'Recordatorio de saldo',
    cuerpo:
      'Hola {{cliente}}, te recordamos que tienes un saldo pendiente de {{saldo}} en {{empresa}}.',
  },
};

export class UpsertPlantillaDto {
  @IsEnum(NotificacionEvento)
  evento: NotificacionEvento;

  @IsEnum(CanalNotificacion)
  canal: CanalNotificacion;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  asunto?: string;

  @IsString()
  @MaxLength(2000)
  cuerpo: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export class EnviarManualDto {
  @IsEnum(NotificacionEvento)
  evento: NotificacionEvento;

  @IsEnum(CanalNotificacion)
  canal: CanalNotificacion;

  @IsUUID()
  clienteId: string;
}
