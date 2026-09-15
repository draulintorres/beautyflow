import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { tenantContext } from '../../core/tenant/tenant-context';
import { NotificacionesInternasService } from '../notificaciones-internas/notificaciones-internas.service';
import {
  EmpresaStatus,
  RoleKey,
  TipoCuotaAlquiler,
  PeriodoRenta,
  EstadoDeudaAlquiler,
} from '@prisma/client';

const ZONA_RD = 'America/Santo_Domingo';
/** Hora RD (0-23) en la que se generan rentas — "a primera hora" del período. */
const HORA_OBJETIVO = 6;

interface AhoraRD {
  anio: number;
  mes: number; // 1-12
  dia: number; // 1-31
  diaSemana: number; // 0=dom .. 6=sab (Date.getDay())
  minutosDelDia: number;
}

/** "Ahora" en RD sin depender de la zona horaria del proceso/servidor. Mismo
 *  enfoque que RecordatorioMatutinoService (Intl + timeZone explícito). */
function ahoraRD(): AhoraRD {
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
  const anio = Number(map.year);
  const mes = Number(map.month);
  const dia = Number(map.day);
  // El día de la semana es una propiedad del calendario (y/m/d), no de un
  // instante: construir una fecha con esos mismos componentes y preguntar
  // getDay() da el resultado correcto sin importar la TZ del proceso.
  const diaSemana = new Date(anio, mes - 1, dia).getDay();
  return {
    anio,
    mes,
    dia,
    diaSemana,
    minutosDelDia: Number(map.hour) * 60 + Number(map.minute),
  };
}

/** Medianoche de (anio,mes,dia) en RD, como instante UTC. RD no observa
 *  DST (offset fijo UTC-4), así que medianoche RD = 04:00 UTC. */
function inicioDiaRDenUTC(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes - 1, dia, 4, 0, 0, 0));
}

/** Último instante de (anio,mes,dia) en RD (23:59:59.999 RD). */
function finDiaRDenUTC(anio: number, mes: number, dia: number): Date {
  const [ny, nm, nd] = sumarDiasCalendario(anio, mes, dia, 1);
  return new Date(inicioDiaRDenUTC(ny, nm, nd).getTime() - 1);
}

/** Aritmética de calendario pura (sin TZ): y/m/d + delta días. */
function sumarDiasCalendario(
  anio: number,
  mes: number,
  dia: number,
  delta: number,
): [number, number, number] {
  const d = new Date(Date.UTC(anio, mes - 1, dia + delta));
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

function ultimoDiaDeMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

const NOMBRES_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

interface PeriodoCalculado {
  periodoIni: Date;
  periodoFin: Date;
  concepto: string;
}

export interface ResultadoBarridoRenta {
  fecha: string;
  generoSemanal: boolean;
  generoMensual: boolean;
  empresasProcesadas: number;
  deudasCreadas: number;
  deudasSalteadas: number;
  empresasFallidas: number;
}

/**
 * Alquiler de silla (Fase B2, Pieza 2c): genera la deuda de RENTA fija de
 * inquilinos con tipoCuota=RENTA_PERIODO, por adelantado al inicio de cada
 * período (lunes para SEMANAL, día 1 para MENSUAL). Excluyente con
 * POR_SERVICIO (2a/2b) — ese caso genera deuda por venta, no por cron; los
 * dos jamás se cruzan porque tipoCuota es un solo enum por inquilino.
 *
 * Reutiliza el patrón de RecordatorioMatutinoService: cron sin request HTTP
 * (sin tenant context ambiental), así que cada empresa se procesa dentro de
 * su propio `tenantContext.run(...)`. El aislamiento lo da ESE run, no un
 * empresaId suelto pasado a mano.
 */
@Injectable()
export class RentaAlquilerService {
  private readonly logger = new Logger('RentaAlquiler');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifInternas: NotificacionesInternasService,
  ) {}

  /**
   * Cada hora en punto. La renta no es urgente al minuto (a diferencia de un
   * aviso de cita) y el anti-duplicado por período la hace segura de
   * re-disparar: si por cualquier motivo el proceso estuvo caído durante la
   * ventana objetivo (6-7am RD del lunes o día 1), la próxima corrida
   * horaria simplemente ya no cae en la ventana y no genera nada tarde con
   * fecha equivocada — se prefiere no generar a generar con un período mal
   * calculado. Un intervalo más corto (cada 15 min, como el matutino) no
   * aporta nada aquí porque no hay una hora exacta configurable por empresa
   * que perseguir.
   */
  @Cron('0 * * * *')
  async ejecutarBarridoCron(): Promise<ResultadoBarridoRenta> {
    return this.correr({ respetarHorario: true, forzar: false });
  }

  /** Disparo manual para pruebas (endpoint dev) — ignora día/hora. */
  async ejecutarManual(forzar: boolean): Promise<ResultadoBarridoRenta> {
    return this.correr({ respetarHorario: false, forzar });
  }

  private async correr(opts: {
    respetarHorario: boolean;
    forzar: boolean;
  }): Promise<ResultadoBarridoRenta> {
    const ahora = ahoraRD();
    const enHoraObjetivo = Math.floor(ahora.minutosDelDia / 60) === HORA_OBJETIVO;
    const esLunes = ahora.diaSemana === 1;
    const esDiaUno = ahora.dia === 1;

    const generoSemanal = opts.respetarHorario ? esLunes && enHoraObjetivo : true;
    const generoMensual = opts.respetarHorario ? esDiaUno && enHoraObjetivo : true;

    const fecha = `${ahora.anio}-${pad2(ahora.mes)}-${pad2(ahora.dia)}`;

    if (!generoSemanal && !generoMensual) {
      return {
        fecha,
        generoSemanal: false,
        generoMensual: false,
        empresasProcesadas: 0,
        deudasCreadas: 0,
        deudasSalteadas: 0,
        empresasFallidas: 0,
      };
    }

    const periodos: PeriodoRenta[] = [];
    if (generoSemanal) periodos.push(PeriodoRenta.SEMANAL);
    if (generoMensual) periodos.push(PeriodoRenta.MENSUAL);

    const empresas = await this.prisma.db.empresa.findMany({
      where: { estado: EmpresaStatus.ACTIVE },
      select: { id: true },
    });

    let empresasProcesadas = 0;
    let deudasCreadas = 0;
    let deudasSalteadas = 0;
    let empresasFallidas = 0;

    for (const empresa of empresas) {
      try {
        await tenantContext.run(
          { empresaId: empresa.id, usuarioId: 'cron', rol: RoleKey.OWNER },
          async () => {
            for (const periodo of periodos) {
              const { creadas, salteadas } = await this.generarParaPeriodo(
                empresa.id,
                periodo,
                ahora,
                opts.forzar,
              );
              deudasCreadas += creadas;
              deudasSalteadas += salteadas;
            }
          },
        );
        empresasProcesadas++;
      } catch (err) {
        empresasFallidas++;
        this.logger.error(
          `Error generando renta para empresa ${empresa.id}`,
          (err as Error)?.message,
        );
      }
    }

    return {
      fecha,
      generoSemanal,
      generoMensual,
      empresasProcesadas,
      deudasCreadas,
      deudasSalteadas,
      empresasFallidas,
    };
  }

  private async generarParaPeriodo(
    empresaId: string,
    periodo: PeriodoRenta,
    ahora: AhoraRD,
    forzar: boolean,
  ): Promise<{ creadas: number; salteadas: number }> {
    const { periodoIni, periodoFin, concepto } = this.calcularPeriodo(periodo, ahora);

    const configs = await this.prisma.db.alquilerConfig.findMany({
      where: {
        activo: true,
        tipoCuota: TipoCuotaAlquiler.RENTA_PERIODO,
        periodoRenta: periodo,
      },
      select: { empleadoId: true, montoRenta: true },
    });

    let creadas = 0;
    let salteadas = 0;

    for (const cfg of configs) {
      if (!cfg.montoRenta) continue;

      // Anti-duplicado (Cambio 1, opción b): la propia DeudaAlquiler es la
      // fuente de verdad — si ya existe una de renta para este inquilino y
      // este período exacto, no se regenera. Sin campo nuevo ni migración.
      const existente = await this.prisma.db.deudaAlquiler.findFirst({
        where: { empleadoId: cfg.empleadoId, referenciaTipo: 'renta', periodoIni },
        select: { id: true },
      });
      if (existente && !forzar) {
        salteadas++;
        continue;
      }

      await this.prisma.db.deudaAlquiler.create({
        data: {
          empresaId,
          empleadoId: cfg.empleadoId,
          concepto,
          montoTotal: cfg.montoRenta,
          montoPagado: 0,
          saldo: cfg.montoRenta,
          estado: EstadoDeudaAlquiler.PENDIENTE,
          referenciaTipo: 'renta',
          periodoIni,
          periodoFin,
        },
      });
      creadas++;

      await this.notificarInquilino(empresaId, cfg.empleadoId, concepto, Number(cfg.montoRenta));
    }

    return { creadas, salteadas };
  }

  /** Cambio 4: aviso en la campana del inquilino, si tiene cuenta. Best
   *  -effort — NotificacionesInternasService.crear() ya nunca lanza. */
  private async notificarInquilino(
    empresaId: string,
    empleadoId: string,
    concepto: string,
    monto: number,
  ): Promise<void> {
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id: empleadoId },
      select: { usuarioId: true },
    });
    if (!empleado?.usuarioId) return;

    await this.notifInternas.crear({
      usuarioId: empleado.usuarioId,
      empresaId,
      tipo: 'RENTA_ALQUILER_GENERADA',
      titulo: 'Se generó tu renta',
      cuerpo: `Se generó tu ${concepto.toLowerCase()}: RD$${monto.toFixed(2)}`,
      referenciaTipo: 'renta',
    });
  }

  private calcularPeriodo(periodo: PeriodoRenta, ahora: AhoraRD): PeriodoCalculado {
    if (periodo === PeriodoRenta.SEMANAL) {
      // Lunes de la semana actual de "ahora" — se recalcula hacia atrás en
      // vez de asumir que "hoy" ya es lunes, para que el disparo manual/dev
      // (que ignora día/hora) resuelva el MISMO período sin importar qué
      // día de la semana se ejecute, y el anti-duplicado siga siendo
      // consistente.
      const diasDesdeLunes = (ahora.diaSemana + 6) % 7; // lun=0 ... dom=6
      const [lunY, lunM, lunD] = sumarDiasCalendario(
        ahora.anio, ahora.mes, ahora.dia, -diasDesdeLunes,
      );
      const periodoIni = inicioDiaRDenUTC(lunY, lunM, lunD);
      const [domY, domM, domD] = sumarDiasCalendario(lunY, lunM, lunD, 6);
      const periodoFin = finDiaRDenUTC(domY, domM, domD);
      const concepto = `Renta semanal ${pad2(lunD)}/${pad2(lunM)}–${pad2(domD)}/${pad2(domM)}`;
      return { periodoIni, periodoFin, concepto };
    }

    // MENSUAL: día 1 del mes actual de "ahora" (día-independiente: siempre
    // es el mes de "ahora", sin importar qué día del mes se dispare).
    const periodoIni = inicioDiaRDenUTC(ahora.anio, ahora.mes, 1);
    const periodoFin = finDiaRDenUTC(ahora.anio, ahora.mes, ultimoDiaDeMes(ahora.anio, ahora.mes));
    const concepto = `Renta mensual ${NOMBRES_MES[ahora.mes - 1]} ${ahora.anio}`;
    return { periodoIni, periodoFin, concepto };
  }
}
