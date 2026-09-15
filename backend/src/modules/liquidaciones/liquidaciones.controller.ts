import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { LiquidacionesService } from './liquidaciones.service';
import { LiquidacionesPdfService } from './liquidaciones-pdf.service';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';
import { PreviewQueryDto, CerrarCorteDto, ListarQueryDto } from './dto/liquidacion.dto';

@Controller('liquidaciones')
@Roles('OWNER', 'ADMIN')
@Modulos('comisiones')
export class LiquidacionesController {
  constructor(
    private readonly service: LiquidacionesService,
    private readonly pdf: LiquidacionesPdfService,
  ) {}

  @Get('preview')
  preview(@Query() q: PreviewQueryDto) {
    return this.service.preview(q);
  }

  @Post()
  cerrar(@Body() dto: CerrarCorteDto) {
    return this.service.cerrarCorte(dto);
  }

  @Get()
  listar(@Query() q: ListarQueryDto) {
    return this.service.listar(q);
  }

  @Get(':id/comprobante')
  async comprobante(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.pdf.generateComprobante(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="comprobante-comision-${id.slice(0,8)}.pdf"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detalle(id);
  }

  @Patch(':id/pagar')
  pagar(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.pagar(id);
  }

  @Patch(':id/anular')
  anular(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.anular(id);
  }
}