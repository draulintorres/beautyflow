import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Modulos, Roles } from '../../core/auth/decorators/auth.decorators';

@Controller('dashboard')
@Modulos('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * `sucursalId` (opcional): solo lo respeta el OWNER, para ver el
   * Dashboard filtrado a UNA sucursal desde la pestaña de "Ventas por
   * sucursal". Un usuario no-OWNER ya viene aislado a su sucursal por
   * `SucursalScopeService` y este parámetro se ignora.
   */
  @Get()
  resumen(@Query('sucursalId') sucursalId?: string) {
    return this.dashboard.resumen(sucursalId);
  }

  @Get('kpis')
  kpis(@Query('sucursalId') sucursalId?: string) {
    return this.dashboard.kpis(sucursalId);
  }

  /**
   * `anio` (opcional): selector "Este año / Año pasado" de la tarjeta
   * "Ventas de los últimos 12 meses". Sin `anio` → comportamiento de
   * siempre (ventana móvil de los últimos 12 meses). Con `anio` → ese año
   * calendario completo (enero-diciembre).
   * `mes` (opcional, 1-12): filtro de mes específico de esa misma tarjeta
   * — cambia el gráfico a un desglose diario de ese mes (del `anio`
   * elegido, o el actual si no se eligió ninguno).
   */
  @Get('graficas')
  graficas(
    @Query('sucursalId') sucursalId?: string,
    @Query('anio') anio?: string,
    @Query('mes') mes?: string,
  ) {
    return this.dashboard.graficas(sucursalId, anio, mes);
  }

  @Get('rankings')
  rankings(@Query('sucursalId') sucursalId?: string) {
    return this.dashboard.rankings(sucursalId);
  }

  // Parte A (pestaña multi-sucursal en Inicio): solo OWNER, y solo si la
  // empresa tiene el módulo de sucursales — @Modulos aquí reemplaza (no
  // suma) el 'dashboard' de la clase, así que exige puntualmente
  // 'sucursales'. El frontend además la esconde si hay 1 sola sucursal.
  @Get('por-sucursal')
  @Roles('OWNER')
  @Modulos('sucursales')
  porSucursal() {
    return this.dashboard.porSucursal();
  }
}