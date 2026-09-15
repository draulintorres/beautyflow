import { Global, Module } from '@nestjs/common';
import { SucursalScopeService } from './sucursal-scope.service';

/**
 * Módulo global para utilidades de tenant que dependen de Prisma
 * (SucursalScopeService). El middleware de tenant se registra aparte en
 * AppModule porque va en la cadena de middleware, no de providers.
 */
@Global()
@Module({
  providers: [SucursalScopeService],
  exports: [SucursalScopeService],
})
export class TenantModule {}
