import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { PortalAuthService } from './portal-auth.service';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';
import { PortalAuthGuard } from './guards/portal-auth.guard';
import { AgendaModule } from '../agenda/agenda.module';
import { EmpleadosModule } from '../empleados/empleados.module';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    AgendaModule, // AgendaService para reservar/reagendar/cancelar
    EmpleadosModule, // DisponibilidadService para las horas libres
  ],
  controllers: [PortalController],
  providers: [PortalAuthService, PortalService, PortalAuthGuard],
})
export class PortalModule {}
