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
import { CabinasService } from './cabinas.service';
import { CreateCabinaDto, UpdateCabinaDto } from './dto/cabina.dto';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';

@Controller('cabinas')
export class CabinasController {
  constructor(private readonly cabinas: CabinasService) {}

  @Get()
  @Modulos('agenda', 'equipo')
  findAll(@Query('sucursalId') sucursalId?: string) {
    return this.cabinas.findAll(sucursalId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  create(@Body() dto: CreateCabinaDto) {
    return this.cabinas.create(dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCabinaDto,
  ) {
    return this.cabinas.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.cabinas.remove(id);
  }
}
