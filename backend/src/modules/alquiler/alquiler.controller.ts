import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlquilerService } from './alquiler.service';
import { RentaAlquilerService } from './renta-alquiler.service';
import {
  UpsertAlquilerConfigDto,
  RegistrarAbonoAlquilerDto,
  CrearDeudaPruebaDto,
} from './dto/alquiler.dto';
import { Roles } from '../../core/auth/decorators/auth.decorators';
import { EstadoDeudaAlquiler } from '@prisma/client';

/**
 * Pieza 1 del alquiler de silla: configuración por inquilino y la
 * estructura de la cuenta por cobrar (sin generación automática todavía).
 * Todo el módulo es OWNER/ADMIN — es el dueño quien configura la renta de
 * sus inquilinos y quien ve/cobra lo que le deben, no el propio inquilino.
 */
@Controller('alquiler')
@Roles('OWNER', 'ADMIN')
export class AlquilerController {
  constructor(
    private readonly alquiler: AlquilerService,
    private readonly rentaAlquiler: RentaAlquilerService,
    private readonly config: ConfigService,
  ) {}

  @Get('config/:empleadoId')
  getConfig(@Param('empleadoId', ParseUUIDPipe) empleadoId: string) {
    return this.alquiler.getConfig(empleadoId);
  }

  @Put('config/:empleadoId')
  upsertConfig(
    @Param('empleadoId', ParseUUIDPipe) empleadoId: string,
    @Body() dto: UpsertAlquilerConfigDto,
  ) {
    return this.alquiler.upsertConfig(empleadoId, dto);
  }

  /**
   * Abierto también a ALQUILER (Pieza 3): un inquilino ve SUS propias
   * deudas — el servicio fuerza el filtro por su empleadoId, ignorando el
   * query si lo manipula. El resto del controlador sigue OWNER/ADMIN.
   */
  @Get('deudas')
  @Roles('OWNER', 'ADMIN', 'ALQUILER')
  listarDeudas(
    @Query('empleadoId') empleadoId?: string,
    @Query('estado') estado?: EstadoDeudaAlquiler,
  ) {
    return this.alquiler.listarDeudas({ empleadoId, estado });
  }

  @Get('deudas/:id')
  @Roles('OWNER', 'ADMIN', 'ALQUILER')
  findDeuda(@Param('id', ParseUUIDPipe) id: string) {
    return this.alquiler.findDeuda(id);
  }

  @Post('deudas/:id/abono')
  registrarAbono(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegistrarAbonoAlquilerDto,
  ) {
    return this.alquiler.registrarAbono(id, dto);
  }

  // ---------- dev: crear una deuda de prueba sin depender de Pieza 2 ----------
  @Post('dev/deuda-prueba')
  crearDeudaPrueba(@Body() dto: CrearDeudaPruebaDto) {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new ForbiddenException('No disponible en producción');
    }
    return this.alquiler.crearDeudaPrueba(dto);
  }

  /**
   * Dev/temporal (Pieza 2c): dispara el barrido de renta bajo demanda, sin
   * esperar al lunes/día 1. `forzar=true` además ignora el anti-duplicado
   * (permite regenerar aunque ya exista una deuda del mismo período) — solo
   * para pruebas.
   */
  @Post('dev/generar-renta')
  generarRentaDev(@Query('forzar') forzar?: string) {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new ForbiddenException('No disponible en producción');
    }
    return this.rentaAlquiler.ejecutarManual(forzar === 'true');
  }
}
