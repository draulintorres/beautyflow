import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { tenantContext } from '../../core/tenant/tenant-context';
import { NotificacionesInternasService } from './notificaciones-internas.service';
import { EmpresaStatus, RoleKey, CitaStatus } from '@prisma/client';

/**
 * Cada 5 min: más fino que el matutino (Fase 2) porque aquí el margen de
 * error importa. El matutino es un resumen aproximado del día; este es un
 * aviso de "N minutos antes" — si llega a los 15 o a los 45 en vez de a
 * los 30, el aviso deja de ser útil para el empleado. Un intervalo más
 * fino acerca el momento real de envío al umbral configurado sin llegar
 * a ser tan frecuente que sature el cron.
 */
const INTERVALO_CRON_MIN = 5;
const ESTADOS_ELEGIBLES: CitaStatus[] = [CitaStatus.SCHEDULED, CitaStatus.CONFIRMED];

export interface ResultadoBarridoAviso {
  ahora: string;
  empresasProcesadas: number;
  avisosEnviados: number;
  citasPasadasDescartadas: number;
  fallidas: number;
}

/**
 * Avisa a la campana poco antes de que empiece cada cita.
 *
 * Alcance real de "Cambio 3" en esta implementación: `Cita.empleadoId` es
 * un campo REQUERIDO en el schema (no `String?`) y el wizard de "Nueva
 * Cita" del frontend exige elegir empleado para avanzar — no existe hoy
 * ningún camino para crear una cita sin empleado asignado. Por eso la rama
 * "alerta al dueño/recepción para cita sin asignar" de la spec original
 * NO se implementó (sería código muerto, imposible de disparar con datos
 * reales); se confirmó con el usuario y se aprobó omitirla. Solo se avisa
 * al usuario de sistema vinculado al empleado de la cita.
 */
@Injectable()
export class AvisoPrevioCitaService {
  private readonly logger = new Logger('AvisoPrevioCita');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifInternas: NotificacionesInternasService,
  ) {}

  @Cron(`*/${INTERVALO_CRON_MIN} * * * *`)
  async ejecutarBarrido(): Promise<ResultadoBarridoAviso> {
    return this.correr({ respetarVentana: true, forzar: false });
  }

  /** Disparo manual para pruebas (endpoint dev). */
  async ejecutarManual(opts: { ignorarVentana: boolean; forzar: boolean }): Promise<ResultadoBarridoAviso> {
    return this.correr({ respetarVentana: !opts.ignorarVentana, forzar: opts.forzar });
  }

  private async correr(opts: { respetarVentana: boolean; forzar: boolean }): Promise<ResultadoBarridoAviso> {
    const ahora = new Date();

    const empresas = await this.prisma.db.empresa.findMany({
      where: { estado: EmpresaStatus.ACTIVE },
      select: { id: true, minutosAvisoCita: true },
    });

    let avisosEnviados = 0;
    let citasPasadasDescartadas = 0;
    let fallidas = 0;

    for (const empresa of empresas) {
      try {
        const r = await this.procesarEmpresa(empresa.id, empresa.minutosAvisoCita, ahora, opts);
        avisosEnviados += r.avisos;
        citasPasadasDescartadas += r.descartadas;
      } catch (err) {
        fallidas++;
        this.logger.error(
          `Error procesando aviso previo de empresa ${empresa.id}`,
          (err as Error)?.message,
        );
      }
    }

    return {
      ahora: ahora.toISOString(),
      empresasProcesadas: empresas.length,
      avisosEnviados,
      citasPasadasDescartadas,
      fallidas,
    };
  }

  private async procesarEmpresa(
    empresaId: string,
    minutosAvisoCita: number,
    ahora: Date,
    opts: { respetarVentana: boolean; forzar: boolean },
  ): Promise<{ avisos: number; descartadas: number }> {
    return tenantContext.run(
      { empresaId, usuarioId: 'cron', rol: RoleKey.OWNER },
      async () => {
        // Citas cuyo inicio ya pasó y nunca se avisaron: el aviso "N min
        // antes" ya no tiene sentido si el cron estuvo caído o se retrasó.
        // Se marcan (sin notificar) para que no reaparezcan en corridas
        // futuras — decisión explícita de la Fase 3.
        const { count: descartadas } = await this.prisma.db.cita.updateMany({
          where: {
            estado: { in: ESTADOS_ELEGIBLES },
            avisoPrevioEnviadoAt: null,
            inicio: { lt: ahora },
          },
          data: { avisoPrevioEnviadoAt: ahora },
        });

        // Ventana normal (cron real): [ahora+minutosAvisoCita, ahora+minutosAvisoCita+5min).
        // Modo dev ignorarVentana: sin cota superior NI inferior atada a
        // minutosAvisoCita — toma cualquier cita futura elegible, para no
        // depender de que el dev cronometre la creación de datos de prueba
        // al segundo exacto en que corre el barrido.
        const inicioVentana = opts.respetarVentana
          ? new Date(ahora.getTime() + minutosAvisoCita * 60_000)
          : ahora;
        const finVentana = opts.respetarVentana
          ? new Date(inicioVentana.getTime() + INTERVALO_CRON_MIN * 60_000)
          : undefined;

        const citas = await this.prisma.db.cita.findMany({
          where: {
            estado: { in: ESTADOS_ELEGIBLES },
            ...(opts.forzar ? {} : { avisoPrevioEnviadoAt: null }),
            inicio: { gte: inicioVentana, ...(finVentana && { lt: finVentana }) },
          },
          include: {
            cliente: { select: { nombre: true } },
            empleado: { select: { id: true, usuarioId: true } },
            servicios: { include: { servicio: { select: { nombre: true } } } },
          },
        });

        let avisos = 0;
        for (const cita of citas) {
          try {
            if (cita.empleado.usuarioId) {
              const minutosReales = Math.max(
                0,
                Math.round((cita.inicio.getTime() - ahora.getTime()) / 60_000),
              );
              const servicios = cita.servicios.map((s) => s.servicio.nombre).join(' + ') || 'servicio';
              const hora = this.hhmm(cita.inicio);

              await this.notifInternas.crear({
                usuarioId: cita.empleado.usuarioId,
                empresaId,
                tipo: 'CITA_PROXIMA',
                titulo: 'Cita en breve',
                cuerpo: `En ${minutosReales} min: ${cita.cliente.nombre} — ${servicios} a las ${hora}.`,
                referenciaTipo: 'cita',
                referenciaId: cita.id,
              });
              avisos++;
            }
          } catch (err) {
            this.logger.error(
              `Error emitiendo aviso previo de la cita ${cita.id}`,
              (err as Error)?.message,
            );
          } finally {
            // Se marca SIEMPRE, incluso si no había usuario de sistema a
            // quién avisar o si la emisión falló: cierra el anti-duplicado
            // por cita y evita reintentar en bucle una cita problemática.
            await this.prisma.db.cita.update({
              where: { id: cita.id },
              data: { avisoPrevioEnviadoAt: ahora },
            });
          }
        }

        return { avisos, descartadas };
      },
    );
  }

  private hhmm(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
