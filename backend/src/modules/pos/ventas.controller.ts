import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { VentasService } from './ventas.service';
import { FacturaReciboService } from './factura-recibo.service';
import { CreateVentaDto, AbonoDeudaDto, AnularVentaDto } from './dto/pos.dto';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';
import { VentaStatus } from '@prisma/client';

// Mapeo de estado en español (query) al enum
const ESTADO_QUERY: Record<string, VentaStatus> = {
  BORRADOR: VentaStatus.OPEN,
  PAGADA: VentaStatus.PAGADA,
  PARCIAL: VentaStatus.ABONO_PARCIAL,
  PENDIENTE: VentaStatus.PENDIENTE,
  ANULADA: VentaStatus.ANULADA,
};

@Controller('facturas')
export class VentasController {
  constructor(
    private readonly ventas: VentasService,
    private readonly recibos: FacturaReciboService,
  ) {}

  /** GET /facturas?fecha=YYYY-MM-DD&estado=PENDIENTE[&empleadoId=] */
  @Get()
  @Modulos('pos', 'cobros')
  findAll(
    @Query('fecha') fecha?: string,
    @Query('estado') estado?: string,
    @Query('empleadoId') empleadoId?: string,
  ) {
    return this.ventas.findAll({
      fecha,
      estado: estado ? ESTADO_QUERY[estado] : undefined,
      empleadoId,
    });
  }

  @Get(':id')
  @Modulos('pos', 'cobros')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ventas.findOne(id);
  }

  /** Descargar recibo de venta en PDF */
  @Get(':id/recibo')
  @Modulos('pos', 'cobros')
  async reciboVenta(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.recibos.generateVentaRecibo(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="recibo-venta-${id.slice(0, 8)}.pdf"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** Descargar recibo de pago/abono en PDF */
  @Get(':id/recibo-abono/:pagoId')
  @Modulos('pos', 'cobros')
  async reciboAbono(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pagoId', ParseUUIDPipe) pagoId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.recibos.generateAbonoRecibo(id, pagoId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="recibo-pago-${pagoId.slice(0, 8)}.pdf"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** Venta directa (rápida). ALQUILER: un inquilino se autofactura (Pieza 3). */
  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'ALQUILER')
  create(@Body() dto: CreateVentaDto) {
    return this.ventas.create(dto);
  }

  /** Venta desde una cita */
  @Post('from-cita/:citaId')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER')
  createFromCita(@Param('citaId', ParseUUIDPipe) citaId: string) {
    return this.ventas.createFromCita(citaId);
  }

  /** Registrar abono a una factura con saldo pendiente (fiao) */
  @Post(':id/abono')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER')
  @HttpCode(HttpStatus.OK)
  abono(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AbonoDeudaDto,
  ) {
    return this.ventas.registrarAbono(id, dto);
  }

  /** Anular factura (revierte inventario, crédito, comisiones y cita ligada) */
  @Patch(':id/anular')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  anular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnularVentaDto,
  ) {
    return this.ventas.anular(id, dto.motivo, dto.pin);
  }
}