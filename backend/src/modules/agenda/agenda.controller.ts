import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AgendaService } from './agenda.service';
import {
  CreateCitaDto,
  RescheduleCitaDto,
  ChangeEstadoDto,
} from './dto/cita.dto';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';

@Controller('citas')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  /** GET /citas?fecha=YYYY-MM-DD[&empleadoId=] */
  @Get()
  @Modulos('agenda')
  findByFecha(
    @Query('fecha') fecha: string,
    @Query('empleadoId') empleadoId?: string,
    @Query('sucursalId') sucursalId?: string,
  ) {
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException('Parámetro "fecha" requerido (YYYY-MM-DD)');
    }
    return this.agenda.findByFecha(fecha, empleadoId, sucursalId);
  }

  /** GET /citas/ingreso-hoy?fecha=YYYY-MM-DD — declarado ANTES de :id para
   *  que no lo capture esa ruta. */
  @Get('ingreso-hoy')
  @Modulos('agenda')
  async ingresoHoy(@Query('fecha') fecha: string) {
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException('Parámetro "fecha" requerido (YYYY-MM-DD)');
    }
    return { ingresoHoy: await this.agenda.ingresoHoy(fecha) };
  }

  @Get(':id')
  @Modulos('agenda')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.agenda.findOne(id);
  }

  /** ALQUILER: un inquilino gestiona SUS propias citas (forzado en el
   *  servicio vía InquilinoService — ver Cambio 2 de la corrección). */
  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'RECEPCION', 'CASHIER', 'ALQUILER')
  create(@Body() dto: CreateCitaDto) {
    return this.agenda.create(dto);
  }

  @Patch(':id/estado')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'RECEPCION', 'CASHIER', 'ALQUILER')
  @HttpCode(HttpStatus.OK)
  changeEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeEstadoDto,
  ) {
    return this.agenda.changeEstado(id, dto.estado);
  }

  @Patch(':id/cancelar')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'RECEPCION', 'CASHIER', 'ALQUILER')
  @HttpCode(HttpStatus.OK)
  cancelar(@Param('id', ParseUUIDPipe) id: string) {
    return this.agenda.cancelar(id);
  }

  @Patch(':id/reprogramar')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'RECEPCION', 'CASHIER', 'ALQUILER')
  @HttpCode(HttpStatus.OK)
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleCitaDto,
  ) {
    return this.agenda.reschedule(id, dto);
  }
}
