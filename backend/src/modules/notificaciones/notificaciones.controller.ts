import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import {
  PlantillasService,
  NotificacionesJobsService,
} from './plantillas.service';
import { UpsertPlantillaDto, EnviarManualDto } from './dto/notificacion.dto';
import { Roles } from '../../core/auth/decorators/auth.decorators';
import { NotificacionStatus } from '@prisma/client';

@Controller('notificaciones')
export class NotificacionesController {
  constructor(
    private readonly notif: NotificationService,
    private readonly plantillas: PlantillasService,
    private readonly jobs: NotificacionesJobsService,
  ) {}

  // ---------- historial ----------
  @Get()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  findAll(
    @Query('clienteId') clienteId?: string,
    @Query('status') status?: NotificacionStatus,
  ) {
    return this.notif.findAll({ clienteId, status });
  }

  // ---------- plantillas ----------
  @Get('plantillas')
  @Roles('OWNER', 'ADMIN')
  getPlantillas() {
    return this.plantillas.findAll();
  }

  @Put('plantillas')
  @Roles('OWNER', 'ADMIN')
  upsertPlantilla(@Body() dto: UpsertPlantillaDto) {
    return this.plantillas.upsert(dto);
  }

  // ---------- envío manual ----------
  @Post('enviar')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  async enviarManual(@Body() dto: EnviarManualDto) {
    await this.notif.notificar({
      evento: dto.evento,
      canal: dto.canal,
      clienteId: dto.clienteId,
    });
    return { success: true };
  }

  // ---------- jobs (disparables por scheduler externo) ----------
  @Post('jobs/recordatorios-24h')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  recordatorios() {
    return this.jobs.recordatorios24h();
  }

  @Post('jobs/cumpleanos')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  cumpleanos() {
    return this.jobs.cumpleanos();
  }

  @Post('jobs/avisos-deuda')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  avisosDeuda() {
    return this.jobs.avisosDeuda();
  }
}
