import { Module } from '@nestjs/common';
import { ReportesDataService } from './reportes-data.service';
import { ExportService } from './export.service';
import { ReportesController } from './reportes.controller';

@Module({
  controllers: [ReportesController],
  providers: [ReportesDataService, ExportService],
  exports: [ReportesDataService],
})
export class ReportesModule {}
