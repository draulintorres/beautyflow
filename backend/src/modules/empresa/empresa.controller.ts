import { Controller, Get, Patch, Body } from '@nestjs/common';
import { EmpresaService } from './empresa.service';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { Roles, Modulos } from '../../core/auth/decorators/auth.decorators';

@Controller('empresa')
export class EmpresaController {
  constructor(private readonly empresa: EmpresaService) {}

  @Get()
  @Modulos('sucursales', 'equipo', 'usuarios')
  getOwn() {
    return this.empresa.findOwn();
  }

  @Patch()
  @Roles('OWNER', 'ADMIN')
  updateOwn(@Body() dto: UpdateEmpresaDto) {
    return this.empresa.updateOwn(dto);
  }
}
