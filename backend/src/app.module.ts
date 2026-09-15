import {
  Module,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './core/prisma/prisma.module';
import { AuthModule } from './core/auth/auth.module';
import { AuditModule } from './core/audit/audit.module';
import { InquilinoModule } from './core/auth/inquilino.module';
import { TenantMiddleware } from './core/tenant/tenant.middleware';
import { TenantModule } from './core/tenant/tenant.module';
import { JwtAuthGuard } from './core/auth/guards/jwt-auth.guard';
import { RolesGuard } from './core/auth/guards/roles.guard';
import { ModulosGuard } from './core/auth/guards/modulos.guard';
import { EmpresaModule } from './modules/empresa/empresa.module';
import { SucursalesModule } from './modules/sucursales/sucursales.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { EmpleadosModule } from './modules/empleados/empleados.module';
import { CatalogoModule } from './modules/catalogo/catalogo.module';
import { AgendaModule } from './modules/agenda/agenda.module';
import { CabinasModule } from './modules/cabinas/cabinas.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { PosModule } from './modules/pos/pos.module';
import { InventarioModule } from './modules/inventario/inventario.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportesModule } from './modules/reportes/reportes.module';
import { LiquidacionesModule } from './modules/liquidaciones/liquidaciones.module';
import { AlquilerModule } from './modules/alquiler/alquiler.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { NotificacionesInternasModule } from './modules/notificaciones-internas/notificaciones-internas.module';
import { PortalModule } from './modules/portal/portal.module';
import { SuperAdminModule } from './modules/superadmin/superadmin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    TenantModule,
    AuthModule,
    AuditModule,
    InquilinoModule,
    NotificacionesModule,
    NotificacionesInternasModule,
    SuperAdminModule,
    // Módulos de negocio
    EmpresaModule,
    SucursalesModule,
    UsuariosModule,
    EmpleadosModule,
    CatalogoModule,
    AgendaModule,
    CabinasModule,
    ClientesModule,
    PosModule,
    InventarioModule,
    DashboardModule,
    ReportesModule,
    LiquidacionesModule,
    AlquilerModule,
    PortalModule,
  ],
  providers: [
    // Guards globales en orden: auth → roles → módulos
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ModulosGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // El middleware de tenant corre en todas las rutas; resuelve contexto
    // cuando hay token y deja pasar las públicas sin él.
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
