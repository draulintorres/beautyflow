import { Module } from '@nestjs/common';
import { AlquilerService } from './alquiler.service';
import { RentaAlquilerService } from './renta-alquiler.service';
import { AlquilerController } from './alquiler.controller';

@Module({
  controllers: [AlquilerController],
  providers: [AlquilerService, RentaAlquilerService],
  exports: [AlquilerService, RentaAlquilerService],
})
export class AlquilerModule {}
