import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CategoriasService } from './categorias.service';
import { CreateCategoriaDto, UpdateCategoriaDto } from './dto/catalogo.dto';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';

@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categorias: CategoriasService) {}

  @Get()
  @Modulos('catalogo', 'pos', 'agenda')
  findAll() {
    return this.categorias.findAll();
  }

  @Get(':id')
  @Modulos('catalogo', 'pos', 'agenda')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categorias.findOne(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  create(@Body() dto: CreateCategoriaDto) {
    return this.categorias.create(dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoriaDto,
  ) {
    return this.categorias.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categorias.remove(id);
  }
}
