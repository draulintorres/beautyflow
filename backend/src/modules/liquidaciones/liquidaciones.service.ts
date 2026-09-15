import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { VentaStatus, LineaTipo, ModeloPago } from '@prisma/client';
import { getEmpresaId, getCurrentUser } from '../../core/tenant/tenant-context';
import { SucursalScopeService } from '../../core/tenant/sucursal-scope.service';
import { AuditService } from '../../core/audit/audit.service';
import {
  PreviewQueryDto,
  CerrarCorteDto,
  ListarQueryDto,
} from './dto/liquidacion.dto';

@Injectable()
export class LiquidacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sucursalScope: SucursalScopeService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Sucursal efectiva: un ADMIN aislado (asignado a una sucursal) solo
   * liquida/ve comisiones de esa sucursal, ignora lo que pida el query. El
   * OWNER usa lo del query (o ninguna = todas).
   */
  private async sucursalEfectiva(pedida?: string): Promise<string | undefined> {
    const s = await this.sucursalScope.resolve();
    if (s.scoped && s.sucursalId) return s.sucursalId;
    return pedida;
  }

  // ─── a. PREVIEW ──────────────────────────────────────────────────────────
  async preview(q: PreviewQueryDto) {
    const empresaId = getEmpresaId();
    const hasta = q.hasta ? new Date(`${q.hasta}T23:59:59.999`) : new Date();
    const desde = q.desde ? new Date(`${q.desde}T00:00:00`) : undefined;
    const sucursalId = await this.sucursalEfectiva(q.sucursalId);

    // Líneas elegibles: PAGADA, con comision, sin liquidar, venta.createdAt <= hasta
    const lineas = await this.prisma.db.detalleVenta.findMany({
      where: {
        empleadoId: { not: null },
        comisionMonto: { gt: 0 },
        liquidacionId: null,
        ...(q.empleadoId && { empleadoId: q.empleadoId }),
        venta: {
          empresaId,
          estado: VentaStatus.PAGADA,
          createdAt: { lte: hasta },
          ...(sucursalId && { sucursalId }),
        },
      },
      select: {
        id: true,
        empleadoId: true,
        tipo: true,
        subtotal: true,
        comisionMonto: true,
        venta: { select: { createdAt: true } },
        empleado: { select: { nombre: true, modeloPago: true } },
      },
    });

    // Líneas fiao pendiente (informativo)
    const fiaoPendiente = await this.prisma.db.detalleVenta.aggregate({
      where: {
        empleadoId: { not: null },
        comisionMonto: { gt: 0 },
        liquidacionId: null,
        ...(q.empleadoId && { empleadoId: q.empleadoId }),
        venta: {
          empresaId,
          estado: { in: [VentaStatus.PENDIENTE, VentaStatus.ABONO_PARCIAL] },
          ...(sucursalId && { sucursalId }),
        },
      },
      _sum: { comisionMonto: true },
    });

    // Empleados SUELDO_FIJO activos (informativo)
    const sueldoFijoEmpleados = await this.prisma.db.empleado.findMany({
      where: {
        activo: true,
        modeloPago: ModeloPago.SUELDO_FIJO,
        ...(q.empleadoId && { id: q.empleadoId }),
        ...(sucursalId && { sucursalId }),
      },
      select: { id: true, nombre: true, sueldoMonto: true },
    });

    // Agrupar por empleado
    const porEmpleado = new Map<string, {
      empleadoId: string;
      nombre: string;
      modeloPago: string;
      cantidadLineas: number;
      totalBase: number;
      totalComision: number;
      lineasDeArrastre: number;
    }>();

    for (const l of lineas) {
      if (!l.empleadoId) continue;
      const esArrastre = desde ? l.venta.createdAt < desde : false;
      const cur = porEmpleado.get(l.empleadoId) ?? {
        empleadoId: l.empleadoId,
        nombre: l.empleado?.nombre ?? 'N/D',
        modeloPago: l.empleado?.modeloPago ?? 'COMISION',
        cantidadLineas: 0,
        totalBase: 0,
        totalComision: 0,
        lineasDeArrastre: 0,
      };
      cur.cantidadLineas++;
      cur.totalBase = this.round(cur.totalBase + Number(l.subtotal));
      cur.totalComision = this.round(cur.totalComision + Number(l.comisionMonto));
      if (esArrastre) cur.lineasDeArrastre++;
      porEmpleado.set(l.empleadoId, cur);
    }

    return {
      empleados: Array.from(porEmpleado.values()).map((e) => ({
        ...e,
        totalBase: this.round(e.totalBase),
        totalComision: this.round(e.totalComision),
      })),
      fiaoPendiente: this.round(Number(fiaoPendiente._sum.comisionMonto ?? 0)),
      sueldoFijo: sueldoFijoEmpleados.map((e) => ({
        empleadoId: e.id,
        nombre: e.nombre,
        sueldoMonto: Number(e.sueldoMonto ?? 0),
      })),
    };
  }

  // ─── b. CERRAR CORTE ─────────────────────────────────────────────────────
  async cerrarCorte(dto: CerrarCorteDto) {
    const empresaId = getEmpresaId();
    const user = getCurrentUser();
    const periodoIni = new Date(`${dto.desde}T00:00:00`);
    const periodoFin = new Date(`${dto.hasta}T23:59:59.999`);
    const sucursalId = await this.sucursalEfectiva(dto.sucursalId);

    const where: any = {
      empleadoId: { not: null },
      comisionMonto: { gt: 0 },
      liquidacionId: null,
      venta: {
        empresaId,
        estado: VentaStatus.PAGADA,
        createdAt: { lte: periodoFin },
        ...(sucursalId && { sucursalId }),
      },
    };
    if (dto.empleadoIds?.length) {
      where.empleadoId = { in: dto.empleadoIds };
    }

    // Recolectar IDs elegibles ANTES de la transacción
    const lineasElegibles = await this.prisma.db.detalleVenta.findMany({
      where,
      select: {
        id: true,
        empleadoId: true,
        tipo: true,
        subtotal: true,
        comisionMonto: true,
        empleado: { select: { nombre: true } },
      },
    });

    if (lineasElegibles.length === 0) {
      throw new BadRequestException(
        'No hay comisiones pendientes de liquidar en este período.',
      );
    }

    // Agrupar por empleado
    const porEmpleado = new Map<string, {
      nombre: string;
      ids: string[];
      totalServicios: number;
      totalProductos: number;
      totalPagar: number;
    }>();

    for (const l of lineasElegibles) {
      const eid = l.empleadoId!;
      const cur = porEmpleado.get(eid) ?? {
        nombre: l.empleado?.nombre ?? 'N/D',
        ids: [],
        totalServicios: 0,
        totalProductos: 0,
        totalPagar: 0,
      };
      cur.ids.push(l.id);
      cur.totalPagar = this.round(cur.totalPagar + Number(l.comisionMonto));
      if (l.tipo === LineaTipo.SERVICIO) {
        cur.totalServicios = this.round(cur.totalServicios + Number(l.subtotal));
      } else {
        cur.totalProductos = this.round(cur.totalProductos + Number(l.subtotal));
      }
      porEmpleado.set(eid, cur);
    }

    // $transaction atómica — sobre prisma.db para que la extensión de
    // aislamiento (empresaId auto-inyectado en Venta/LiquidacionComision/
    // DetalleVenta) también cubra las operaciones dentro del `tx`.
    const liquidaciones = await this.prisma.db.$transaction(async (tx) => {
      const results: any[] = [];

      for (const [empleadoId, grupo] of porEmpleado.entries()) {
        // Crear liquidación
        const liq = await tx.liquidacionComision.create({
          data: {
            empresaId,
            empleadoId,
            periodoIni,
            periodoFin,
            totalServicios: grupo.totalServicios,
            totalProductos: grupo.totalProductos,
            totalPagar: grupo.totalPagar,
            creadoPor: user.usuarioId ?? null,
            nota: dto.nota ?? null,
          },
        });

        // Marcar líneas — WHERE incluye liquidacionId: null como protección de carrera
        const updated = await tx.detalleVenta.updateMany({
          where: {
            id: { in: grupo.ids },
            liquidacionId: null, // protección: otra transacción concurrente no debe haberlas tomado
          },
          data: { liquidacionId: liq.id },
        });

        if (updated.count !== grupo.ids.length) {
          throw new BadRequestException(
            `Conflicto de concurrencia: algunas líneas del empleado ${grupo.nombre} ` +
            `ya fueron liquidadas por otro proceso. Reintente.`,
          );
        }

        results.push(liq);
      }

      return results;
    });

    for (const liq of liquidaciones) {
      const grupo = porEmpleado.get(liq.empleadoId);
      await this.audit.log({
        modulo: 'COMISIONES',
        entidad: 'LiquidacionComision',
        entidadId: liq.id,
        accion: 'SETTLE',
        datosDespues: {
          empleadoNombre: grupo?.nombre ?? 'N/D',
          periodoIni: dto.desde,
          periodoFin: dto.hasta,
          totalPagar: Number(liq.totalPagar),
          cantidadLineas: grupo?.ids.length ?? 0,
          nota: dto.nota ?? null,
        },
      });
    }

    return { liquidaciones: liquidaciones.map((l) => this.mapLiq(l)) };
  }

  // ─── c. LISTAR ────────────────────────────────────────────────────────────
  async listar(q: ListarQueryDto) {
    const empresaId = getEmpresaId();
    const where: any = { empresaId };

    // Aislamiento: un ADMIN asignado a una sucursal solo ve las
    // liquidaciones de los empleados de esa sucursal (LiquidacionComision
    // no tiene sucursalId → se filtra vía el empleado).
    const sucursalId = await this.sucursalEfectiva(undefined);
    if (sucursalId) where.empleado = { sucursalId };

    if (q.empleadoId) where.empleadoId = q.empleadoId;
    if (q.pagada === 'true')  where.pagada = true;
    if (q.pagada === 'false') where.pagada = false;
    if (q.desde || q.hasta) {
      where.periodoIni = {};
      if (q.desde) where.periodoIni.gte = new Date(`${q.desde}T00:00:00`);
      if (q.hasta) where.periodoFin = { lte: new Date(`${q.hasta}T23:59:59.999`) };
    }

    const rows = await this.prisma.db.liquidacionComision.findMany({
      where,
      include: { empleado: { select: { nombre: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((r) => ({
      ...this.mapLiq(r),
      empleadoNombre: (r as any).empleado?.nombre ?? 'N/D',
    }));
  }

  // ─── d. DETALLE ────────────────────────────────────────────────────────────
  async detalle(id: string) {
    const empresaId = getEmpresaId();
    const liq = await this.prisma.db.liquidacionComision.findFirst({
      where: { id, empresaId },
      include: { empleado: { select: { nombre: true } } },
    });
    if (!liq) throw new NotFoundException('Liquidación no encontrada');

    const lineas = await this.prisma.db.detalleVenta.findMany({
      where: { liquidacionId: id },
      include: {
        servicio: { select: { nombre: true } },
        venta: {
          select: {
            numero: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      ...this.mapLiq(liq),
      empleadoNombre: (liq as any).empleado?.nombre ?? 'N/D',
      lineas: lineas.map((l) => ({
        id: l.id,
        factura: `F${String((l.venta as any).numero).padStart(7, '0')}`,
        fecha: (l.venta as any).createdAt,
        tipo: l.tipo,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        subtotal: Number(l.subtotal),
        comisionPct: Number(l.comisionPct),
        comisionMonto: Number(l.comisionMonto),
      })),
    };
  }

  // ─── e. PAGAR ─────────────────────────────────────────────────────────────
  async pagar(id: string) {
    const empresaId = getEmpresaId();
    const liq = await this.prisma.db.liquidacionComision.findFirst({
      where: { id, empresaId },
      include: { empleado: { select: { nombre: true } } },
    });
    if (!liq) throw new NotFoundException('Liquidación no encontrada');
    if (liq.pagada) throw new BadRequestException('La liquidación ya está pagada.');
    if ((liq as any).anuladaAt) throw new BadRequestException('La liquidación está anulada.');

    const updated = await this.prisma.db.liquidacionComision.update({
      where: { id, empresaId },
      data: { pagada: true, pagadaAt: new Date() },
    });

    await this.audit.log({
      modulo: 'COMISIONES',
      entidad: 'LiquidacionComision',
      entidadId: id,
      accion: 'PAY',
      datosDespues: {
        empleadoNombre: (liq as any).empleado?.nombre ?? 'N/D',
        totalPagar: Number(liq.totalPagar),
      },
    });

    return this.mapLiq(updated);
  }

  // ─── f. ANULAR ────────────────────────────────────────────────────────────
  async anular(id: string) {
    const empresaId = getEmpresaId();
    const liq = await this.prisma.db.liquidacionComision.findFirst({
      where: { id, empresaId },
      include: { empleado: { select: { nombre: true } } },
    });
    if (!liq) throw new NotFoundException('Liquidación no encontrada');
    if (liq.pagada) {
      throw new BadRequestException(
        'No se puede anular una liquidación ya pagada.',
      );
    }
    if ((liq as any).anuladaAt) {
      throw new BadRequestException('La liquidación ya está anulada.');
    }

    // $transaction: anular + liberar líneas — sobre prisma.db (ver nota en cerrarCorte).
    const updated = await this.prisma.db.$transaction(async (tx) => {
      const result = await tx.liquidacionComision.update({
        where: { id, empresaId },
        data: { anuladaAt: new Date() },
      });
      await tx.detalleVenta.updateMany({
        where: { liquidacionId: id },
        data: { liquidacionId: null },
      });
      return result;
    });

    await this.audit.log({
      modulo: 'COMISIONES',
      entidad: 'LiquidacionComision',
      entidadId: id,
      accion: 'VOID',
      datosAntes: { totalPagar: Number(liq.totalPagar) },
      datosDespues: { empleadoNombre: (liq as any).empleado?.nombre ?? 'N/D' },
    });

    return this.mapLiq(updated);
  }

  // ─── helpers ──────────────────────────────────────────────────────────────
  private mapLiq(l: any) {
    return {
      id: l.id,
      empleadoId: l.empleadoId,
      periodoIni: l.periodoIni,
      periodoFin: l.periodoFin,
      totalServicios: Number(l.totalServicios),
      totalProductos: Number(l.totalProductos),
      totalPropinas: Number(l.totalPropinas),
      totalFija: Number(l.totalFija),
      totalPagar: Number(l.totalPagar),
      pagada: l.pagada,
      pagadaAt: l.pagadaAt ?? null,
      anuladaAt: l.anuladaAt ?? null,
      nota: l.nota ?? null,
      creadoPor: l.creadoPor ?? null,
      createdAt: l.createdAt,
    };
  }

  private round(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
}