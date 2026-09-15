import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { PortalAuthService } from './portal-auth.service';
import { PortalService } from './portal.service';
import {
  SolicitarOtpDto,
  VerificarOtpDto,
  PortalRefreshDto,
  PortalReservarDto,
} from './dto/portal.dto';
import {
  PortalAuthGuard,
  PortalPublic,
  CurrentCliente,
} from './guards/portal-auth.guard';
import { Public } from '../../core/auth/decorators/auth.decorators';

interface PortalCliente {
  clienteId: string;
  empresaId: string;
}

/**
 * Portal del cliente. Usa PortalAuthGuard (no los guards internos de empleados).
 * Todas las rutas de datos operan sobre el clienteId del token.
 */
@Controller('portal')
@Public()
@UseGuards(PortalAuthGuard)
export class PortalController {
  constructor(
    private readonly auth: PortalAuthService,
    private readonly portal: PortalService,
  ) {}

  // ---------- AUTH (público) ----------
  @PortalPublic()
  @Post('auth/solicitar-otp')
  @HttpCode(HttpStatus.OK)
  solicitarOtp(@Body() dto: SolicitarOtpDto) {
    return this.auth.solicitarOtp(dto);
  }

  @PortalPublic()
  @Post('auth/verificar-otp')
  @HttpCode(HttpStatus.OK)
  verificarOtp(@Body() dto: VerificarOtpDto) {
    return this.auth.verificarOtp(dto);
  }

  @PortalPublic()
  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: PortalRefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  // ---------- DASHBOARD ----------
  @Get('dashboard')
  dashboard(@CurrentCliente() c: PortalCliente) {
    return this.portal.dashboard(c.clienteId);
  }

  // ---------- DATOS DEL CLIENTE ----------
  @Get('mis-citas')
  misCitas(@CurrentCliente() c: PortalCliente) {
    return this.portal.misCitas(c.clienteId);
  }

  @Get('mis-facturas')
  misFacturas(@CurrentCliente() c: PortalCliente) {
    return this.portal.misFacturas(c.clienteId);
  }

  @Get('mi-credito')
  miCredito(@CurrentCliente() c: PortalCliente) {
    return this.portal.miCredito(c.clienteId);
  }

  @Get('mis-membresias')
  misMembresias(@CurrentCliente() c: PortalCliente) {
    return this.portal.misMembresias(c.clienteId);
  }

  // ---------- RESERVAR (flujo guiado) ----------
  @Get('servicios')
  servicios() {
    return this.portal.serviciosDisponibles();
  }

  @Get('servicios/:servicioId/empleados')
  empleados(@Param('servicioId', ParseUUIDPipe) servicioId: string) {
    return this.portal.empleadosPorServicio(servicioId);
  }

  @Get('empleados/:empleadoId/horas')
  horas(
    @Param('empleadoId', ParseUUIDPipe) empleadoId: string,
    @Query('fecha') fecha: string,
  ) {
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException('Parámetro "fecha" requerido (YYYY-MM-DD)');
    }
    return this.portal.horasDisponibles(empleadoId, fecha);
  }

  @Post('citas')
  reservar(
    @CurrentCliente() c: PortalCliente,
    @Body() dto: PortalReservarDto,
  ) {
    return this.portal.reservar(c.clienteId, dto);
  }

  @Patch('citas/:id/reagendar')
  @HttpCode(HttpStatus.OK)
  reagendar(
    @CurrentCliente() c: PortalCliente,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { fecha: string; horaInicio: string },
  ) {
    return this.portal.reagendar(c.clienteId, id, body.fecha, body.horaInicio);
  }

  @Patch('citas/:id/cancelar')
  @HttpCode(HttpStatus.OK)
  cancelar(
    @CurrentCliente() c: PortalCliente,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.portal.cancelar(c.clienteId, id);
  }
}
