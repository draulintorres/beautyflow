import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { tenantContext } from '../../core/tenant/tenant-context';
import { AgendaService } from '../agenda/agenda.service';
import { NotificacionesInternasService } from './notificaciones-internas.service';
import { EmpresaStatus, RoleKey } from '@prisma/client';

const ZONA_RD = 'America/Santo_Domingo';
const ESTADOS_ACTIVOS = new Set(['PENDIENTE', 'CONFIRMADA', 'EN_PROCESO']);
const ROLES_NEGOCIO = new Set<RoleKey>([RoleKey.OWNER, RoleKey.ADMIN, RoleKey.MANAGER]);

/** Hora actual en RD, sin depender de la zona horaria del proceso/servidor. */
function ahoraRD(): { fechaISO: string; minutosDelDia: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_RD,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const map = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return {
    fechaISO: `${map.year}-${map.month}-${map.day}`,
    minutosDelDia: Number(map.hour) * 60 + Number(map.minute),
  };
}

/**
 * Medianoche de `fechaISO` (YYYY-MM-DD) en RD, expresada como instante UTC.
 * RD no observa DST (offset fijo UTC-4), así que medianoche RD = 04:00 UTC
 * del mismo día calendario. Sirve para comparar `ultimoRecordatorioMatutino`
 * (un instante) contra "hoy" sin ambigüedad de zona horaria.
 */
function inicioDiaRDenUTC(fechaISO: string): Date {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 4, 0, 0, 0));
}

export interface ResultadoBarrido {
  fecha: string;
  ventana: number | null;
  procesadas: number;
  saltadas: number;
  fallidas: number;
}

/**
 * Emite el resumen matutino de agenda a la campana (notificaciones internas).
 *
 * Corre sin request HTTP (cron), así que NO hay contexto de tenant en
 * AsyncLocalStorage. Cada empresa se procesa dentro de su propio
 * `tenantContext.run(...)` para que `prisma.db` y `AgendaService.findByFecha`
 * (reutilizado, no reimplementado) apliquen el filtro de esa empresa. La
 * consulta de qué empresas son elegibles es la ÚNICA que cruza empresas a
 * propósito, y usa `prisma.db.empresa` sin problema porque `Empresa` no es
 * un modelo de tenant (no tiene empresaId) — no requiere contexto previo.
 */
@Injectable()
export class RecordatorioMatutinoService {
  private readonly logger = new Logger('RecordatorioMatutino');

  constructor(
    private readonly prisma: PrismaService,
    private readonly agenda: AgendaService,
    private readonly notifInternas: NotificacionesInternasService,
  ) {}

  @Cron('*/15 * * * *')
  async ejecutarBarrido(): Promise<ResultadoBarrido> {
    return this.correr({ respetarVentana: true, forzar: false });
  }

  /** Disparo manual para pruebas (endpoint dev). */
  async ejecutarManual(forzar: boolean): Promise<ResultadoBarrido> {
    return this.correr({ respetarVentana: false, forzar });
  }

  private async correr(opts: {
    respetarVentana: boolean;
    forzar: boolean;
  }): Promise<ResultadoBarrido> {
    const { fechaISO, minutosDelDia } = ahoraRD();
    const ventanaActual = Math.floor(minutosDelDia / 15) * 15;
    const inicioHoyUTC = inicioDiaRDenUTC(fechaISO);

    const empresas = await this.prisma.db.empresa.findMany({
      where: { estado: EmpresaStatus.ACTIVE },
      select: {
        id: true,
        horaRecordatorio: true,
        ultimoRecordatorioMatutino: true,
      },
    });

    let procesadas = 0;
    let saltadas = 0;
    let fallidas = 0;

    for (const empresa of empresas) {
      try {
        if (opts.respetarVentana) {
          const [hh, mm] = empresa.horaRecordatorio.split(':').map(Number);
          const ventanaConfigurada = Math.floor((hh * 60 + mm) / 15) * 15;
          if (ventanaConfigurada !== ventanaActual) continue;
        }

        const yaEnviadoHoy =
          !!empresa.ultimoRecordatorioMatutino &&
          empresa.ultimoRecordatorioMatutino >= inicioHoyUTC;
        if (yaEnviadoHoy && !opts.forzar) {
          saltadas++;
          continue;
        }

        await this.procesarEmpresa(empresa.id, fechaISO);
        procesadas++;
      } catch (err) {
        fallidas++;
        this.logger.error(
          `Error procesando recordatorio matutino de empresa ${empresa.id}`,
          (err as Error)?.message,
        );
      }
    }

    return {
      fecha: fechaISO,
      ventana: opts.respetarVentana ? ventanaActual : null,
      procesadas,
      saltadas,
      fallidas,
    };
  }

  private async procesarEmpresa(empresaId: string, fechaISO: string): Promise<void> {
    await tenantContext.run(
      { empresaId, usuarioId: 'cron', rol: RoleKey.OWNER },
      async () => {
        const citasHoy = (await this.agenda.findByFecha(fechaISO)).filter((c) =>
          ESTADOS_ACTIVOS.has(c.estado),
        );

        const conteoPorEmpleado = new Map<string, number>();
        for (const c of citasHoy) {
          if (!c.empleado?.id) continue;
          conteoPorEmpleado.set(
            c.empleado.id,
            (conteoPorEmpleado.get(c.empleado.id) ?? 0) + 1,
          );
        }
        const totalNegocio = citasHoy.length;

        const usuarios = await this.prisma.db.usuario.findMany({
          where: { activo: true },
          select: {
            id: true,
            rol: { select: { roleKey: true } },
            empleado: { select: { id: true } },
          },
        });

        for (const u of usuarios) {
          if (ROLES_NEGOCIO.has(u.rol.roleKey)) {
            const cuerpo =
              totalNegocio > 0
                ? `Hoy hay ${totalNegocio} citas agendadas en el negocio.`
                : 'No hay citas agendadas para hoy.';
            await this.notifInternas.crear({
              usuarioId: u.id,
              empresaId,
              tipo: 'AGENDA_RESUMEN',
              titulo: 'Resumen de hoy',
              cuerpo,
              referenciaTipo: 'agenda',
            });
          } else if (u.empleado?.id) {
            const misCitas = conteoPorEmpleado.get(u.empleado.id) ?? 0;
            if (misCitas === 0) continue; // silencio: sin citas, sin ruido
            await this.notifInternas.crear({
              usuarioId: u.id,
              empresaId,
              tipo: 'AGENDA_RESUMEN',
              titulo: 'Tus citas de hoy',
              cuerpo: `Tienes ${misCitas} cita${misCitas === 1 ? '' : 's'} hoy.`,
              referenciaTipo: 'agenda',
            });
          }
          // usuario sin rol de negocio y sin ficha de empleado (ej. cajero
          // sin citas asignadas): no tiene un resumen que tenga sentido, se omite.
        }

        await this.prisma.db.empresa.update({
          where: { id: empresaId },
          data: { ultimoRecordatorioMatutino: new Date() },
        });
      },
    );
  }
}
