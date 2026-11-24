import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Header,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { SuperAdminService } from './superadmin.service';
import { SuperAdminBillingService } from './superadmin-billing.service';
import { SuperAdminTotpService } from './superadmin-totp.service';
import {
  SuperAdminLoginDto,
  ChallengeTokenDto,
  ConfirmarAltaDto,
  VerificarTotpDto,
  CrearEmpresaDto,
  EditarEmpresaDto,
  CrearPlanDto,
  UpdatePlanDto,
  CambiarPlanDto,
  ToggleModuloDto,
  RegistrarPagoSaaSDto,
} from './dto/superadmin.dto';
import { SuperAdminGuard, SaPublic } from './guards/superadmin.guard';
import { Public } from '../../core/auth/decorators/auth.decorators';
import { EmpresaStatus, FacturaSaaSStatus } from '@prisma/client';

@Controller('admin')
@Public() // exime de los guards internos de empleado
@UseGuards(SuperAdminGuard)
export class SuperAdminController {
  constructor(
    private readonly sa: SuperAdminService,
    private readonly billing: SuperAdminBillingService,
    private readonly totp: SuperAdminTotpService,
  ) {}

  // ---------- AUTH ----------
  @SaPublic()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: SuperAdminLoginDto, @Req() req: Request) {
    return this.sa.login(dto, req.ip ?? 'desconocida');
  }

  // Segundo paso: alta obligatoria del 2FA (si el admin no lo tiene activo).
  @SaPublic()
  @Post('login/totp/iniciar-alta')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  iniciarAltaTotp(@Body() dto: ChallengeTokenDto, @Req() req: Request) {
    return this.totp.iniciarAlta(dto.challengeToken, req.ip ?? 'desconocida');
  }

  @SaPublic()
  @Post('login/totp/confirmar-alta')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  confirmarAltaTotp(@Body() dto: ConfirmarAltaDto, @Req() req: Request) {
    return this.totp.confirmarAlta(dto.challengeToken, dto.codigo, req.ip ?? 'desconocida');
  }

  // Segundo paso: verificación normal (2FA ya activo).
  @SaPublic()
  @Post('login/verificar-totp')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  verificarTotp(@Body() dto: VerificarTotpDto, @Req() req: Request) {
    return this.totp.verificarTotp(dto.challengeToken, dto.codigo, dto.codigoRespaldo, req.ip ?? 'desconocida');
  }

  // ---------- DASHBOARD ----------
  @Get('dashboard')
  dashboard() {
    return this.billing.dashboard();
  }

  // ---------- EMPRESAS ----------
  @Get('empresas')
  listarEmpresas(@Query('estado') estado?: EmpresaStatus) {
    return this.sa.listarEmpresas({ estado });
  }

  @Post('empresas')
  crearEmpresa(@Body() dto: CrearEmpresaDto) {
    return this.sa.crearEmpresa(dto);
  }

  @Patch('empresas/:id')
  editarEmpresa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarEmpresaDto,
  ) {
    return this.sa.editarEmpresa(id, dto);
  }

  @Patch('empresas/:id/suspender')
  @HttpCode(HttpStatus.OK)
  suspender(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { motivo?: string },
  ) {
    return this.sa.suspenderEmpresa(id, body?.motivo);
  }

  @Patch('empresas/:id/reactivar')
  @HttpCode(HttpStatus.OK)
  reactivar(@Param('id', ParseUUIDPipe) id: string) {
    return this.sa.reactivarEmpresa(id);
  }

  @Delete('empresas/:id')
  @HttpCode(HttpStatus.OK)
  eliminar(@Param('id', ParseUUIDPipe) id: string) {
    return this.sa.eliminarEmpresa(id);
  }

  @Patch('empresas/:id/plan')
  @HttpCode(HttpStatus.OK)
  cambiarPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarPlanDto,
  ) {
    return this.sa.cambiarPlan(id, dto);
  }

  @Patch('empresas/:id/modulos')
  @HttpCode(HttpStatus.OK)
  toggleModulo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleModuloDto,
  ) {
    return this.sa.toggleModuloEmpresa(id, dto);
  }

  // ---------- PLANES ----------
  @Get('planes')
  listarPlanes() {
    return this.sa.listarPlanes();
  }

  @Post('planes')
  crearPlan(@Body() dto: CrearPlanDto) {
    return this.sa.crearPlan(dto);
  }

  @Patch('planes/:id')
  actualizarPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.sa.actualizarPlan(id, dto);
  }

  // ---------- FACTURACIÓN ----------
  @Get('facturas')
  listarFacturas(@Query('status') status?: FacturaSaaSStatus) {
    return this.billing.listarFacturas({ status });
  }

  @Post('facturas/generar-mes')
  @HttpCode(HttpStatus.OK)
  generarFacturas() {
    return this.billing.generarFacturasDelMes();
  }

  @Post('facturas/pagar')
  @HttpCode(HttpStatus.OK)
  registrarPago(@Body() dto: RegistrarPagoSaaSDto) {
    return this.billing.registrarPago(dto);
  }

  @Post('facturas/:id/recordatorio')
  @HttpCode(HttpStatus.OK)
  enviarRecordatorio(@Param('id', ParseUUIDPipe) id: string) {
    return this.billing.enviarRecordatorio(id);
  }

  // ---------- JOB: SUSPENSIÓN AUTOMÁTICA ----------
  @Post('jobs/suspender-morosas')
  @HttpCode(HttpStatus.OK)
  suspenderMorosas() {
    return this.billing.suspenderMorosas();
  }
}
