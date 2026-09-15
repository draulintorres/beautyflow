import { Module } from '@nestjs/common';
import { EmpleadosService } from './empleados.service';
import { DisponibilidadService } from './disponibilidad.service';
import { EmpleadosController } from './empleados.controller';

@Module({
  controllers: [EmpleadosController],
  providers: [EmpleadosService, DisponibilidadService],
  // DisponibilidadService se exporta para reutilizarlo en Agenda y POS
  exports: [EmpleadosService, DisponibilidadService],
})
export class EmpleadosModule {}
