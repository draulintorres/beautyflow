import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificacionesInternasService } from './notificaciones-internas.service';
import { RecordatorioMatutinoService } from './recordatorio-matutino.service';
import { AvisoPrevioCitaService } from './aviso-previo-cita.service';
import { CrearPruebaDto } from './dto/notificacion-interna.dto';
import { CurrentUser, Roles } from '../../core/auth/decorators/auth.decorators';

/**
 * Todos los endpoints (salvo el de prueba) operan exclusivamente sobre el
 * usuario autenticado: cada quien ve y marca solo lo suyo. No hay @Roles()
 * porque no es una cuestión de rol, es cuestión de destinatario del dato.
 */
@Controller('notificaciones-internas')
export class NotificacionesInternasController {
  constructor(
    private readonly service: NotificacionesInternasService,
    private readonly recordatorioMatutino: RecordatorioMatutinoService,
    private readonly avisoPrevioCita: AvisoPrevioCitaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  findAll(
    @CurrentUser('usuarioId') usuarioId: string,
    @Query('antes') antes?: string,
  ) {
    return this.service.findAllForUsuario(usuarioId, antes);
  }

  @Get('contador')
  contador(@CurrentUser('usuarioId') usuarioId: string) {
    return this.service.contarNoLeidas(usuarioId);
  }

  @Patch(':id/leer')
  async marcarLeida(
    @Param('id') id: string,
    @CurrentUser('usuarioId') usuarioId: string,
  ) {
    const { actualizadas } = await this.service.marcarLeida(id, usuarioId);
    if (actualizadas === 0) {
      // No revelamos si el id existe y es de otro usuario/empresa: 404 llano.
      throw new NotFoundException();
    }
    return { success: true };
  }

  @Patch('leer-todas')
  marcarTodasLeidas(@CurrentUser('usuarioId') usuarioId: string) {
    return this.service.marcarTodasLeidas(usuarioId);
  }

  // ---------- dev: solo para probar la campana antes del cron (Fase 2) ----------
  @Post('dev/prueba')
  @Roles('OWNER', 'ADMIN')
  async crearPrueba(
    @CurrentUser('usuarioId') usuarioId: string,
    @Body() dto: CrearPruebaDto,
  ) {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new ForbiddenException('No disponible en producción');
    }
    await this.service.crear({
      usuarioId,
      tipo: 'SISTEMA',
      titulo: dto.titulo ?? 'Notificación de prueba',
      cuerpo: dto.cuerpo ?? 'Esto es una notificación de prueba de la campana.',
    });
    return { success: true };
  }

  // ---------- dev: dispara el recordatorio matutino sin esperar el cron ----------
  @Post('dev/recordatorio-matutino')
  @Roles('OWNER', 'ADMIN')
  recordatorioMatutinoManual(@Query('forzar') forzar?: string) {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new ForbiddenException('No disponible en producción');
    }
    return this.recordatorioMatutino.ejecutarManual(forzar === 'true');
  }

  // ---------- dev: dispara el aviso previo de citas sin esperar el cron ----------
  @Post('dev/aviso-previo')
  @Roles('OWNER', 'ADMIN')
  avisoPrevioManual(
    @Query('ignorarVentana') ignorarVentana?: string,
    @Query('forzar') forzar?: string,
  ) {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new ForbiddenException('No disponible en producción');
    }
    return this.avisoPrevioCita.ejecutarManual({
      ignorarVentana: ignorarVentana === 'true',
      forzar: forzar === 'true',
    });
  }
}
