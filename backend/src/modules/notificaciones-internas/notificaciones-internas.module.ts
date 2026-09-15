import { Global, Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { NotificacionesInternasService } from './notificaciones-internas.service';
import { NotificacionesInternasController } from './notificaciones-internas.controller';
import { RecordatorioMatutinoService } from './recordatorio-matutino.service';
import { AvisoPrevioCitaService } from './aviso-previo-cita.service';

/**
 * Global para que cualquier módulo (Agenda, POS, y el cron de Fase 2/3)
 * pueda inyectar NotificacionesInternasService sin importar este módulo.
 * Importa AgendaModule para reutilizar AgendaService.findByFecha en el
 * recordatorio matutino (Fase 2), en vez de reimplementar el query.
 */
@Global()
@Module({
  imports: [AgendaModule],
  controllers: [NotificacionesInternasController],
  providers: [NotificacionesInternasService, RecordatorioMatutinoService, AvisoPrevioCitaService],
  exports: [NotificacionesInternasService],
})
export class NotificacionesInternasModule {}
