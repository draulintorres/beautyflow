import { Module } from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { AgendaController } from './agenda.controller';
import { EmpleadosModule } from '../empleados/empleados.module';
import { PosModule } from '../pos/pos.module';

@Module({
  // PosModule provee VentasService -- lo usa finalizarSinCobro() para
  // "Cliente no pagó" (crearPendientePorCitaSinCobro). Sin dependencia
  // circular: PosModule no importa nada de agenda/.
  imports: [EmpleadosModule, PosModule], // también provee DisponibilidadService
  controllers: [AgendaController],
  providers: [AgendaService],
  exports: [AgendaService],
})
export class AgendaModule {}
