import { Module } from '@nestjs/common';
import { LiquidacionesController } from './liquidaciones.controller';
import { LiquidacionesService } from './liquidaciones.service';
import { LiquidacionesPdfService } from './liquidaciones-pdf.service';
import { PrismaModule } from '../../core/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LiquidacionesController],
  providers: [LiquidacionesService, LiquidacionesPdfService],
})
export class LiquidacionesModule {}