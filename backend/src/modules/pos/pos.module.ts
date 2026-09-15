import { Module } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { MetodosPagoService } from './metodos-pago.service';
import { CajaService } from './caja.service';
import { FacturaReciboService } from './factura-recibo.service';
import { VentasController } from './ventas.controller';
import {
  MetodosPagoController,
  CajaController,
} from './caja.controller';

@Module({
  controllers: [VentasController, MetodosPagoController, CajaController],
  providers: [VentasService, MetodosPagoService, CajaService, FacturaReciboService],
  exports: [VentasService],
})
export class PosModule {}
