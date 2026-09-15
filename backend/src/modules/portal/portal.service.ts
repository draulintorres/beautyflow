import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { getEmpresaId } from '../../core/tenant/tenant-context';
import { AgendaService } from '../agenda/agenda.service';
import { DisponibilidadService } from '../empleados/disponibilidad.service';
import { PortalReservarDto } from './dto/portal.dto';
import {
  VentaStatus,
  CitaStatus,
  MembresiaSuscripcionStatus,
  CitaOrigen,
} from '@prisma/client';
import { ENUM_TO_ESTADO_ES } from '../agenda/dto/cita.dto';

/**
 * Servicio del portal. TODOS los métodos reciben el clienteId del token
 * (nunca del body) y filtran estrictamente por él: un cliente jamás
 * puede acceder a datos de otro.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agenda: AgendaService,
    private readonly disponibilidad: DisponibilidadService,
  ) {}

  // ---------- DASHBOARD ----------
  async dashboard(clienteId: string) {
    const [cliente, proximaCita, gastoAgg, deudaAgg, membresia, puntos] =
      await Promise.all([
        this.prisma.db.cliente.findFirst({
          where: { id: clienteId },
          select: { nombre: true, apellido: true, limiteCredito: true },
        }),
        this.prisma.db.cita.findFirst({
          where: {
            clienteId,
            inicio: { gte: new Date() },
            estado: { in: [CitaStatus.SCHEDULED, CitaStatus.CONFIRMED] },
          },
          include: {
            empleado: { select: { nombre: true } },
            servicios: { include: { servicio: { select: { nombre: true } } } },
          },
          orderBy: { inicio: 'asc' },
        }),
        this.prisma.db.venta.aggregate({
          where: { clienteId, estado: { not: VentaStatus.ANULADA } },
          _sum: { total: true },
        }),
        this.prisma.db.venta.aggregate({
          where: {
            clienteId,
            estado: { in: [VentaStatus.PENDIENTE, VentaStatus.ABONO_PARCIAL] },
          },
          _sum: { saldo: true },
        }),
        this.prisma.db.membresiaSuscripcion.findFirst({
          where: { clienteId, estado: MembresiaSuscripcionStatus.ACTIVE },
          include: { membresia: { select: { nombre: true } } },
          orderBy: { vigenciaFin: 'desc' },
        }),
        this.prisma.db.puntosCliente.findFirst({
          where: { clienteId },
          select: { saldo: true },
        }),
      ]);

    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    return {
      nombre: `${cliente.nombre}${cliente.apellido ? ' ' + cliente.apellido : ''}`,
      proximaCita: proximaCita
        ? {
            id: proximaCita.id,
            fecha: proximaCita.inicio.toISOString().slice(0, 10),
            hora: this.hhmm(proximaCita.inicio),
            empleado: proximaCita.empleado?.nombre,
            servicios: proximaCita.servicios.map((s) => s.servicio?.nombre),
            estado: ENUM_TO_ESTADO_ES[proximaCita.estado as CitaStatus],
          }
        : null,
      totalGastado: Number(gastoAgg._sum.total ?? 0),
      puntos: puntos?.saldo ?? 0,
      membresiaActiva: membresia
        ? { nombre: membresia.membresia.nombre, vence: membresia.vigenciaFin }
        : null,
      balancePendiente: Number(deudaAgg._sum.saldo ?? 0),
      limiteCredito: Number(cliente.limiteCredito),
    };
  }

  // ---------- MIS CITAS ----------
  async misCitas(clienteId: string) {
    const citas = await this.prisma.db.cita.findMany({
      where: { clienteId },
      include: {
        empleado: { select: { nombre: true } },
        servicios: { include: { servicio: { select: { nombre: true } } } },
      },
      orderBy: { inicio: 'desc' },
    });
    return citas.map((c) => ({
      id: c.id,
      fecha: c.inicio.toISOString().slice(0, 10),
      hora: this.hhmm(c.inicio),
      empleado: c.empleado?.nombre,
      servicios: c.servicios.map((s) => s.servicio?.nombre),
      estado: ENUM_TO_ESTADO_ES[c.estado as CitaStatus],
      total: Number(c.total),
    }));
  }

  // ---------- MIS FACTURAS ----------
  async misFacturas(clienteId: string) {
    const ventas = await this.prisma.db.venta.findMany({
      where: { clienteId, estado: { not: VentaStatus.OPEN } },
      include: { detalles: true },
      orderBy: { createdAt: 'desc' },
    });
    return ventas.map((v) => ({
      factura: `F${String(v.numero).padStart(7, '0')}`,
      fecha: v.createdAt.toISOString().slice(0, 10),
      lineas: v.detalles.map((d) => ({
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        subtotal: Number(d.subtotal),
      })),
      total: Number(v.total),
      saldo: Number(v.saldo),
      estado: v.estado,
    }));
  }

  // ---------- MI CRÉDITO ----------
  async miCredito(clienteId: string) {
    const cliente = await this.prisma.db.cliente.findFirst({
      where: { id: clienteId },
      select: { limiteCredito: true },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const agg = await this.prisma.db.venta.aggregate({
      where: {
        clienteId,
        estado: { in: [VentaStatus.PENDIENTE, VentaStatus.ABONO_PARCIAL] },
      },
      _sum: { saldo: true },
    });
    const usado = Number(agg._sum.saldo ?? 0);
    const limite = Number(cliente.limiteCredito);
    return {
      limite,
      usado,
      disponible: Math.max(0, limite - usado),
    };
  }

  // ---------- MIS MEMBRESÍAS ----------
  async misMembresias(clienteId: string) {
    const subs = await this.prisma.db.membresiaSuscripcion.findMany({
      where: { clienteId },
      include: {
        membresia: { select: { nombre: true } },
        consumos: true,
      },
      orderBy: { vigenciaFin: 'desc' },
    });

    // Para cada suscripción, calcular beneficios de cantidad consumidos
    const resultado: any[] = [];
    for (const s of subs) {
      const beneficios = await this.prisma.db.membresiaBeneficio.findMany({
        where: { membresiaId: s.membresiaId },
        include: { servicio: { select: { nombre: true } } },
      });
      const detalleBeneficios = beneficios.map((b) => {
        const usados = s.consumos
          .filter((c) => c.beneficioId === b.id)
          .reduce((a, c) => a + c.cantidad, 0);
        return {
          descripcion: b.descripcion,
          tipo: b.tipo,
          cantidad: b.cantidad,
          usados,
          restantes: b.cantidad ? Math.max(0, b.cantidad - usados) : null,
          descuentoPct: b.descuentoPct ? Number(b.descuentoPct) : null,
        };
      });
      resultado.push({
        id: s.id,
        nombre: s.membresia.nombre,
        estado: s.estado,
        vence: s.vigenciaFin,
        beneficios: detalleBeneficios,
      });
    }
    return resultado;
  }

  // ---------- RESERVAR (flujo: servicio -> empleado -> fecha -> hora) ----------
  async serviciosDisponibles() {
    return this.prisma.db.servicio.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, precio: true, duracionMin: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async empleadosPorServicio(servicioId: string) {
    // EmpleadoServicio no tiene empresaId propio (no está en TENANT_MODELS),
    // así que filtrar solo por servicioId leería la fila de cualquier
    // empresa si alguien pasa un servicioId ajeno. Se valida la empresa a
    // través de la relación con Servicio (que sí la tiene).
    const especialistas = await this.prisma.db.empleadoServicio.findMany({
      where: { servicioId, servicio: { empresaId: getEmpresaId() } },
      include: { empleado: { select: { id: true, nombre: true, activo: true } } },
    });
    return especialistas
      .filter((e) => e.empleado?.activo)
      .map((e) => ({ id: e.empleado.id, nombre: e.empleado.nombre }));
  }

  async horasDisponibles(empleadoId: string, fecha: string) {
    return this.disponibilidad.getDisponibilidad(empleadoId, fecha);
  }

  async reservar(clienteId: string, dto: PortalReservarDto) {
    // Reutiliza la lógica del sistema interno (anti-solapamiento, cabinas, etc.)
    // El clienteId viene del token, nunca del body.
    return this.agenda.create({
      clienteId,
      empleadoId: dto.empleadoId,
      sucursalId: dto.sucursalId,
      fecha: dto.fecha,
      horaInicio: dto.horaInicio,
      servicios: dto.servicios,
      origen: CitaOrigen.APP,
      notas: dto.notas,
    });
  }

  // ---------- REAGENDAR / CANCELAR (solo citas propias) ----------
  async reagendar(clienteId: string, citaId: string, fecha: string, horaInicio: string) {
    await this.verificarPropiedad(clienteId, citaId);
    return this.agenda.reschedule(citaId, { fecha, horaInicio });
  }

  async cancelar(clienteId: string, citaId: string) {
    await this.verificarPropiedad(clienteId, citaId);
    return this.agenda.cancelar(citaId);
  }

  // ---------- seguridad ----------
  private async verificarPropiedad(clienteId: string, citaId: string) {
    const cita = await this.prisma.db.cita.findFirst({
      where: { id: citaId },
      select: { clienteId: true },
    });
    if (!cita) throw new NotFoundException('Cita no encontrada');
    if (cita.clienteId !== clienteId) {
      throw new ForbiddenException('No puedes modificar esta cita');
    }
  }

  private hhmm(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
