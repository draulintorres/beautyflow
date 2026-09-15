import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ServiciosService } from './servicios.service';
import { CreateServicioDto, UpdateServicioDto } from './dto/catalogo.dto';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';
import { Vertical } from '@prisma/client';

@Controller('servicios')
export class ServiciosController {
  constructor(private readonly servicios: ServiciosService) {}

  @Get()
  @Modulos('catalogo', 'pos', 'agenda')
  findAll(
    @Query('categoriaId') categoriaId?: string,
    @Query('vertical') vertical?: Vertical,
    @Query('activo') activo?: string,
  ) {
    return this.servicios.findAll({
      categoriaId,
      vertical,
      activo: activo === undefined ? undefined : activo === 'true',
    });
  }

  @Get(':id')
  @Modulos('catalogo', 'pos', 'agenda')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicios.findOne(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  create(@Body() dto: CreateServicioDto) {
    return this.servicios.create(dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServicioDto,
  ) {
    return this.servicios.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicios.remove(id);
  }
}
