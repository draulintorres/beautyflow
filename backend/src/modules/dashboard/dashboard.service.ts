import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { getEmpresaId } from '../../core/tenant/tenant-context';
import { SucursalScopeService } from '../../core/tenant/sucursal-scope.service';
import {
  fechaHoyRD,
  fechaRDDeInstante,
  mesRDDeInstante,
  rangoDiaRDReal,
} from '../../core/common/fecha-rd.util';
import {
  construirRangosDashboard,
  rangoDesglosarMes,
  rangoUltimos12Meses,
  ESTADOS_EXCLUIDOS_METRICAS_VENTA,
} from './dashboard-rangos.util';
import {
  VentaStatus,
  PagoStatus,
  CitaStatus,
  LineaTipo,
  ModeloPago,
  EstadoDeudaAlquiler,
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
   * Criterio único de inquilino (mismo que ingresoHoy en agenda.service.ts):
   * modeloPago ALQUILER con alquilerConfig activa. Las ventas de inquilinos
   * no son del salón, así que el dashboard del dueño las excluye de todas
   * sus métricas de venta — deuda técnica conocida: reclasificar a un
   * empleado reescribe sus métricas históricas.
   */
  private static readonly INQUILINO_WHERE = {
    modeloPago: ModeloPago.ALQUILER,
    alquilerConfig: { activo: true },
  };

  /** Venta sin ninguna línea de inquilino (factura limpia: no se mezclan). */
  private ventaSinInquilinos(): Prisma.VentaWhereInput {
    return {
      detalles: { none: { empleado: DashboardService.INQUILINO_WHERE } },
    };
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
    const { diaReal, diaNaive, mesReal, hace30Dias } = this.rangos();
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
      // Ventas de hoy (no anuladas, sin ventas de inquilinos) -- instante
      // real, rango semiabierto [gte, lt).
      this.prisma.db.venta.aggregate({
        where: {
          ...sucVenta,
          ...this.ventaSinInquilinos(),
          createdAt: { gte: diaReal.gte, lt: diaReal.lt },
          estado: { notIn: ESTADOS_EXCLUIDOS_METRICAS_VENTA },
        },
        _sum: { total: true },
        _count: true,
      }),
      // Ventas del mes (sin ventas de inquilinos) -- instante real, mes a
      // la fecha (sin tope superior, igual que antes).
      this.prisma.db.venta.aggregate({
        where: {
          ...sucVenta,
          ...this.ventaSinInquilinos(),
          createdAt: { gte: mesReal.gte },
          estado: { notIn: ESTADOS_EXCLUIDOS_METRICAS_VENTA },
        },
        _sum: { total: true },
      }),
      // Citas de hoy -- Cita.inicio es naive, sigue con rangoDiaRDNaive.
      this.prisma.db.cita.count({
        where: { ...sucCita, inicio: { gte: diaNaive.inicio, lte: diaNaive.fin } },
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
      // Ticket promedio del mes (sin ventas de inquilinos)
      this.prisma.db.venta.aggregate({
        where: {
          ...sucVenta,
          ...this.ventaSinInquilinos(),
          createdAt: { gte: mesReal.gte },
          estado: { notIn: ESTADOS_EXCLUIDOS_METRICAS_VENTA },
        },
        _avg: { total: true },
      }),
    ]);

    // Clientes VIP: gasto acumulado >= umbral de la empresa
    const clientesVip = await this.contarVip(sucursalId);

    // Lo que los inquilinos le deben al dueño (DeudaAlquiler), sin contar
    // anuladas ni saldadas. Solo se muestra si hay al menos un inquilino.
    const porCobrarInquilinos = await this.porCobrarInquilinos(sucursalId, diaReal.gte, diaReal.lt);
    const alquilerMes =
      porCobrarInquilinos.inquilinos > 0
        ? await this.alquilerDelMes(sucursalId, mesReal.gte)
        : null;

    // % de ocupación de agenda hoy (citas activas vs capacidad estimada)
    // -- Cita.inicio es naive, sigue con rangoDiaRDNaive.
    const ocupacion = await this.calcularOcupacionHoy(
      diaNaive.inicio,
      diaNaive.fin,
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
      porCobrarInquilinos,
      alquilerMes,
    };
  }

  /**
   * Línea de alquiler del mes (separada de Ventas mes, que no cambia).
   * generado = cuotas creadas este mes (no anuladas).
   * cobrado = abonos registrados este mes sobre deudas no anuladas. Ojo:
   * abonos de meses anteriores sobre una deuda de este mes cuentan como
   * cobrado de este mes — es el dinero que entró, no la cuota pagada.
   */
  private async alquilerDelMes(
    sucursalId: string | null,
    inicioMes: Date,
  ): Promise<{ generado: number; cobrado: number }> {
    const porSucursal = sucursalId ? { empleado: { sucursalId } } : {};
    const [generado, cobrado] = await Promise.all([
      this.prisma.db.deudaAlquiler.aggregate({
        where: {
          ...porSucursal,
          createdAt: { gte: inicioMes },
          estado: { not: EstadoDeudaAlquiler.ANULADA },
        },
        _sum: { montoTotal: true },
      }),
      this.prisma.db.abonoAlquiler.aggregate({
        where: {
          createdAt: { gte: inicioMes },
          deudaAlquiler: { ...porSucursal, estado: { not: EstadoDeudaAlquiler.ANULADA } },
        },
        _sum: { monto: true },
      }),
    ]);
    return {
      generado: this.round(Number(generado._sum.montoTotal ?? 0)),
      cobrado: this.round(Number(cobrado._sum.monto ?? 0)),
    };
  }

  private async porCobrarInquilinos(
    sucursalId: string | null,
    gteHoy: Date,
    ltHoy: Date,
  ): Promise<{ inquilinos: number; saldo: number; generadoHoy: number }> {
    const inquilinos = await this.prisma.db.empleado.count({
      where: {
        ...DashboardService.INQUILINO_WHERE,
        activo: true,
        ...this.sucFilter(sucursalId),
      },
    });
    if (inquilinos === 0) return { inquilinos: 0, saldo: 0, generadoHoy: 0 };

    const porSucursal = sucursalId ? { empleado: { sucursalId } } : {};
    const [pendiente, hoy] = await Promise.all([
      this.prisma.db.deudaAlquiler.aggregate({
        where: {
          ...porSucursal,
          estado: { in: [EstadoDeudaAlquiler.PENDIENTE, EstadoDeudaAlquiler.ABONO_PARCIAL] },
        },
        _sum: { saldo: true },
      }),
      // DeudaAlquiler.createdAt es instante real -- rango semiabierto [gte, lt).
      this.prisma.db.deudaAlquiler.aggregate({
        where: {
          ...porSucursal,
          estado: { not: EstadoDeudaAlquiler.ANULADA },
          createdAt: { gte: gteHoy, lt: ltHoy },
        },
        _sum: { montoTotal: true },
      }),
    ]);

    return {
      inquilinos,
      saldo: this.round(Number(pendiente._sum.saldo ?? 0)),
      generadoHoy: this.round(Number(hoy._sum.montoTotal ?? 0)),
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
    const { diaReal, mesReal } = this.rangos();

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
              ...this.ventaSinInquilinos(),
              createdAt: { gte: diaReal.gte, lt: diaReal.lt },
              estado: { notIn: ESTADOS_EXCLUIDOS_METRICAS_VENTA },
            },
            _sum: { total: true },
            _count: true,
          }),
          this.prisma.db.venta.aggregate({
            where: {
              sucursalId: s.id,
              ...this.ventaSinInquilinos(),
              createdAt: { gte: mesReal.gte },
              estado: { notIn: ESTADOS_EXCLUIDOS_METRICAS_VENTA },
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
  async graficas(sucursalIdReq?: string, anioReq?: string, mesReq?: string) {
    const sucursalId = await this.scopeSucursalId(sucursalIdReq);
    // Solo un año de 4 dígitos razonable pasa a la consulta — cualquier
    // otra cosa se ignora y cae al comportamiento por defecto (últimos 12
    // meses), igual que `scopeSucursalId` ignora un sucursalId inválido.
    const anio =
      anioReq && /^(19|20)\d{2}$/.test(anioReq) ? Number(anioReq) : undefined;
    // `mes` (1-12, opcional): filtro "Enero".."Diciembre" de la tarjeta
    // "Ventas de los últimos 12 meses" — cuando viene, cambia el gráfico
    // de 12 puntos mensuales a un desglose diario de ESE mes (del `anio`
    // elegido, o el año actual si no se eligió ninguno).
    const mes =
      mesReq && /^([1-9]|1[0-2])$/.test(mesReq) ? Number(mesReq) : undefined;

    const [
      ventas12Meses,
      ventasPorSucursal,
      serviciosMasVendidos,
      productosMasVendidos,
      formasPago,
      flujoCaja,
    ] = await Promise.all([
      this.ventasUltimos12Meses(sucursalId, anio, mes),
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
    const [topEmpleados, comisiones, topClientes, personalPropio, comisionEmpleados] = await Promise.all([
      this.topEmpleados(sucursalId),
      this.comisionesPendientesData(sucursalId),
      this.topClientes(sucursalId),
      // Personal propio: activo, no es el fantasma del dueño ni un inquilino
      // (criterio único de inquilino). Decide si "Top empleados" aplica.
      this.prisma.db.empleado.count({
        where: {
          esCuentaDueno: false,
          activo: true,
          NOT: DashboardService.INQUILINO_WHERE,
          ...this.sucFilter(sucursalId),
        },
      }),
      // Empleados de comisión activos (excluye al fantasma del dueño).
      this.prisma.db.empleado.count({
        where: {
          esCuentaDueno: false,
          activo: true,
          modeloPago: ModeloPago.COMISION,
          ...this.sucFilter(sucursalId),
        },
      }),
    ]);
    const tienePersonalPropio = personalPropio > 0;
    return {
      topEmpleados,
      comisionesPendientes: comisiones.total,
      comisionesPendientesDetalle: comisiones.porEmpleado,
      comisionesPendientesSinAsignar: comisiones.sinAsignar,
      topClientes,
      // Top empleados se muestra solo con personal propio.
      tienePersonalPropio,
      // Comisiones: hay empleados de comisión, o hay saldo pendiente aunque
      // el empleado ya no esté activo (no esconder una deuda real).
      tieneComisiones: comisionEmpleados > 0 || comisiones.total > 0,
    };
  }

  // ----------------------------------------------------------------
  // IMPLEMENTACIONES
  // ----------------------------------------------------------------

  private async ventasUltimos12Meses(
    sucursalId: string | null,
    anio?: number,
    mes?: number,
  ) {
    const empresaId = getEmpresaId();

    if (mes) {
      // Filtro "Enero".."Diciembre": un mes específico del `anio` elegido
      // (o el actual si no se eligió año) — desglose por día, no por mes,
      // ya que un solo punto mensual no dice nada. Venta.createdAt es
      // instante real -- rango semiabierto [gte, lt).
      const anioMes = anio ?? Number(fechaHoyRD().slice(0, 4));
      const { gte, lt, clavesDias } = rangoDesglosarMes(anioMes, mes);

      const ventasDia = await this.prisma.db.venta.findMany({
        where: {
          ...this.sucFilter(sucursalId),
          ...this.ventaSinInquilinos(),
          createdAt: { gte, lt },
          estado: { notIn: ESTADOS_EXCLUIDOS_METRICAS_VENTA },
        },
        select: { createdAt: true, total: true },
      });

      const mapaDia = new Map<string, number>();
      for (const clave of clavesDias) mapaDia.set(clave, 0);
      for (const v of ventasDia) {
        const key = fechaRDDeInstante(v.createdAt);
        if (mapaDia.has(key)) {
          mapaDia.set(key, this.round(mapaDia.get(key)! + Number(v.total)));
        }
      }
      void empresaId;
      return Array.from(mapaDia.entries()).map(([mes, total]) => ({
        mes,
        total,
      }));
    }

    // "Este año"/"Año pasado"/ventana móvil de 12 meses -- Venta.createdAt
    // es instante real; `lt` solo viene presente con un año explícito
    // (enero-diciembre cerrado), la ventana móvil por defecto queda
    // abierta hasta ahora, igual que antes.
    const { gte: desde, lt: hasta, clavesMeses } = rangoUltimos12Meses(fechaHoyRD(), anio);

    const ventas = await this.prisma.db.venta.findMany({
      where: {
        ...this.sucFilter(sucursalId),
        ...this.ventaSinInquilinos(),
        createdAt: { gte: desde, ...(hasta && { lt: hasta }) },
        estado: { notIn: ESTADOS_EXCLUIDOS_METRICAS_VENTA },
      },
      select: { createdAt: true, total: true },
    });

    const mapa = new Map<string, number>();
    for (const clave of clavesMeses) mapa.set(clave, 0);
    for (const v of ventas) {
      const key = mesRDDeInstante(v.createdAt);
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
        ...this.ventaSinInquilinos(),
        estado: { notIn: ESTADOS_EXCLUIDOS_METRICAS_VENTA },
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
        venta: { ...this.sucFilterViaVenta(sucursalId).venta, ...this.ventaSinInquilinos() },
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
      where: {
        venta: { ...this.sucFilterViaVenta(sucursalId).venta, ...this.ventaSinInquilinos() },
      } as Prisma.PagoWhereInput,
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

  /** Flujo de caja: entradas (pagos) por día en los últimos 30 días.
   * Pago.createdAt es instante real -- fecha de corte y llave del mapa
   * con fechaRDDeInstante, no con toISOString()/getters locales.
   *
   * Commit 7 (NO zona horaria): no filtraba por estado en absoluto --
   * sumaba pagos de ventas ANULADAS (y de OPEN) como si fueran entradas
   * reales de caja. anular() nunca marca sus Pago como REFUNDED, así que
   * sin excluir por venta.estado esos pagos quedaban contados para siempre.
   */
  private async flujoCajaUltimos30Dias(sucursalId: string | null) {
    const haceTreintaDias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const desde = rangoDiaRDReal(fechaRDDeInstante(haceTreintaDias)).gte;

    const sucVenta = this.sucFilterViaVenta(sucursalId);
    const pagos = await this.prisma.db.pago.findMany({
      where: {
        createdAt: { gte: desde },
        estado: PagoStatus.CONFIRMED,
        venta: { ...sucVenta.venta, estado: { not: VentaStatus.ANULADA } },
      } as Prisma.PagoWhereInput,
      select: { createdAt: true, monto: true },
    });

    const mapa = new Map<string, number>();
    for (const p of pagos) {
      const key = fechaRDDeInstante(p.createdAt);
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
    // `esCuentaDueno: false` excluye el Empleado fantasma que se autocrea
    // para el dueño (resolveEmpleadoRegistra) — mismo criterio que
    // LimitsService y `empleadosServicio` del POS: no es personal
    // contratado, no tiene sentido compararlo contra empleados reales.
    const grupos = await this.prisma.db.detalleVenta.groupBy({
      by: ['empleadoId'],
      where: {
        empleadoId: { not: null },
        empleado: { esCuentaDueno: false, NOT: DashboardService.INQUILINO_WHERE },
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

  /**
   * Dos rangos de "hoy" distintos a propósito -- ver fecha-rd.util.ts:
   * `diaReal`/`mesReal` ({gte, lt}, semiabiertos) son para campos que son
   * INSTANTES REALES (Venta.createdAt, DeudaAlquiler.createdAt, etc.);
   * `diaNaive` ({inicio, fin}) es SOLO para Cita.inicio/fin (esquema
   * naive). Mezclarlos es el bug que esto reemplaza -- ver investigación
   * de zona horaria.
   */
  private rangos() {
    return construirRangosDashboard(fechaHoyRD());
  }

  private round(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
}
