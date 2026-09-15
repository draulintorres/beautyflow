import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SucursalesService } from './sucursales.service';
import { CreateSucursalDto, UpdateSucursalDto } from './dto/sucursal.dto';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';

@Controller('sucursales')
export class SucursalesController {
  constructor(private readonly sucursales: SucursalesService) {}

  @Get()
  @Modulos('sucursales', 'equipo', 'reportes')
  findAll() {
    return this.sucursales.findAll();
  }

  @Get(':id')
  @Modulos('sucursales', 'equipo', 'reportes')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sucursales.findOne(id);
  }

  /** Crear una sucursal ADICIONAL es gestión multi-sucursal — requiere el
   *  módulo. (El límite maxSucursales, en LimitsService, es una capa
   *  aparte: controla CUÁNTAS: el módulo controla si puede gestionar
   *  sucursales del todo.) */
  @Post()
  @Roles('OWNER', 'ADMIN')
  @Modulos('sucursales')
  create(@Body() dto: CreateSucursalDto) {
    return this.sucursales.create(dto);
  }

  /** Editar SIN gate de módulo a propósito: una empresa sin el módulo
   *  sucursales igual tiene su única sucursal principal (creada al
   *  registrarse) y debe poder mantenerla — nombre, dirección, teléfono —
   *  como parte normal de operar. Bloquearlo dejaría a un plan Básico/Pro
   *  sin poder ni cambiarle el nombre a su propio local. */
  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSucursalDto,
  ) {
    return this.sucursales.update(id, dto);
  }

  /** Eliminar solo es posible si hay más de una sucursal y no es la
   *  principal (ver SucursalesService.remove) — o sea, siempre es sobre
   *  una sucursal ADICIONAL. Misma gestión multi-sucursal que crear. */
  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @Modulos('sucursales')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.sucursales.remove(id);
  }
}
