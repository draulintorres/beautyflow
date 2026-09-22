import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MetodosPagoService } from './metodos-pago.service';
import { CajaService } from './caja.service';
import {
  CreateMetodoPagoDto,
  UpdateMetodoPagoDto,
  CreateCajaDto,
  AbrirCajaDto,
  CerrarCajaDto,
} from './dto/caja.dto';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';

@Controller('metodos-pago')
export class MetodosPagoController {
  constructor(private readonly metodos: MetodosPagoService) {}

  @Get()
  @Modulos('pos', 'cobros')
  findAll(@Query('incluirInactivos') incluirInactivos?: string) {
    return this.metodos.findAll(incluirInactivos === 'true');
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@Body() dto: CreateMetodoPagoDto) {
    return this.metodos.create(dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMetodoPagoDto,
  ) {
    return this.metodos.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.metodos.remove(id);
  }
}

@Controller('caja')
export class CajaController {
  constructor(private readonly caja: CajaService) {}

  @Get()
  @Modulos('pos')
  findAll(@Query('sucursalId') sucursalId?: string) {
    return this.caja.findAll(sucursalId);
  }

  @Get('estado')
  @Modulos('pos')
  estado() {
    return this.caja.estado();
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  create(@Body() dto: CreateCajaDto) {
    return this.caja.create(dto);
  }

  @Post('abrir')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER')
  abrir(@Body() dto: AbrirCajaDto) {
    return this.caja.abrir(dto);
  }

  @Get(':aperturaId/resumen')
  @Modulos('pos')
  resumen(@Param('aperturaId', ParseUUIDPipe) aperturaId: string) {
    return this.caja.resumen(aperturaId);
  }

  @Post(':aperturaId/cerrar')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER')
  @HttpCode(HttpStatus.OK)
  cerrar(
    @Param('aperturaId', ParseUUIDPipe) aperturaId: string,
    @Body() dto: CerrarCajaDto,
  ) {
    return this.caja.cerrar(aperturaId, dto);
  }
}