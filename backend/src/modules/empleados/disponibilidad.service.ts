import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CitaStatus } from '@prisma/client';
import { diaSemanaRD, rangoDiaRD } from '../../core/common/fecha-rd.util';

export interface Intervalo {
  inicio: string; // "HH:mm"
  fin: string; // "HH:mm"
}

export interface DisponibilidadResult {
  fecha: string;
  trabaja: boolean;
  horaInicio: string | null;
  horaFin: string | null;
  ocupado: Intervalo[];
  disponible: Intervalo[];
}

/**
 * Calcula la disponibilidad de un empleado en una fecha:
 *   disponible = horario laboral − (citas activas + bloqueos)
 *
 * Servicio reutilizable: la Agenda y el POS lo usan para validar
 * solapamientos y mostrar huecos. Toda la aritmética se hace en
 * minutos desde medianoche para evitar errores de zona horaria.
 */
@Injectable()
export class DisponibilidadService {
  constructor(private readonly prisma: PrismaService) {}

  async getDisponibilidad(
    empleadoId: string,
    fecha: string, // "YYYY-MM-DD"
    excluirCitaId?: string,
  ): Promise<DisponibilidadResult> {
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id: empleadoId },
      select: {
        id: true,
        enVacaciones: true,
        participaAgenda: true,
        esCuentaDueno: true,
      },
    });
    if (!empleado) throw new NotFoundException('Empleado no encontrado');

    const diaSemana = diaSemanaRD(fecha); // 0=dom..6=sab

    // 1. Horario laboral del día
    const horario = await this.prisma.empleadoHorario.findFirst({
      where: { empleadoId, diaSemana, activo: true },
    });

    // El dueño (esCuentaDueno) no tiene por qué configurar un horario
    // formal solo para poder agendarse citas a sí mismo — se asume
    // disponible todo el día si no configuró uno (igual puede configurarlo
    // desde Equipo, como cualquier empleado, para acotarlo). Sus citas y
    // bloqueos reales de ese día SÍ se siguen respetando más abajo, así
    // que esto no permite que se doble-agende.
    const duenoSinHorario = !horario && empleado.esCuentaDueno;

    if (
      (!horario && !duenoSinHorario) ||
      empleado.enVacaciones ||
      !empleado.participaAgenda
    ) {
      return {
        fecha,
        trabaja: false,
        horaInicio: null,
        horaFin: null,
        ocupado: [],
        disponible: [],
      };
    }

    const jornadaIni = duenoSinHorario ? 0 : this.toMin(horario!.horaInicio);
    const jornadaFin = duenoSinHorario ? 23 * 60 + 59 : this.toMin(horario!.horaFin);

    // 2. Rango del día en timestamps para consultar citas y bloqueos
    const { inicio: dayStart, fin: dayEnd } = rangoDiaRD(fecha);

    // 3. Citas activas (no canceladas ni no-show)
    const citas = await this.prisma.db.cita.findMany({
      where: {
        empleadoId,
        ...(excluirCitaId ? { id: { not: excluirCitaId } } : {}),
        inicio: { gte: dayStart, lte: dayEnd },
        estado: {
          in: [
            CitaStatus.SCHEDULED,
            CitaStatus.CONFIRMED,
            CitaStatus.IN_PROGRESS,
            CitaStatus.COMPLETED,
          ],
        },
      },
      select: { inicio: true, fin: true },
    });

    // 4. Bloqueos del día (puntuales + recurrentes de ese día de semana)
    const bloqueos = await this.prisma.db.bloqueoHorario.findMany({
      where: {
        empleadoId,
        OR: [
          { recurrente: false, inicio: { gte: dayStart, lte: dayEnd } },
          { recurrente: true, diaSemana },
        ],
      },
      select: { inicio: true, fin: true, recurrente: true },
    });

    // 5. Consolidar intervalos ocupados (en minutos)
    const ocupadoRaw: Array<[number, number]> = [];
    for (const c of citas) {
      ocupadoRaw.push([this.dateToMin(c.inicio), this.dateToMin(c.fin)]);
    }
    for (const b of bloqueos) {
      // Para recurrentes, usar solo la hora (el día ya coincide por filtro)
      ocupadoRaw.push([this.dateToMin(b.inicio), this.dateToMin(b.fin)]);
    }

    const ocupadoMerged = this.mergeIntervals(ocupadoRaw)
      // recortar a la jornada
      .map(([a, b]): [number, number] => [
        Math.max(a, jornadaIni),
        Math.min(b, jornadaFin),
      ])
      .filter(([a, b]) => b > a);

    // 6. Calcular huecos disponibles
    const disponibleMin = this.invertIntervals(
      ocupadoMerged,
      jornadaIni,
      jornadaFin,
    );

    return {
      fecha,
      trabaja: true,
      horaInicio: this.toHHMM(jornadaIni),
      horaFin: this.toHHMM(jornadaFin),
      ocupado: ocupadoMerged.map(([a, b]) => ({
        inicio: this.toHHMM(a),
        fin: this.toHHMM(b),
      })),
      disponible: disponibleMin.map(([a, b]) => ({
        inicio: this.toHHMM(a),
        fin: this.toHHMM(b),
      })),
    };
  }

  /**
   * Verifica si un intervalo [inicio, fin) cabe en la disponibilidad
   * del empleado. Usado por la Agenda/POS para el anti-solapamiento.
   */
  async estaDisponible(
    empleadoId: string,
    inicio: Date,
    fin: Date,
    excluirCitaId?: string,
  ): Promise<boolean> {
    const fecha = inicio.toISOString().slice(0, 10);
    const disp = await this.getDisponibilidad(empleadoId, fecha, excluirCitaId);
    if (!disp.trabaja) return false;

    const ini = this.dateToMin(inicio);
    const end = this.dateToMin(fin);

    return disp.disponible.some(
      (slot) => this.toMin(slot.inicio) <= ini && this.toMin(slot.fin) >= end,
    );
  }

  /**
   * Devuelve una cabina libre en el rango dado dentro de la sucursal,
   * o null si todas están ocupadas. Usado cuando un servicio requiere cabina.
   */
  async findCabinaLibre(
    sucursalId: string,
    inicio: Date,
    fin: Date,
    excluirCitaId?: string,
  ): Promise<string | null> {
    const cabinas = await this.prisma.db.cabina.findMany({
      where: { sucursalId, activa: true },
      select: { id: true },
    });
    if (cabinas.length === 0) return null;

    for (const cabina of cabinas) {
      const ocupada = await this.prisma.db.cita.findFirst({
        where: {
          cabinaId: cabina.id,
          ...(excluirCitaId ? { id: { not: excluirCitaId } } : {}),
          estado: {
            in: [
              CitaStatus.SCHEDULED,
              CitaStatus.CONFIRMED,
              CitaStatus.IN_PROGRESS,
              CitaStatus.COMPLETED,
            ],
          },
          // Solapamiento: inicio < fin_nuevo AND fin > inicio_nuevo
          inicio: { lt: fin },
          fin: { gt: inicio },
        },
        select: { id: true },
      });
      if (!ocupada) return cabina.id;
    }
    return null;
  }

  // ---------- helpers de tiempo ----------
  private toMin(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  private toHHMM(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private dateToMin(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
  }

  /** Une intervalos solapados/contiguos. Entrada: [[ini,fin],...] */
  private mergeIntervals(
    intervals: Array<[number, number]>,
  ): Array<[number, number]> {
    if (intervals.length === 0) return [];
    const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1];
      const cur = sorted[i];
      if (cur[0] <= last[1]) {
        last[1] = Math.max(last[1], cur[1]);
      } else {
        merged.push(cur);
      }
    }
    return merged;
  }

  /** Calcula los huecos libres entre [ini, fin) dados los intervalos ocupados. */
  private invertIntervals(
    ocupado: Array<[number, number]>,
    ini: number,
    fin: number,
  ): Array<[number, number]> {
    const libres: Array<[number, number]> = [];
    let cursor = ini;
    for (const [a, b] of ocupado) {
      if (a > cursor) libres.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < fin) libres.push([cursor, fin]);
    return libres;
  }
}
