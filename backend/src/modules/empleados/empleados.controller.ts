import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { EmpleadosService } from './empleados.service';
import { DisponibilidadService } from './disponibilidad.service';
import {
  CreateEmpleadoDto,
  UpdateEmpleadoDto,
  SetEspecialidadesDto,
  SetHorariosDto,
  CreateBloqueoDto,
  SetComisionesDto,
  SetComisionUiDto,
  CrearAccesoDto,
} from './dto/empleado.dto';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';

@Controller('empleados')
export class EmpleadosController {
  constructor(
    private readonly empleados: EmpleadosService,
    private readonly disponibilidad: DisponibilidadService,
  ) {}

  // ---------- CRUD ----------
  @Get()
  @Modulos('equipo', 'pos', 'agenda', 'reportes')
  findAll() {
    return this.empleados.findAll();
  }

  @Get(':id')
  @Modulos('equipo', 'pos', 'agenda', 'reportes')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.empleados.findOne(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  create(@Body() dto: CreateEmpleadoDto) {
    return this.empleados.create(dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmpleadoDto,
  ) {
    return this.empleados.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.empleados.remove(id);
  }

  // ---------- DISPONIBILIDAD ----------
  @Get(':id/disponibilidad')
  @Modulos('equipo', 'pos', 'agenda', 'reportes')
  getDisponibilidad(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('fecha') fecha: string,
  ) {
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException('Parámetro "fecha" requerido (YYYY-MM-DD)');
    }
    return this.disponibilidad.getDisponibilidad(id, fecha);
  }

  // ---------- ACCESO AL SISTEMA ----------
  @Post(':id/crear-acceso')
  @Roles('OWNER', 'ADMIN')
  crearAcceso(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrearAccesoDto,
  ) {
    return this.empleados.crearAcceso(id, dto);
  }

  @Patch(':id/quitar-acceso')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  quitarAcceso(@Param('id', ParseUUIDPipe) id: string) {
    return this.empleados.quitarAcceso(id);
  }

  // ---------- ESPECIALIDADES ----------
  @Get(':id/especialidades')
  @Modulos('equipo', 'pos', 'agenda', 'reportes')
  getEspecialidades(@Param('id', ParseUUIDPipe) id: string) {
    return this.empleados.getEspecialidades(id);
  }

  @Put(':id/especialidades')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  setEspecialidades(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetEspecialidadesDto,
  ) {
    return this.empleados.setEspecialidades(id, dto);
  }

  // ---------- HORARIOS ----------
  @Put(':id/horarios')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  setHorarios(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetHorariosDto,
  ) {
    return this.empleados.setHorarios(id, dto);
  }

  // ---------- BLOQUEOS ----------
  @Get(':id/bloqueos')
  @Modulos('equipo', 'pos', 'agenda', 'reportes')
  getBloqueos(@Param('id', ParseUUIDPipe) id: string) {
    return this.empleados.getBloqueos(id);
  }

  @Post(':id/bloqueos')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'RECEPCION')
  addBloqueo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBloqueoDto,
  ) {
    return this.empleados.addBloqueo(id, dto);
  }

  @Delete(':id/bloqueos/:bloqueoId')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'RECEPCION')
  @HttpCode(HttpStatus.OK)
  removeBloqueo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bloqueoId', ParseUUIDPipe) bloqueoId: string,
  ) {
    return this.empleados.removeBloqueo(id, bloqueoId);
  }

  // ---------- COMISIONES ----------
  @Get(':id/comisiones')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Modulos('comisiones', 'equipo')
  getComisiones(@Param('id', ParseUUIDPipe) id: string) {
    return this.empleados.getComisiones(id);
  }

  @Put(':id/comisiones')
  @Roles('OWNER', 'ADMIN')
  setComisiones(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetComisionesDto,
  ) {
    return this.empleados.setComisiones(id, dto);
  }

  @Get(':id/comision')
  @Roles('OWNER', 'ADMIN')
  @Modulos('comisiones', 'equipo')
  getComisionUi(@Param('id', ParseUUIDPipe) id: string) {
    return this.empleados.getComisionUi(id);
  }

  @Put(':id/comision')
  @Roles('OWNER', 'ADMIN')
  setComisionUi(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetComisionUiDto,
  ) {
    return this.empleados.setComisionUi(id, dto);
  }
}