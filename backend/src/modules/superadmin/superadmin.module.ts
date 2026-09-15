import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { SuperAdminService } from './superadmin.service';
import { SuperAdminBillingService } from './superadmin-billing.service';
import { LimitsService } from './limits.service';
import { ModulosEfectivosService } from './modulos-efectivos.service';
import { SuperAdminController } from './superadmin.controller';
import { SuperAdminGuard } from './guards/superadmin.guard';

/**
 * Global para exportar LimitsService y ModulosEfectivosService,
 * disponibles en todo el árbol sin importar el módulo explícitamente.
 */
@Global()
@Module({
  imports: [ConfigModule, JwtModule.register({})],
  controllers: [SuperAdminController],
  providers: [
    SuperAdminService,
    SuperAdminBillingService,
    LimitsService,
    ModulosEfectivosService,
    SuperAdminGuard,
  ],
  exports: [LimitsService, ModulosEfectivosService],
})
export class SuperAdminModule {}
