import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ReporteQueryDto, ReporteTabular } from './dto/reporte.dto';
import {
  VentaStatus,
  CitaStatus,
  ModeloPago,
  FlujoDineroAlquiler,
  LineaTipo,
  CajaStatus,
} from '@prisma/client';
import { ENUM_TO_ESTADO_ES } from '../agenda/dto/cita.dto';
import { tenantContext, getEmpresaId } from '../../core/tenant/tenant-context';
import { SucursalScopeService } from '../../core/tenant/sucursal-scope.service';

@Injectable()
export class ReportesDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sucursalScope: SucursalScopeService,
  ) {}

  /**
   * Sucursal efectiva del reporte:
   * - Usuario aislado (no-OWNER con sucursal) → SIEMPRE su sucursal, ignora
   *   lo que venga en el query (no puede pedir otra).
   * - OWNER / no aislado → lo que pida el query (o ninguna = todas).
   */
  private async sucursalEfectiva(q: ReporteQueryDto): Promise<string | null> {
    const s = await this.sucursalScope.resolve();
    if (s.scoped && s.sucursalId) return s.sucursalId;
    return q.sucursalId ?? null;
  }

  /**
   * where anidado para modelos que llegan al tenant SOLO vía su relación
   * con Venta: DetalleVenta y Pago no tienen columna empresaId propia, así
   * que `prisma.db.*` no los aísla automáticamente (no están en
   * TENANT_MODELS — ver auditoría de aislamiento). Sin este `empresaId`
   * explícito, cualquier reporte sin filtro de sucursal (el caso normal del
   * OWNER, "todas las sucursales") lee filas de TODAS las empresas.
   */
  private ventaFiltro(sucursalId: string | null): { empresaId: string; sucursalId?: string } {
    return { empresaId: getEmpresaId(), ...(sucursalId ? { sucursalId } : {}) };
  }

  // ---------- VENTAS POR FECHA ----------
  async ventasPorFecha(q: ReporteQueryDto): Promise<ReporteTabular> {
    const where = this.rangoFecha(q, 'createdAt');
    const sucursalId = await this.sucursalEfectiva(q);
    const ventas = await this.prisma.db.venta.findMany({
      where: {
        ...where,
        ...(sucursalId && { sucursalId }),
        estado: { not: VentaStatus.ANULADA },
      },
      include: { cliente: { select: { nombre: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const filas = ventas.map((v) => ({
      factura: `F${String(v.numero).padStart(7, '0')}`,
      fecha: v.createdAt.toISOString().slice(0, 10),
      cliente: v.cliente?.nombre ?? 'Walk-in',
      subtotal: Number(v.subtotal),
      itbis: Number(v.itbis),
      total: Number(v.total),
      saldo: Number(v.saldo),
      estado: v.estado,
    }));

    const totalGeneral = filas.reduce((a, f) => a + f.total, 0);
    const totalItbis = filas.reduce((a, f) => a + f.itbis, 0);

    return {
      titulo: 'Reporte de Ventas',
      subtitulo: this.rangoTexto(q),
      columnas: [
        { key: 'factura', label: 'Factura' },
        { key: 'fecha', label: 'Fecha', tipo: 'fecha' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'subtotal', label: 'Subtotal', tipo: 'dinero' },
        { key: 'itbis', label: 'ITBIS', tipo: 'dinero' },
        { key: 'total', label: 'Total', tipo: 'dinero' },
        { key: 'saldo', label: 'Saldo', tipo: 'dinero' },
        { key: 'estado', label: 'Estado' },
      ],
      filas,
      totales: {
        cliente: `${filas.length} ventas`,
        itbis: this.round(totalItbis),
        total: this.round(totalGeneral),
      },
      ...(await this.metaEmpresa()),
    };
  }

  // ---------- CITAS POR ESTADO ----------
  async citasPorEstado(q: ReporteQueryDto): Promise<ReporteTabular> {
    const where = this.rangoFecha(q, 'inicio');
    const sucursalId = await this.sucursalEfectiva(q);
    const citas = await this.prisma.db.cita.findMany({
      where: {
        ...where,
        ...(sucursalId && { sucursalId }),
        ...(q.empleadoId && { empleadoId: q.empleadoId }),
      },
      include: {
        cliente: { select: { nombre: true } },
        empleado: { select: { nombre: true } },
      },
      orderBy: { inicio: 'asc' },
    });

    const filas = citas.map((c) => ({
      fecha: c.inicio.toISOString().slice(0, 10),
      hora: this.hhmm(c.inicio),
      cliente: c.cliente?.nombre ?? 'N/D',
      empleado: c.empleado?.nombre ?? 'N/D',
      estado: ENUM_TO_ESTADO_ES[c.estado as CitaStatus],
      total: Number(c.total),
    }));

    // Conteo por estado
    const porEstado: Record<string, number> = {};
    for (const f of filas) porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1;

    return {
      titulo: 'Reporte de Citas',
      subtitulo: `${this.rangoTexto(q)} · ${Object.entries(porEstado)
        .map(([e, n]) => `${e}: ${n}`)
        .join(' · ')}`,
      columnas: [
        { key: 'fecha', label: 'Fecha', tipo: 'fecha' },
        { key: 'hora', label: 'Hora' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'empleado', label: 'Empleado' },
        { key: 'estado', label: 'Estado' },
        { key: 'total', label: 'Total', tipo: 'dinero' },
      ],
      filas,
      totales: { cliente: `${filas.length} citas` },
      ...(await this.metaEmpresa()),
    };
  }

  // ---------- COMISIONES ----------
  async comisiones(q: ReporteQueryDto): Promise<ReporteTabular> {
    const where = this.rangoFecha(q, 'createdAt');
    const sucursalId = await this.sucursalEfectiva(q);
    const detalles = await this.prisma.db.detalleVenta.findMany({
      where: {
        empleadoId: { not: null },
        comisionMonto: { gt: 0 },
        venta: {
          ...where,
          estado: { not: VentaStatus.ANULADA },
          ...this.ventaFiltro(sucursalId),
        },
        ...(q.empleadoId && { empleadoId: q.empleadoId }),
      },
      include: {
        empleado: { select: { nombre: true } },
      },
    });

    // Agrupar por empleado
    const porEmpleado = new Map<
      string,
      { nombre: string; ventas: number; comision: number }
    >();
    for (const d of detalles) {
      if (!d.empleadoId) continue;
      const cur = porEmpleado.get(d.empleadoId) ?? {
        nombre: d.empleado?.nombre ?? 'N/D',
        ventas: 0,
        comision: 0,
      };
      cur.ventas += Number(d.subtotal);
      cur.comision += Number(d.comisionMonto);
      porEmpleado.set(d.empleadoId, cur);
    }

    const filas = Array.from(porEmpleado.values()).map((e) => ({
      empleado: e.nombre,
      ventasGeneradas: this.round(e.ventas),
      comision: this.round(e.comision),
    }));
    const totalComision = filas.reduce((a, f) => a + f.comision, 0);

    return {
      titulo: 'Reporte de Comisiones',
      subtitulo: this.rangoTexto(q),
      columnas: [
        { key: 'empleado', label: 'Empleado' },
        { key: 'ventasGeneradas', label: 'Ventas generadas', tipo: 'dinero' },
        { key: 'comision', label: 'Comisión', tipo: 'dinero' },
      ],
      filas,
      totales: { empleado: 'TOTAL', comision: this.round(totalComision) },
      ...(await this.metaEmpresa()),
    };
  }

  // ---------- SERVICIOS Y PRODUCTOS VENDIDOS ----------
  /**
   * Listado completo de servicios y productos vendidos en el período, con
   * cantidad y total facturado, de mayor a menor. Es el "Ver todos" de la
   * tarjeta "Servicios más vendidos" del Dashboard (que solo muestra el top 5).
   * Se agrupa por el ítem congelado en la línea (`descripcion`) para no
   * depender de que el servicio/producto siga existiendo en el catálogo.
   */
  async serviciosProductosVendidos(q: ReporteQueryDto): Promise<ReporteTabular> {
    const where = this.rangoFecha(q, 'createdAt');
    const sucursalId = await this.sucursalEfectiva(q);

    const detalles = await this.prisma.db.detalleVenta.findMany({
      where: {
        tipo: { in: [LineaTipo.SERVICIO, LineaTipo.PRODUCTO] },
        venta: {
          ...where,
          estado: { not: VentaStatus.ANULADA },
          ...this.ventaFiltro(sucursalId),
        },
        ...(q.empleadoId && { empleadoId: q.empleadoId }),
      },
      select: {
        tipo: true,
        servicioId: true,
        productoId: true,
        descripcion: true,
        cantidad: true,
        subtotal: true,
      },
    });

    const mapa = new Map<
      string,
      { item: string; tipo: string; cantidad: number; total: number }
    >();
    for (const d of detalles) {
      const refId = d.servicioId ?? d.productoId ?? `desc:${d.descripcion}`;
      const key = `${d.tipo}:${refId}`;
      const cur =
        mapa.get(key) ??
        {
          item: d.descripcion,
          tipo: d.tipo === LineaTipo.SERVICIO ? 'Servicio' : 'Producto',
          cantidad: 0,
          total: 0,
        };
      cur.cantidad += d.cantidad;
      cur.total += Number(d.subtotal);
      mapa.set(key, cur);
    }

    const filas = Array.from(mapa.values())
      .map((r) => ({ ...r, total: this.round(r.total) }))
      .sort((a, b) => b.total - a.total);

    const totalUnidades = filas.reduce((a, f) => a + f.cantidad, 0);
    const totalGeneral = filas.reduce((a, f) => a + f.total, 0);

    return {
      titulo: 'Servicios y Productos Vendidos',
      subtitulo: this.rangoTexto(q),
      columnas: [
        { key: 'item', label: 'Ítem' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'cantidad', label: 'Cantidad', tipo: 'numero' },
        { key: 'total', label: 'Total vendido', tipo: 'dinero' },
      ],
      filas,
      totales: {
        item: `${filas.length} ítems`,
        cantidad: totalUnidades,
        total: this.round(totalGeneral),
      },
      ...(await this.metaEmpresa()),
    };
  }

  // ---------- INVENTARIO ----------
  async inventario(q: ReporteQueryDto): Promise<ReporteTabular> {
    const productos = await this.prisma.db.producto.findMany({
      where: { activo: true },
      include: { categoriaRef: { select: { nombre: true } } },
      orderBy: { nombre: 'asc' },
    });

    const filas = productos.map((p) => ({
      codigo: p.codigo ?? '',
      producto: p.nombre,
      categoria: p.categoriaRef?.nombre ?? '',
      existencia: p.existencia,
      stockMinimo: p.stockMinimo,
      costo: Number(p.costo),
      precio: Number(p.precio),
      valorInventario: this.round(p.existencia * Number(p.costo)),
    }));
    const valorTotal = filas.reduce((a, f) => a + f.valorInventario, 0);

    return {
      titulo: 'Reporte de Inventario',
      subtitulo: `${filas.length} productos activos`,
      columnas: [
        { key: 'codigo', label: 'Código' },
        { key: 'producto', label: 'Producto' },
        { key: 'categoria', label: 'Categoría' },
        { key: 'existencia', label: 'Existencia', tipo: 'numero' },
        { key: 'stockMinimo', label: 'Mínimo', tipo: 'numero' },
        { key: 'costo', label: 'Costo', tipo: 'dinero' },
        { key: 'precio', label: 'Precio', tipo: 'dinero' },
        { key: 'valorInventario', label: 'Valor', tipo: 'dinero' },
      ],
      filas,
      totales: { producto: 'VALOR TOTAL', valorInventario: this.round(valorTotal) },
      ...(await this.metaEmpresa()),
    };
  }

  // ---------- KARDEX ----------
  async kardex(q: ReporteQueryDto): Promise<ReporteTabular> {
    if (!q.productoId) {
      return {
        titulo: 'Kardex',
        subtitulo: 'Especifique un productoId',
        columnas: [],
        filas: [],
      };
    }
    const where = this.rangoFecha(q, 'createdAt');
    // Inventario NO está aislado por sucursal en este sistema: el stock es un
    // pool único a nivel empresa (StockSucursal existe en el schema pero está
    // vacío; POS/ajustes mueven Producto.existencia y todos los
    // MovimientoInventario tienen sucursalId null). Por eso el kardex NO se
    // filtra por sucursal — hacerlo escondería todos los movimientos.
    const producto = await this.prisma.db.producto.findFirst({
      where: { id: q.productoId },
      select: { nombre: true },
    });
    const movimientos = await this.prisma.db.movimientoInventario.findMany({
      where: { productoId: q.productoId, ...where },
      orderBy: { createdAt: 'asc' },
    });

    const filas = movimientos.map((m) => ({
      fecha: m.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      tipo: m.tipo,
      motivo: m.motivo ?? '',
      cantidad: m.cantidad,
      saldoAnterior: m.saldoAnterior,
      saldoNuevo: m.saldoNuevo,
    }));

    return {
      titulo: `Kardex — ${producto?.nombre ?? ''}`,
      subtitulo: this.rangoTexto(q),
      columnas: [
        { key: 'fecha', label: 'Fecha' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'motivo', label: 'Motivo' },
        { key: 'cantidad', label: 'Cantidad', tipo: 'numero' },
        { key: 'saldoAnterior', label: 'Saldo ant.', tipo: 'numero' },
        { key: 'saldoNuevo', label: 'Saldo nuevo', tipo: 'numero' },
      ],
      filas,
      ...(await this.metaEmpresa()),
    };
  }

  // ---------- CUENTAS POR COBRAR ----------
  async cuentasPorCobrar(q: ReporteQueryDto): Promise<ReporteTabular> {
    const sucursalId = await this.sucursalEfectiva(q);
    const ventas = await this.prisma.db.venta.findMany({
      where: {
        estado: { in: [VentaStatus.PENDIENTE, VentaStatus.ABONO_PARCIAL] },
        ...(sucursalId && { sucursalId }),
      },
      include: { cliente: { select: { nombre: true, telefono: true, whatsapp: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const filas = ventas.map((v) => ({
      factura: `F${String(v.numero).padStart(7, '0')}`,
      fecha: v.createdAt.toISOString().slice(0, 10),
      cliente: v.cliente?.nombre ?? 'N/D',
      telefono: v.cliente?.whatsapp ?? v.cliente?.telefono ?? '',
      total: Number(v.total),
      saldo: Number(v.saldo),
    }));
    const totalCxC = filas.reduce((a, f) => a + f.saldo, 0);

    return {
      titulo: 'Cuentas por Cobrar',
      subtitulo: `${filas.length} facturas con saldo`,
      columnas: [
        { key: 'factura', label: 'Factura' },
        { key: 'fecha', label: 'Fecha', tipo: 'fecha' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'total', label: 'Total', tipo: 'dinero' },
        { key: 'saldo', label: 'Saldo', tipo: 'dinero' },
      ],
      filas,
      totales: { cliente: 'TOTAL POR COBRAR', saldo: this.round(totalCxC) },
      ...(await this.metaEmpresa()),
    };
  }

  // ---------- FLUJO DE CAJA ----------
  async flujoCaja(q: ReporteQueryDto): Promise<ReporteTabular> {
    const where = this.rangoFecha(q, 'createdAt');
    const sucursalId = await this.sucursalEfectiva(q);
    const pagos = await this.prisma.db.pago.findMany({
      where: {
        ...where,
        venta: this.ventaFiltro(sucursalId),
      },
      include: { metodoPago: { select: { nombre: true } } },
    });

    // Alquiler de silla (Bloque 16): qué parte de cada día es en realidad
    // dinero de un inquilino POR_CAJA — no es del negocio, solo pasa por la
    // gaveta. Mismo criterio que el arqueo de caja: "factura limpia" de un
    // solo inquilino POR_CAJA. Puramente informativo, no cambia "entradas".
    const ventaIds = [...new Set(pagos.map((p) => p.ventaId))];
    const esInquilinoPorCajaPorVenta = await this.calcularVentasDeInquilinoPorCaja(ventaIds);

    // Agrupar por día
    const porDia = new Map<string, { entradas: number; deInquilino: number }>();
    for (const p of pagos) {
      const key = p.createdAt.toISOString().slice(0, 10);
      const cur = porDia.get(key) ?? { entradas: 0, deInquilino: 0 };
      cur.entradas = this.round(cur.entradas + Number(p.monto));
      if (esInquilinoPorCajaPorVenta.has(p.ventaId)) {
        cur.deInquilino = this.round(cur.deInquilino + Number(p.monto));
      }
      porDia.set(key, cur);
    }

    const filas = Array.from(porDia.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, v]) => ({ fecha, entradas: v.entradas, deInquilino: v.deInquilino }));
    const totalEntradas = filas.reduce((a, f) => a + f.entradas, 0);
    const totalInquilino = filas.reduce((a, f) => a + f.deInquilino, 0);

    return {
      titulo: 'Flujo de Caja',
      subtitulo: this.rangoTexto(q),
      columnas: [
        { key: 'fecha', label: 'Fecha', tipo: 'fecha' },
        { key: 'entradas', label: 'Entradas', tipo: 'dinero' },
        { key: 'deInquilino', label: 'De inquilino(s) (incluido en el total)', tipo: 'dinero' },
      ],
      filas,
      totales: {
        fecha: 'TOTAL',
        entradas: this.round(totalEntradas),
        deInquilino: this.round(totalInquilino),
      },
      ...(await this.metaEmpresa()),
    };
  }

  /**
   * Devuelve el subconjunto de `ventaIds` que son "factura limpia" de un
   * único inquilino con flujo POR_CAJA (mismo criterio que
   * CajaService.calcularDesgloseInquilinos) — su dinero entra a la gaveta
   * pero no es del negocio, se desglosa aparte en reportes/arqueo.
   */
  private async calcularVentasDeInquilinoPorCaja(ventaIds: string[]): Promise<Set<string>> {
    if (ventaIds.length === 0) return new Set();

    const ventas = await this.prisma.db.venta.findMany({
      where: { id: { in: ventaIds } },
      select: {
        id: true,
        detalles: { select: { tipo: true, empleadoId: true } },
      },
    });

    const cache = new Map<string, boolean>();
    const esInquilinoPorCaja = async (empleadoId: string): Promise<boolean> => {
      if (cache.has(empleadoId)) return cache.get(empleadoId)!;
      const empleado = await this.prisma.db.empleado.findFirst({
        where: { id: empleadoId },
        select: {
          modeloPago: true,
          alquilerConfig: { select: { flujoDinero: true, activo: true } },
        },
      });
      const resultado =
        empleado?.modeloPago === ModeloPago.ALQUILER &&
        !!empleado.alquilerConfig?.activo &&
        empleado.alquilerConfig.flujoDinero === FlujoDineroAlquiler.POR_CAJA;
      cache.set(empleadoId, resultado);
      return resultado;
    };

    const resultado = new Set<string>();
    for (const v of ventas) {
      const empleadoIds = [
        ...new Set(
          v.detalles
            .filter((d) => d.tipo === LineaTipo.SERVICIO && d.empleadoId)
            .map((d) => d.empleadoId as string),
        ),
      ];
      if (empleadoIds.length !== 1) continue;
      if (await esInquilinoPorCaja(empleadoIds[0])) resultado.add(v.id);
    }
    return resultado;
  }

  // ---------- HISTORIAL DE CORTES DE CAJA ----------
  /**
   * Una fila por SESIÓN de caja cerrada (una apertura hasta su cierre) —
   * nunca se mezclan dos sesiones entre sí. El arqueo de efectivo
   * (esperado/contado/diferencia) y el total facturado ya existían,
   * guardados en `AperturaCaja` al cerrar (`CajaService.cerrar`) — se leen
   * tal cual, sin recalcular. Lo que NO existía es el desglose por forma de
   * pago: se arma acá a partir de los `Pago` de las ventas de ESA
   * `aperturaCajaId` específica (no de todo el rango de fechas ni de toda
   * la sucursal). Las columnas de forma de pago son dinámicas — una por
   * cada método usado en las sesiones del resultado, en vez de una lista
   * fija, para no perder ninguna si la empresa agrega/renombra métodos.
   */
  async cortesDeCaja(q: ReporteQueryDto): Promise<ReporteTabular> {
    const where = this.rangoFecha(q, 'fechaCierre');
    const sucursalId = await this.sucursalEfectiva(q);

    const aperturas = await this.prisma.db.aperturaCaja.findMany({
      where: {
        estado: CajaStatus.CLOSED,
        ...where,
        ...(sucursalId && { caja: { sucursalId } }),
      },
      include: { caja: { select: { nombre: true, sucursal: { select: { nombre: true } } } } },
      orderBy: { fechaCierre: 'desc' },
    });

    if (aperturas.length === 0) {
      return {
        titulo: 'Historial de Cortes de Caja',
        subtitulo: this.rangoTexto(q),
        columnas: [
          { key: 'fechaApertura', label: 'Apertura' },
          { key: 'fechaCierre', label: 'Cierre' },
          { key: 'sucursal', label: 'Sucursal' },
          { key: 'caja', label: 'Caja' },
          { key: 'abiertaPor', label: 'Abierta por' },
          { key: 'cerradaPor', label: 'Cerrada por' },
          { key: 'efectivoEsperado', label: 'Efectivo esperado', tipo: 'dinero' },
          { key: 'efectivoContado', label: 'Efectivo contado', tipo: 'dinero' },
          { key: 'diferencia', label: 'Diferencia', tipo: 'dinero' },
          { key: 'totalFacturado', label: 'Total facturado', tipo: 'dinero' },
        ],
        filas: [],
        ...(await this.metaEmpresa()),
      };
    }

    const aperturaIds = aperturas.map((a) => a.id);

    // Desglose por forma de pago: ventas no anuladas de estas sesiones, con
    // sus pagos. Igual que DetalleVenta/Pago en el resto del sistema, se
    // llega a ellos SOLO a través de una Venta ya aislada por tenant — acá
    // además queda acotado a las aperturaCajaId del resultado, así que una
    // sesión nunca ve pagos de otra.
    const ventas = await this.prisma.db.venta.findMany({
      where: { aperturaCajaId: { in: aperturaIds }, estado: { not: VentaStatus.ANULADA } },
      select: {
        aperturaCajaId: true,
        pagos: { select: { monto: true, metodoPago: { select: { nombre: true } } } },
      },
    });

    const porSesion = new Map<string, Map<string, number>>();
    const metodosVistos: string[] = [];
    for (const v of ventas) {
      if (!v.aperturaCajaId) continue;
      const mapa = porSesion.get(v.aperturaCajaId) ?? new Map<string, number>();
      for (const p of v.pagos) {
        const nombre = p.metodoPago?.nombre ?? 'Sin método';
        if (!metodosVistos.includes(nombre)) metodosVistos.push(nombre);
        mapa.set(nombre, this.round((mapa.get(nombre) ?? 0) + Number(p.monto)));
      }
      porSesion.set(v.aperturaCajaId, mapa);
    }
    metodosVistos.sort((a, b) => a.localeCompare(b, 'es'));

    // "Cerrada por": AperturaCaja no guarda quién la cerró (solo quién la
    // abrió, en usuarioId) — se resuelve desde el registro de Auditoría
    // (CAJA / AperturaCaja / CLOSE) que ya se genera al cerrar. Sesiones
    // cerradas antes de que existiera ese registro muestran "—".
    const cierres = await this.prisma.db.auditLog.findMany({
      where: { entidad: 'AperturaCaja', accion: 'CLOSE', entidadId: { in: aperturaIds } },
      select: { entidadId: true, usuarioId: true },
    });
    const cerradaPorMap = new Map(cierres.map((c) => [c.entidadId, c.usuarioId]));

    const usuarioIds = [
      ...new Set([
        ...aperturas.map((a) => a.usuarioId),
        ...[...cerradaPorMap.values()].filter((x): x is string => !!x),
      ]),
    ];
    const usuarios = await this.prisma.db.usuario.findMany({
      where: { id: { in: usuarioIds } },
      select: { id: true, nombre: true },
    });
    const nombreUsuario = new Map(usuarios.map((u) => [u.id, u.nombre]));

    const filas = aperturas.map((a) => {
      const pagosSesion = porSesion.get(a.id) ?? new Map<string, number>();
      const cerradaPorId = cerradaPorMap.get(a.id);
      const fila: Record<string, unknown> = {
        fechaApertura: this.fechaHora(a.fechaApertura),
        fechaCierre: this.fechaHora(a.fechaCierre),
        sucursal: a.caja.sucursal?.nombre ?? 'N/D',
        caja: a.caja.nombre,
        abiertaPor: nombreUsuario.get(a.usuarioId) ?? 'N/D',
        cerradaPor: cerradaPorId ? (nombreUsuario.get(cerradaPorId) ?? 'N/D') : '—',
        efectivoEsperado: a.efectivoEsperado !== null ? Number(a.efectivoEsperado) : null,
        efectivoContado: a.efectivoContado !== null ? Number(a.efectivoContado) : null,
        diferencia: a.diferencia !== null ? Number(a.diferencia) : null,
        totalFacturado: a.totalFacturado !== null ? Number(a.totalFacturado) : null,
      };
      for (const metodo of metodosVistos) {
        fila[`metodo_${metodo}`] = this.round(pagosSesion.get(metodo) ?? 0);
      }
      return fila;
    });

    const columnas: ReporteTabular['columnas'] = [
      { key: 'fechaApertura', label: 'Apertura', tipo: 'fecha' },
      { key: 'fechaCierre', label: 'Cierre', tipo: 'fecha' },
      { key: 'sucursal', label: 'Sucursal' },
      { key: 'caja', label: 'Caja' },
      { key: 'abiertaPor', label: 'Abierta por' },
      { key: 'cerradaPor', label: 'Cerrada por' },
      { key: 'efectivoEsperado', label: 'Efectivo esperado', tipo: 'dinero' },
      { key: 'efectivoContado', label: 'Efectivo contado', tipo: 'dinero' },
      { key: 'diferencia', label: 'Diferencia', tipo: 'dinero' },
      ...metodosVistos.map((m) => ({ key: `metodo_${m}`, label: m, tipo: 'dinero' as const })),
      { key: 'totalFacturado', label: 'Total facturado', tipo: 'dinero' as const },
    ];

    const totales: Record<string, unknown> = {
      sucursal: `${filas.length} sesión${filas.length === 1 ? '' : 'es'}`,
      totalFacturado: this.round(filas.reduce((a, f) => a + Number(f.totalFacturado ?? 0), 0)),
      diferencia: this.round(filas.reduce((a, f) => a + Number(f.diferencia ?? 0), 0)),
    };
    for (const metodo of metodosVistos) {
      totales[`metodo_${metodo}`] = this.round(
        filas.reduce((a, f) => a + Number(f[`metodo_${metodo}`] ?? 0), 0),
      );
    }

    return {
      titulo: 'Historial de Cortes de Caja',
      subtitulo: this.rangoTexto(q),
      columnas,
      filas,
      totales,
      ...(await this.metaEmpresa()),
    };
  }

  // ---------- AGENDA DIARIA ----------
  async agendaDiaria(q: ReporteQueryDto): Promise<ReporteTabular> {
    const fecha = q.desde ?? new Date().toISOString().slice(0, 10);
    const dayStart = new Date(`${fecha}T00:00:00`);
    const dayEnd = new Date(`${fecha}T23:59:59.999`);
    const sucursalId = await this.sucursalEfectiva(q);

    const citas = await this.prisma.db.cita.findMany({
      where: {
        inicio: { gte: dayStart, lte: dayEnd },
        ...(sucursalId && { sucursalId }),
        ...(q.empleadoId && { empleadoId: q.empleadoId }),
      },
      include: {
        cliente: { select: { nombre: true } },
        empleado: { select: { nombre: true } },
        servicios: { include: { servicio: { select: { nombre: true } } } },
      },
      orderBy: { inicio: 'asc' },
    });

    const filas = citas.map((c) => ({
      hora: this.hhmm(c.inicio),
      cliente: c.cliente?.nombre ?? 'N/D',
      empleado: c.empleado?.nombre ?? 'N/D',
      servicios: c.servicios.map((s) => s.servicio?.nombre).join(', '),
      estado: ENUM_TO_ESTADO_ES[c.estado as CitaStatus],
    }));

    return {
      titulo: 'Agenda Diaria',
      subtitulo: fecha,
      columnas: [
        { key: 'hora', label: 'Hora' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'empleado', label: 'Empleado' },
        { key: 'servicios', label: 'Servicios' },
        { key: 'estado', label: 'Estado' },
      ],
      filas,
      totales: { cliente: `${filas.length} citas` },
      ...(await this.metaEmpresa()),
    };
  }

  // ---------- META EMPRESA ----------
  private async metaEmpresa(): Promise<Pick<ReporteTabular, 'empresa' | 'generadoPor'>> {
    const store = tenantContext.getStore();
    if (!store?.empresaId) return {};

    const emp = await this.prisma.empresa.findUnique({
      where: { id: store.empresaId },
      include: {
        sucursales: { where: { esPrincipal: true, activo: true }, take: 1 },
      },
    });

    const user = await this.prisma.db.usuario.findFirst({
      where: { id: store.usuarioId },
      select: { nombre: true },
    });

    return {
      empresa: {
        nombre: emp?.nombre ?? '',
        sucursal: emp?.sucursales?.[0]?.nombre ?? undefined,
        telefono: emp?.telefono ?? undefined,
        direccion: emp?.direccion ?? undefined,
        rnc: emp?.rnc ?? undefined,
      },
      generadoPor: user?.nombre ?? undefined,
    };
  }

  // ---------- helpers ----------
  private rangoFecha(q: ReporteQueryDto, campo: string) {
    if (!q.desde && !q.hasta) return {};
    return {
      [campo]: {
        ...(q.desde && { gte: new Date(`${q.desde}T00:00:00`) }),
        ...(q.hasta && { lte: new Date(`${q.hasta}T23:59:59.999`) }),
      },
    };
  }

  private rangoTexto(q: ReporteQueryDto): string {
    if (q.desde && q.hasta) return `Del ${q.desde} al ${q.hasta}`;
    if (q.desde) return `Desde ${q.desde}`;
    if (q.hasta) return `Hasta ${q.hasta}`;
    return 'Todo el período';
  }

  private hhmm(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /**
   * Fecha + hora legible ("11/09/2026 14:12"). Se usa en vez de `tipo:
   * 'fecha'` (que en el frontend de Reportes espera un string ya formateado
   * tipo YYYY-MM-DD, sin hora) porque en Cortes de Caja la hora sí importa
   * — puede haber más de una sesión el mismo día en la misma caja.
   */
  private fechaHora(d: Date | null): string {
    if (!d) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()} ${this.hhmm(d)}`;
  }

  private round(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
}
