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
import { PaquetesService } from './paquetes.service';
import { CreatePaqueteDto, UpdatePaqueteDto } from './dto/catalogo.dto';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';

@Controller('paquetes')
export class PaquetesController {
  constructor(private readonly paquetes: PaquetesService) {}

  @Get()
  @Modulos('catalogo', 'pos', 'agenda')
  findAll() {
    return this.paquetes.findAll();
  }

  @Get(':id')
  @Modulos('catalogo', 'pos', 'agenda')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.paquetes.findOne(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  create(@Body() dto: CreatePaqueteDto) {
    return this.paquetes.create(dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaqueteDto,
  ) {
    return this.paquetes.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.paquetes.remove(id);
  }
}