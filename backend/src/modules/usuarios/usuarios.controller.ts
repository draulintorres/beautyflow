import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import {
  CreateUsuarioDto,
  UpdateUsuarioDto,
  ResetUsuarioPasswordDto,
} from './dto/usuario.dto';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';

@Controller('usuarios')
@Roles('OWNER', 'ADMIN')
@Modulos('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  findAll() {
    return this.usuarios.findAll();
  }

  @Get('roles')
  getRoles() {
    return this.usuarios.getRoles();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usuarios.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUsuarioDto) {
    return this.usuarios.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUsuarioDto,
  ) {
    return this.usuarios.update(id, dto);
  }

  @Patch(':id/activar')
  @HttpCode(HttpStatus.OK)
  activar(@Param('id', ParseUUIDPipe) id: string) {
    return this.usuarios.activar(id);
  }

  @Patch(':id/desactivar')
  @HttpCode(HttpStatus.OK)
  desactivar(@Param('id', ParseUUIDPipe) id: string) {
    return this.usuarios.desactivar(id);
  }

  @Patch(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetUsuarioPasswordDto,
  ) {
    return this.usuarios.resetPassword(id, dto);
  }
}
