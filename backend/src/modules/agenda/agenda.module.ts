import { Module } from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { AgendaController } from './agenda.controller';
import { EmpleadosModule } from '../empleados/empleados.module';

@Module({
  imports: [EmpleadosModule], // provee DisponibilidadService
  controllers: [AgendaController],
  providers: [AgendaService],
  exports: [AgendaService],
})
export class AgendaModule {}
