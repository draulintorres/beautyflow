import { Module } from '@nestjs/common';
import { CabinasService } from './cabinas.service';
import { CabinasController } from './cabinas.controller';

@Module({
  controllers: [CabinasController],
  providers: [CabinasService],
  exports: [CabinasService],
})
export class CabinasModule {}
