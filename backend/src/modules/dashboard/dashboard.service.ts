import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { getEmpresaId } from '../../core/tenant/tenant-context';
import { SucursalScopeService } from '../../core/tenant/sucursal-scope.service';
import {
  VentaStatus,
  CitaStatus,
  LineaTipo,
  Prisma,
} from '@prisma/client';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sucursalScope: SucursalScopeService,
  ) {}

  /**
   * Sucursal a la que se limita TODO el dashboard, o null = todo el negocio.
   *
   * - Usuario no-OWNER aislado (SucursalScopeService): SIEMPRE su sucursal,
   *   ignora `requested` (no puede pedir otra).
   * - OWNER / no aislado: `requested` si viene y es una sucursal activa
   *   real de la empresa (viene de la pestaña "Ventas por sucursal"); si no
   *   viene o es inválida → null = todo el negocio (comportamiento actual).
   */
  private async scopeSucursalId(requested?: string): Promise<string | null> {
    const s = await this.sucursalScope.resolve();
    if (s.scoped) return s.sucursalId;
    // Solo un UUID válido llega a la consulta (el id es @db.Uuid — un
    // string cualquiera hace throw en Prisma). Cualquier otra cosa → null.
    if (!requested || !UUID_RE.test(requested)) return null;
    const suc = await this.prisma.db.sucursal.findFirst({
      where: { id: requested, activo: true },
      select: { id: true },
    });
    return suc?.id ?? null;
  }

  /** where para modelos con sucursalId propio (Venta, Cita). */
  private sucFilter(sucursalId: string | null): { sucursalId?: string } {
    return sucursalId ? { sucursalId } : {};
  }

  /**
   * where anidado para modelos que llegan a la sucursal (y al tenant) vía
   * su relación con Venta: Pago y DetalleVenta NO tienen columna empresaId
   * propia, así que `prisma.db.*` NO las aísla automáticamente (esos
   * modelos no están en TENANT_MODELS — ver auditoría de aislamiento). Sin
   * este `empresaId` explícito, un groupBy/findMany sobre `detalleVenta` o
   * `pago` sin más filtros lee filas de TODAS las empresas del sistema.
   */
  private sucFilterViaVenta(
    sucursalId: string | null,
  ): { venta: { empresaId: string; sucursalId?: string } } {
    return {
      venta: {
        empresaId: getEmpresaId(),
        ...(sucursalId ? { sucursalId } : {}),
      },
    };
  }

  // ============ RESUMEN COMPLETO (home del dueño) ============
  async resumen(sucursalIdReq?: string) {
    const [kpis, graficas, rankings] = await Promise.all([
      this.kpis(sucursalIdReq),
      this.graficas(sucursalIdReq),
      this.rankings(sucursalIdReq),
    ]);
    return { kpis, graficas, rankings };
  }

  // ============ KPIs ============
  async kpis(sucursalIdReq?: string) {
    const { inicioHoy, finHoy, inicioMes, hace30Dias } = this.rangos();
    const sucursalId = await this.scopeSucursalId(sucursalIdReq);
    const sucVenta = this.sucFilter(sucursalId);
    const sucCita = this.sucFilter(sucursalId);

    const [
      ventasHoy,
      ventasMes,
      citasHoy,
      clientesNuevos,
      cuentasPorCobrar,
      ticketAgg,
    ] = await Promise.all([
      // Ventas de hoy (no anuladas)
      this.prisma.db.venta.aggregate({
        where: {
          ...sucVenta,
          createdAt: { gte: inicioHoy, lte: finHoy },
          estado: { not: VentaStatus.ANULADA },
        },
        _sum: { total: true },
        _count: true,
      }),
      // Ventas del mes
      this.prisma.db.venta.aggregate({
        where: {
          ...sucVenta,
          createdAt: { gte: inicioMes },
          estado: { not: VentaStatus.ANULADA },
        },
        _sum: { total: true },
      }),
      // Citas de hoy
      this.prisma.db.cita.count({
        where: { ...sucCita, inicio: { gte: inicioHoy, lte: finHoy } },
      }),
      // Clientes nuevos (últimos 30 días). Cliente no tiene sucursal propia:
      // si la vista está aislada, se cuentan los que YA compraron en esa
      // sucursal (adquisición atribuible a la sucursal).
      this.prisma.db.cliente.count({
        where: {
          createdAt: { gte: hace30Dias },
          ...(sucursalId ? { ventas: { some: { sucursalId } } } : {}),
        },
      }),
      // Cuentas por cobrar (saldo de ventas pendientes/parciales)
      this.prisma.db.venta.aggregate({
        where: {
          ...sucVenta,
          estado: { in: [VentaStatus.PENDIENTE, VentaStatus.ABONO_PARCIAL] },
        },
        _sum: { saldo: true },
      }),
      // Ticket promedio del mes
      this.prisma.db.venta.aggregate({
        where: {
          ...sucVenta,
          createdAt: { gte: inicioMes },
          estado: { not: VentaStatus.ANULADA },
        },
        _avg: { total: true },
      }),
    ]);

    // Clientes VIP: gasto acumulado >= umbral de la empresa
    const clientesVip = await this.contarVip(sucursalId);

    // % de ocupación de agenda hoy (citas activas vs capacidad estimada)
    const ocupacion = await this.calcularOcupacionHoy(
      inicioHoy,
      finHoy,
      sucursalId,
    );

    return {
      ventasHoy: Number(ventasHoy._sum.total ?? 0),
      numVentasHoy: ventasHoy._count,
      ventasMes: Number(ventasMes._sum.total ?? 0),
      citasHoy,
      clientesNuevos,
      clientesVip,
      cuentasPorCobrar: Number(cuentasPorCobrar._sum.saldo ?? 0),
      ticketPromedio: this.round(Number(ticketAgg._avg.total ?? 0)),
      porcentajeOcupacion: ocupacion,
    };
  }

  /**
   * Ventas de hoy y del mes, DESGLOSADAS por sucursal (Parte A — pestaña
   * de Inicio, solo OWNER). Mismos rangos de fecha que kpis() para que los
   * números "calcen" con el resto del Dashboard al comparar. Solo tiene
   * sentido si la empresa tiene más de 1 sucursal — el filtrado por
   * módulo/cantidad de sucursales lo decide el frontend con lo que ya
   * expone /sucursales; este endpoint solo calcula, no oculta nada.
   *
   * NOTA: este endpoint es exclusivo del OWNER (lo gatea el controlador con
   * @Roles('OWNER')), así que NO aplica el aislamiento por sucursal — es
   * justamente la vista de comparación entre todas.
   */
  async porSucursal() {
    const { inicioHoy, finHoy, inicioMes } = this.rangos();

    const sucursales = await this.prisma.db.sucursal.findMany({
      where: { activo: true },
      orderBy: [{ esPrincipal: 'desc' }, { nombre: 'asc' }],
      select: { id: true, nombre: true, esPrincipal: true },
    });

    const resultados = await Promise.all(
      sucursales.map(async (s) => {
        const [hoyAgg, mesAgg] = await Promise.all([
          this.prisma.db.venta.aggregate({
            where: {
              sucursalId: s.id,
              createdAt: { gte: inicioHoy, lte: finHoy },
              estado: { not: VentaStatus.ANULADA },
            },
            _sum: { total: true },
            _count: true,
          }),
          this.prisma.db.venta.aggregate({
            where: {
              sucursalId: s.id,
              createdAt: { gte: inicioMes },
              estado: { not: VentaStatus.ANULADA },
            },
            _sum: { total: true },
          }),
        ]);
        return {
          sucursalId: s.id,
          nombre: s.nombre,
          esPrincipal: s.esPrincipal,
          ventasHoy: Number(hoyAgg._sum.total ?? 0),
          numVentasHoy: hoyAgg._count,
          ventasMes: Number(mesAgg._sum.total ?? 0),
        };
      }),
    );

    return resultados;
  }

  // ============ GRÁFICAS ============
  async graficas(sucursalIdReq?: string) {
    const sucursalId = await this.scopeSucursalId(sucursalIdReq);

    const [
      ventas12Meses,
      ventasPorSucursal,
      serviciosMasVendidos,
      productosMasVendidos,
      formasPago,
      flujoCaja,
    ] = await Promise.all([
      this.ventasUltimos12Meses(sucursalId),
      this.ventasPorSucursal(sucursalId),
      this.itemsMasVendidos(LineaTipo.SERVICIO, sucursalId),
      this.itemsMasVendidos(LineaTipo.PRODUCTO, sucursalId),
      this.formasDePago(sucursalId),
      this.flujoCajaUltimos30Dias(sucursalId),
    ]);

    return {
      ventas12Meses,
      ventasPorSucursal,
      serviciosMasVendidos,
      productosMasVendidos,
      formasPago,
      flujoCaja,
    };
  }

  // ============ RANKINGS ============
  async rankings(sucursalIdReq?: string) {
    const sucursalId = await this.scopeSucursalId(sucursalIdReq);
    const [topEmpleados, comisiones, topClientes] = await Promise.all([
      this.topEmpleados(sucursalId),
      this.comisionesPendientesData(sucursalId),
      this.topClientes(sucursalId),
    ]);
    return {
      topEmpleados,
      comisionesPendientes: comisiones.total,
      comisionesPendientesDetalle: comisiones.porEmpleado,
      comisionesPendientesSinAsignar: comisiones.sinAsignar,
      topClientes,
    };
  }

  // ----------------------------------------------------------------
  // IMPLEMENTACIONES
  // ----------------------------------------------------------------

  private async ventasUltimos12Meses(sucursalId: string | null) {
    const empresaId = getEmpresaId();
    const desde = new Date();
    desde.setMonth(desde.getMonth() - 11);
    desde.setDate(1);
    desde.setHours(0, 0, 0, 0);

    const ventas = await this.prisma.db.venta.findMany({
      where: {
        ...this.sucFilter(sucursalId),
        createdAt: { gte: desde },
        estado: { not: VentaStatus.ANULADA },
      },
      select: { createdAt: true, total: true },
    });

    // Agrupar por mes (YYYY-MM)
    const mapa = new Map<string, number>();
    for (let i = 0; i < 12; i++) {
      const d = new Date(desde);
      d.setMonth(desde.getMonth() + i);
      mapa.set(this.mesKey(d), 0);
    }
    for (const v of ventas) {
      const key = this.mesKey(v.createdAt);
      if (mapa.has(key)) {
        mapa.set(key, this.round(mapa.get(key)! + Number(v.total)));
      }
    }
    void empresaId;
    return Array.from(mapa.entries()).map(([mes, total]) => ({ mes, total }));
  }

  private async ventasPorSucursal(sucursalId: string | null) {
    const grupos = await this.prisma.db.venta.groupBy({
      by: ['sucursalId'],
      where: {
        ...this.sucFilter(sucursalId),
        estado: { not: VentaStatus.ANULADA },
      },
      _sum: { total: true },
      _count: true,
    });

    // Resolver nombres de sucursal
    const sucursales = await this.prisma.db.sucursal.findMany({
      select: { id: true, nombre: true },
    });
    const nombreMap = new Map(sucursales.map((s) => [s.id, s.nombre]));

    return grupos.map((g) => ({
      sucursalId: g.sucursalId,
      sucursal: g.sucursalId ? nombreMap.get(g.sucursalId) ?? 'N/D' : 'Sin sucursal',
      total: Number(g._sum.total ?? 0),
      ventas: g._count,
    }));
  }

  private async itemsMasVendidos(tipo: LineaTipo, sucursalId: string | null) {
    const grupos = await this.prisma.db.detalleVenta.groupBy({
      by: tipo === LineaTipo.SERVICIO ? ['servicioId'] : ['productoId'],
      where: {
        tipo,
        ...this.sucFilterViaVenta(sucursalId),
      } as Prisma.DetalleVentaWhereInput,
      _sum: { cantidad: true, subtotal: true },
      _count: true,
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 10,
    });

    const resultados: any[] = [];
    for (const g of grupos) {
      const refId =
        tipo === LineaTipo.SERVICIO ? (g as any).servicioId : (g as any).productoId;
      if (!refId) continue;
      let nombre = 'N/D';
      if (tipo === LineaTipo.SERVICIO) {
        const s = await this.prisma.db.servicio.findFirst({
          where: { id: refId },
          select: { nombre: true },
        });
        nombre = s?.nombre ?? 'N/D';
      } else {
        const p = await this.prisma.db.producto.findFirst({
          where: { id: refId },
          select: { nombre: true },
        });
        nombre = p?.nombre ?? 'N/D';
      }
      resultados.push({
        id: refId,
        nombre,
        cantidad: g._sum.cantidad ?? 0,
        total: Number(g._sum.subtotal ?? 0),
      });
    }
    return resultados;
  }

  private async formasDePago(sucursalId: string | null) {
    const grupos = await this.prisma.db.pago.groupBy({
      by: ['metodoPagoId'],
      where: this.sucFilterViaVenta(sucursalId) as Prisma.PagoWhereInput,
      _sum: { monto: true },
      _count: true,
    });
    const metodos = await this.prisma.db.metodoPago.findMany({
      select: { id: true, nombre: true },
    });
    const nombreMap = new Map(metodos.map((m) => [m.id, m.nombre]));

    return grupos.map((g) => ({
      metodo: nombreMap.get(g.metodoPagoId) ?? 'N/D',
      total: Number(g._sum.monto ?? 0),
      transacciones: g._count,
    }));
  }

  /** Flujo de caja: entradas (pagos) por día en los últimos 30 días. */
  private async flujoCajaUltimos30Dias(sucursalId: string | null) {
    const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    desde.setHours(0, 0, 0, 0);

    const pagos = await this.prisma.db.pago.findMany({
      where: {
        createdAt: { gte: desde },
        ...(this.sucFilterViaVenta(sucursalId) as Prisma.PagoWhereInput),
      },
      select: { createdAt: true, monto: true },
    });

    const mapa = new Map<string, number>();
    for (const p of pagos) {
      const key = p.createdAt.toISOString().slice(0, 10);
      mapa.set(key, this.round((mapa.get(key) ?? 0) + Number(p.monto)));
    }

    return Array.from(mapa.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, entradas]) => ({ fecha, entradas }));
  }

  private async topEmpleados(sucursalId: string | null) {
    // Ingresos generados por empleado (líneas de venta donde ejecutó).
    // Si la vista está aislada, se cuentan solo las líneas de ventas de esa
    // sucursal — sin importar a qué sucursal esté asignado el empleado.
    const grupos = await this.prisma.db.detalleVenta.groupBy({
      by: ['empleadoId'],
      where: {
        empleadoId: { not: null },
        ...this.sucFilterViaVenta(sucursalId),
      } as Prisma.DetalleVentaWhereInput,
      _sum: { subtotal: true, comisionMonto: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 10,
    });

    const resultados: any[] = [];
    for (const g of grupos) {
      if (!g.empleadoId) continue;
      const emp = await this.prisma.db.empleado.findFirst({
        where: { id: g.empleadoId },
        select: { nombre: true },
      });
      resultados.push({
        empleadoId: g.empleadoId,
        nombre: emp?.nombre ?? 'N/D',
        ingresos: Number(g._sum.subtotal ?? 0),
        comisiones: Number(g._sum.comisionMonto ?? 0),
      });
    }
    return resultados;
  }

  /**
   * Comisiones REALMENTE pendientes de pago: líneas de venta con comisión
   * congelada que todavía NO entraron a un corte de liquidación
   * (`liquidacionId: null`). Antes esta tarjeta sumaba TODAS las comisiones
   * históricas (incluidas las ya pagadas en cortes), lo que inflaba el
   * "Total por pagar a empleados".
   *
   * Devuelve el total + un desglose por empleado (top 5, de mayor a menor)
   * para la tarjeta del Dashboard. El desglose usa exactamente el mismo
   * criterio que el total, así que siempre suma al total (salvo comisiones
   * sin empleado asignado, que van aparte en `sinAsignar`).
   */
  private async comisionesPendientesData(sucursalId: string | null) {
    const baseWhere: Prisma.DetalleVentaWhereInput = {
      liquidacionId: null,
      comisionMonto: { gt: 0 },
      venta: {
        empresaId: getEmpresaId(),
        estado: { not: VentaStatus.ANULADA },
        ...(sucursalId ? { sucursalId } : {}),
      },
    };

    const grupos = await this.prisma.db.detalleVenta.groupBy({
      by: ['empleadoId'],
      where: baseWhere,
      _sum: { comisionMonto: true },
      orderBy: { _sum: { comisionMonto: 'desc' } },
    });

    const total = this.round(
      grupos.reduce((a, g) => a + Number(g._sum.comisionMonto ?? 0), 0),
    );

    const conEmpleado = grupos.filter(
      (g): g is typeof g & { empleadoId: string } => !!g.empleadoId,
    );
    const empleados = await this.prisma.db.empleado.findMany({
      where: { id: { in: conEmpleado.map((g) => g.empleadoId) } },
      select: { id: true, nombre: true },
    });
    const nombreMap = new Map(empleados.map((e) => [e.id, e.nombre]));

    const porEmpleado = conEmpleado.slice(0, 5).map((g) => ({
      empleadoId: g.empleadoId,
      nombre: nombreMap.get(g.empleadoId) ?? 'N/D',
      monto: this.round(Number(g._sum.comisionMonto ?? 0)),
    }));

    const sinAsignar = this.round(
      grupos
        .filter((g) => !g.empleadoId)
        .reduce((a, g) => a + Number(g._sum.comisionMonto ?? 0), 0),
    );

    return { total, porEmpleado, sinAsignar };
  }

  private async topClientes(sucursalId: string | null) {
    const grupos = await this.prisma.db.venta.groupBy({
      by: ['clienteId'],
      where: {
        ...this.sucFilter(sucursalId),
        clienteId: { not: null },
        estado: { not: VentaStatus.ANULADA },
      },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 10,
    });

    const resultados: any[] = [];
    for (const g of grupos) {
      if (!g.clienteId) continue;
      const cli = await this.prisma.db.cliente.findFirst({
        where: { id: g.clienteId },
        select: { nombre: true, apellido: true },
      });
      resultados.push({
        clienteId: g.clienteId,
        nombre: cli ? `${cli.nombre}${cli.apellido ? ' ' + cli.apellido : ''}` : 'N/D',
        gastoTotal: Number(g._sum.total ?? 0),
      });
    }
    return resultados;
  }

  // ---------- helpers ----------
  private async contarVip(sucursalId: string | null): Promise<number> {
    const empresaId = getEmpresaId();
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { umbralVipMonto: true },
    });
    const umbral = Number(empresa?.umbralVipMonto ?? 50000);

    const grupos = await this.prisma.db.venta.groupBy({
      by: ['clienteId'],
      where: {
        ...this.sucFilter(sucursalId),
        clienteId: { not: null },
        estado: { not: VentaStatus.ANULADA },
      },
      _sum: { total: true },
    });
    return grupos.filter((g) => Number(g._sum.total ?? 0) >= umbral).length;
  }

  private async calcularOcupacionHoy(
    inicioHoy: Date,
    finHoy: Date,
    sucursalId: string | null,
  ): Promise<number> {
    // Citas activas hoy
    const citasActivas = await this.prisma.db.cita.count({
      where: {
        ...this.sucFilter(sucursalId),
        inicio: { gte: inicioHoy, lte: finHoy },
        estado: {
          in: [
            CitaStatus.SCHEDULED,
            CitaStatus.CONFIRMED,
            CitaStatus.IN_PROGRESS,
            CitaStatus.COMPLETED,
          ],
        },
      },
    });

    // Empleados activos (capacidad estimada: 8 citas/empleado/día).
    // Si la vista está aislada, solo cuentan los empleados de esa sucursal.
    const empleados = await this.prisma.db.empleado.count({
      where: { activo: true, ...(sucursalId ? { sucursalId } : {}) },
    });
    if (empleados === 0) return 0;
    const capacidad = empleados * 8;
    return Math.min(100, this.round((citasActivas / capacidad) * 100));
  }

  private rangos() {
    const ahora = new Date();
    const inicioHoy = new Date(ahora);
    inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date(ahora);
    finHoy.setHours(23, 59, 59, 999);
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const hace30Dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { inicioHoy, finHoy, inicioMes, hace30Dias };
  }

  private mesKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private round(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
}
