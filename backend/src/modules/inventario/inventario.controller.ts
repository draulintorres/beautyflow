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
import {
  ProductosService,
  CategoriasProductoService,
} from './productos.service';
import { ProveedoresService, ComprasService } from './compras.service';
import { MovimientosService } from './movimientos.service';
import {
  CreateProductoDto,
  UpdateProductoDto,
  CreateCategoriaProductoDto,
  UpdateCategoriaProductoDto,
  CreateProveedorDto,
  UpdateProveedorDto,
  CreateCompraDto,
  AjusteInventarioDto,
  TransferenciaDto,
} from './dto/inventario.dto';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';

// ===================== PRODUCTOS =====================
@Controller('productos')
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  @Get()
  @Modulos('inventario', 'pos', 'reportes')
  findAll(
    @Query('q') q?: string,
    @Query('categoriaId') categoriaId?: string,
    @Query('activo') activo?: string,
  ) {
    return this.productos.findAll({
      q,
      categoriaId,
      activo: activo === undefined ? undefined : activo === 'true',
    });
  }

  @Get(':id')
  @Modulos('inventario', 'pos', 'reportes')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productos.findOne(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  create(@Body() dto: CreateProductoDto) {
    return this.productos.create(dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductoDto) {
    return this.productos.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productos.remove(id);
  }
}

// ===================== CATEGORÍAS DE PRODUCTO =====================
@Controller('categorias-producto')
export class CategoriasProductoController {
  constructor(private readonly categorias: CategoriasProductoService) {}

  @Get()
  @Modulos('inventario')
  findAll() {
    return this.categorias.findAll();
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  create(@Body() dto: CreateCategoriaProductoDto) {
    return this.categorias.create(dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoriaProductoDto,
  ) {
    return this.categorias.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categorias.remove(id);
  }
}

// ===================== PROVEEDORES =====================
@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedores: ProveedoresService) {}

  @Get()
  @Modulos('inventario')
  findAll(@Query('activo') activo?: string) {
    return this.proveedores.findAll(
      activo === undefined ? undefined : activo === 'true',
    );
  }

  @Get(':id')
  @Modulos('inventario')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.proveedores.findOne(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  create(@Body() dto: CreateProveedorDto) {
    return this.proveedores.create(dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProveedorDto) {
    return this.proveedores.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.proveedores.remove(id);
  }
}

// ===================== COMPRAS =====================
@Controller('compras')
export class ComprasController {
  constructor(private readonly compras: ComprasService) {}

  @Get()
  @Modulos('inventario')
  findAll() {
    return this.compras.findAll();
  }

  @Get(':id')
  @Modulos('inventario')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.compras.findOne(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  create(@Body() dto: CreateCompraDto) {
    return this.compras.create(dto);
  }

  @Patch(':id/confirmar')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  confirmar(@Param('id', ParseUUIDPipe) id: string) {
    return this.compras.confirmar(id);
  }
}

// ===================== INVENTARIO (movimientos) =====================
@Controller('inventario')
export class InventarioController {
  constructor(
    private readonly movimientos: MovimientosService,
    private readonly productos: ProductosService,
  ) {}

  @Get('stock-bajo')
  @Modulos('inventario', 'reportes')
  stockBajo() {
    return this.productos.stockBajo();
  }

  @Get('kardex/:productoId')
  @Modulos('inventario', 'reportes')
  kardex(
    @Param('productoId', ParseUUIDPipe) productoId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.movimientos.kardex(productoId, { desde, hasta });
  }

  @Post('ajustes')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  ajustar(@Body() dto: AjusteInventarioDto) {
    return this.movimientos.ajustar(dto);
  }

  @Post('transferencias')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  transferir(@Body() dto: TransferenciaDto) {
    return this.movimientos.transferir(dto);
  }
}