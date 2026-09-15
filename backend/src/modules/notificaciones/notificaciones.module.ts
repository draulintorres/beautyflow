import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import {
  PlantillasService,
  NotificacionesJobsService,
} from './plantillas.service';
import { NotificacionesController } from './notificaciones.controller';
import {
  WhatsAppStubProvider,
  EmailStubProvider,
  SmsStubProvider,
} from './channels/providers';

/**
 * Global para que cualquier módulo (Agenda, POS) pueda inyectar
 * NotificationService y disparar eventos sin importar este módulo.
 */
@Global()
@Module({
  controllers: [NotificacionesController],
  providers: [
    NotificationService,
    PlantillasService,
    NotificacionesJobsService,
    WhatsAppStubProvider,
    EmailStubProvider,
    SmsStubProvider,
  ],
  exports: [NotificationService],
})
export class NotificacionesModule {}
