import { Module } from '@nestjs/common';
import {
  ProductosService,
  CategoriasProductoService,
} from './productos.service';
import { ProveedoresService, ComprasService } from './compras.service';
import { MovimientosService } from './movimientos.service';
import {
  ProductosController,
  CategoriasProductoController,
  ProveedoresController,
  ComprasController,
  InventarioController,
} from './inventario.controller';

@Module({
  controllers: [
    ProductosController,
    CategoriasProductoController,
    ProveedoresController,
    ComprasController,
    InventarioController,
  ],
  providers: [
    ProductosService,
    CategoriasProductoService,
    ProveedoresService,
    ComprasService,
    MovimientosService,
  ],
  exports: [ProductosService],
})
export class InventarioModule {}
