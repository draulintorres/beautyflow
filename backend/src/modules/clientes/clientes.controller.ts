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
import { ClientesService } from './clientes.service';
import {
  CreateClienteDto,
  UpdateClienteDto,
  ClienteEtiqueta,
} from './dto/cliente.dto';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';

@Controller('clientes')
@Modulos('clientes', 'pos', 'cobros')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  /** GET /clientes?q=&etiqueta=VIP&activo=true */
  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('etiqueta') etiqueta?: ClienteEtiqueta,
    @Query('activo') activo?: string,
  ) {
    return this.clientes.findAll({
      q,
      etiqueta,
      activo: activo === undefined ? undefined : activo === 'true',
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientes.findOne(id);
  }

  @Get(':id/citas')
  getCitas(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientes.getCitas(id);
  }

  @Get(':id/compras')
  getCompras(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientes.getCompras(id);
  }

  @Get(':id/balance')
  getBalance(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientes.getBalance(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'RECEPCION', 'CASHIER')
  create(@Body() dto: CreateClienteDto) {
    return this.clientes.create(dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'RECEPCION', 'CASHIER')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClienteDto,
  ) {
    return this.clientes.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientes.remove(id);
  }
}
