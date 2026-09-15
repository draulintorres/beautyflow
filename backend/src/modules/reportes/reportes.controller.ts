import {
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportesDataService } from './reportes-data.service';
import { ExportService, ArchivoExportado } from './export.service';
import { ReporteQueryDto, ReporteTabular } from './dto/reporte.dto';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';

@Controller('reportes')
@Roles('OWNER', 'ADMIN', 'MANAGER')
@Modulos('reportes')
export class ReportesController {
  constructor(
    private readonly data: ReportesDataService,
    private readonly exporter: ExportService,
  ) {}

  @Get('ventas')
  ventas(@Query() q: ReporteQueryDto, @Res() res: Response) {
    return this.entregar(() => this.data.ventasPorFecha(q), q, res);
  }

  @Get('citas')
  citas(@Query() q: ReporteQueryDto, @Res() res: Response) {
    return this.entregar(() => this.data.citasPorEstado(q), q, res);
  }

  @Get('comisiones')
  comisiones(@Query() q: ReporteQueryDto, @Res() res: Response) {
    return this.entregar(() => this.data.comisiones(q), q, res);
  }

  @Get('servicios-vendidos')
  serviciosVendidos(@Query() q: ReporteQueryDto, @Res() res: Response) {
    return this.entregar(() => this.data.serviciosProductosVendidos(q), q, res);
  }

  @Get('inventario')
  inventario(@Query() q: ReporteQueryDto, @Res() res: Response) {
    return this.entregar(() => this.data.inventario(q), q, res);
  }

  @Get('kardex')
  kardex(@Query() q: ReporteQueryDto, @Res() res: Response) {
    return this.entregar(() => this.data.kardex(q), q, res);
  }

  @Get('cuentas-por-cobrar')
  cxc(@Query() q: ReporteQueryDto, @Res() res: Response) {
    return this.entregar(() => this.data.cuentasPorCobrar(q), q, res);
  }

  @Get('flujo-caja')
  flujoCaja(@Query() q: ReporteQueryDto, @Res() res: Response) {
    return this.entregar(() => this.data.flujoCaja(q), q, res);
  }

  @Get('cortes-caja')
  cortesCaja(@Query() q: ReporteQueryDto, @Res() res: Response) {
    return this.entregar(() => this.data.cortesDeCaja(q), q, res);
  }

  @Get('agenda-diaria')
  agendaDiaria(@Query() q: ReporteQueryDto, @Res() res: Response) {
    return this.entregar(() => this.data.agendaDiaria(q), q, res);
  }

  /**
   * Obtiene el reporte y lo entrega en el formato solicitado.
   * json (default) responde el objeto; pdf/excel/csv responden el archivo.
   */
  private async entregar(
    obtener: () => Promise<ReporteTabular>,
    q: ReporteQueryDto,
    res: Response,
  ) {
    const reporte = await obtener();
    const formato = q.formato ?? 'json';

    if (formato === 'json') {
      return res.json(reporte);
    }

    let archivo: ArchivoExportado;
    if (formato === 'csv') archivo = this.exporter.toCsv(reporte);
    else if (formato === 'excel') archivo = await this.exporter.toExcel(reporte);
    else archivo = await this.exporter.toPdf(reporte);

    res.setHeader('Content-Type', archivo.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${archivo.filename}"`,
    );
    return res.send(archivo.buffer);
  }
}
