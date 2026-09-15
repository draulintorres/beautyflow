import { Global, Module, Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { Roles, Modulos } from '../auth/decorators/auth.decorators';

@Controller('auditoria')
// Exclusivo del OWNER — mismo criterio que la sección Seguridad (PIN) de
// Ajustes. Ni ADMIN puede entrar aquí, aunque en el resto del sistema
// ADMIN suele espejar a OWNER. @Modulos('auditoria') es una segunda capa
// (gatea también por el sistema de módulos, útil si el frontend consulta
// user.modulos para decidir si muestra el link) — el guard real, el que
// de verdad bloquea el acceso pegándole directo a la API, es @Roles.
@Roles('OWNER')
@Modulos('auditoria')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** GET /auditoria?modulo=POS&accion=VOID&usuarioId=&desde=&hasta=&page=&pageSize= */
  @Get()
  listar(
    @Query('modulo') modulo?: string,
    @Query('accion') accion?: string,
    @Query('usuarioId') usuarioId?: string,
    @Query('entidad') entidad?: string,
    @Query('entidadId') entidadId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.audit.listar({
      modulo,
      accion,
      usuarioId,
      entidad,
      entidadId,
      desde,
      hasta,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
