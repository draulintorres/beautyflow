import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RefreshDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  LogoutDto,
  WebauthnVerifyRegistrationDto,
  WebauthnLoginOptionsDto,
  WebauthnLoginVerifyDto,
} from './dto/auth.dto';
import { Public, CurrentUser } from './decorators/auth.decorators';
import { TenantStore } from '../tenant/tenant-context';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.empresaSlug, dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.empresaSlug, dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: LogoutDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: TenantStore) {
    return this.auth.me(user.usuarioId);
  }

  // ---------- WebAuthn: activar en este dispositivo (requiere sesión) ----------

  @Post('webauthn/register/options')
  @HttpCode(HttpStatus.OK)
  webauthnRegisterOptions(@CurrentUser() user: TenantStore) {
    return this.auth.webauthnRegisterOptions(user.usuarioId);
  }

  @Post('webauthn/register/verify')
  @HttpCode(HttpStatus.OK)
  webauthnRegisterVerify(
    @CurrentUser() user: TenantStore,
    @Body() dto: WebauthnVerifyRegistrationDto,
  ) {
    return this.auth.webauthnRegisterVerify(
      user.usuarioId,
      user.empresaId,
      dto.response as any,
      dto.deviceLabel,
    );
  }

  @Get('webauthn/devices')
  webauthnListDevices(@CurrentUser() user: TenantStore) {
    return this.auth.webauthnListDevices(user.usuarioId);
  }

  @Post('webauthn/devices/:id/revoke')
  @HttpCode(HttpStatus.OK)
  webauthnRevokeDevice(
    @CurrentUser() user: TenantStore,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.auth.webauthnRevokeDevice(user.usuarioId, id);
  }

  // ---------- WebAuthn: entrar con huella (sin sesión todavía) ----------

  @Public()
  @Post('webauthn/login/options')
  @HttpCode(HttpStatus.OK)
  webauthnLoginOptions(@Body() dto: WebauthnLoginOptionsDto) {
    return this.auth.webauthnLoginOptions(dto.credentialId);
  }

  @Public()
  @Post('webauthn/login/verify')
  @HttpCode(HttpStatus.OK)
  webauthnLoginVerify(@Body() dto: WebauthnLoginVerifyDto) {
    return this.auth.webauthnLoginVerify(dto.credentialId, dto.response as any);
  }
}
