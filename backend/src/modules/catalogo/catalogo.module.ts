import { Module } from '@nestjs/common';
import { CategoriasService } from './categorias.service';
import { ServiciosService } from './servicios.service';
import { PaquetesService } from './paquetes.service';
import { CategoriasController } from './categorias.controller';
import { ServiciosController } from './servicios.controller';
import { PaquetesController } from './paquetes.controller';

@Module({
  controllers: [
    CategoriasController,
    ServiciosController,
    PaquetesController,
  ],
  providers: [CategoriasService, ServiciosService, PaquetesService],
  exports: [ServiciosService],
})
export class CatalogoModule {}
