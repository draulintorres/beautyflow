import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  CreateCajaDto,
  AbrirCajaDto,
  CerrarCajaDto,
} from './dto/caja.dto';
import { getCurrentUser } from '../../core/tenant/tenant-context';
import { SucursalScopeService } from '../../core/tenant/sucursal-scope.service';
import { AuditService } from '../../core/audit/audit.service';
import { CajaStatus, VentaStatus, ModeloPago, FlujoDineroAlquiler, LineaTipo } from '@prisma/client';

@Injectable()
export class CajaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sucursalScope: SucursalScopeService,
    private readonly audit: AuditService,
  ) {}

  // ---------- CAJAS (definición) ----------
  async findAll(sucursalId?: string) {
    // Aislamiento: un usuario no-OWNER asignado a una sucursal solo ve las
    // cajas de esa sucursal (ignora el sucursalId del query).
    const suc = await this.sucursalScope.resolve();
    const efectiva = suc.scoped && suc.sucursalId ? suc.sucursalId : sucursalId;
    return this.prisma.db.caja.findMany({
      where: { ...(efectiva && { sucursalId: efectiva }) },
      orderBy: { nombre: 'asc' },
    });
  }

  async create(dto: CreateCajaDto) {
    const suc = await this.prisma.db.sucursal.findFirst({
      where: { id: dto.sucursalId },
      select: { id: true },
    });
    if (!suc) throw new BadRequestException('Sucursal no válida');
    return this.prisma.db.caja.create({
      data: { nombre: dto.nombre, sucursalId: dto.sucursalId } as any,
    });
  }

  /**
   * Estado de caja para la pantalla de POS: si hay una sesión abierta ahora
   * mismo (con qué caja, monto inicial, desde cuándo) y la lista de cajas
   * disponibles para abrir una nueva si no hay ninguna abierta. El frontend
   * usa esto para decidir si mostrar "Abrir caja" o "Cerrar caja".
   */
  async estado() {
    // Aislamiento: un usuario no-OWNER asignado a una sucursal solo ve la
    // caja abierta y las cajas de SU sucursal.
    const suc = await this.sucursalScope.resolve();
    const sucFiltro = suc.scoped && suc.sucursalId ? { sucursalId: suc.sucursalId } : {};

    const abierta = await this.prisma.db.aperturaCaja.findFirst({
      where: {
        estado: CajaStatus.OPEN,
        ...(suc.scoped && suc.sucursalId ? { caja: { sucursalId: suc.sucursalId } } : {}),
      },
      orderBy: { fechaApertura: 'desc' },
      include: { caja: { select: { nombre: true } } },
    });
    const cajas = await this.prisma.db.caja.findMany({
      where: { ...sucFiltro },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, sucursalId: true },
    });
    return {
      cajaAbierta: abierta
        ? {
            aperturaId: abierta.id,
            cajaId: abierta.cajaId,
            cajaNombre: abierta.caja.nombre,
            montoInicial: Number(abierta.montoInicial),
            fechaApertura: abierta.fechaApertura,
          }
        : null,
      cajas,
    };
  }

  // ---------- APERTURA ----------
  async abrir(dto: AbrirCajaDto) {
    const empresaId = getCurrentUser().empresaId;
    const usuarioId = getCurrentUser().usuarioId;

    const caja = await this.prisma.db.caja.findFirst({
      where: { id: dto.cajaId },
    });
    if (!caja) throw new NotFoundException('Caja no encontrada');

    // No permitir dos sesiones abiertas en la misma caja
    const abierta = await this.prisma.db.aperturaCaja.findFirst({
      where: { cajaId: dto.cajaId, estado: CajaStatus.OPEN },
    });
    if (abierta) {
      throw new ConflictException('La caja ya tiene una sesión abierta');
    }

    const apertura = await this.prisma.$transaction(async (tx) => {
      await tx.caja.update({
        where: { id: dto.cajaId },
        data: { estado: CajaStatus.OPEN },
      });
      return tx.aperturaCaja.create({
        data: {
          empresaId,
          cajaId: dto.cajaId,
          usuarioId,
          montoInicial: dto.montoInicial,
          estado: CajaStatus.OPEN,
        },
      });
    });

    await this.audit.log({
      modulo: 'CAJA',
      entidad: 'AperturaCaja',
      entidadId: apertura.id,
      accion: 'OPEN',
      datosDespues: { cajaNombre: caja.nombre, montoInicial: dto.montoInicial },
    });

    return apertura;
  }

  // ---------- CIERRE / ARQUEO ----------
  async cerrar(aperturaId: string, dto: CerrarCajaDto) {
    const apertura = await this.prisma.db.aperturaCaja.findFirst({
      where: { id: aperturaId },
      include: { caja: { select: { nombre: true } } },
    });
    if (!apertura) throw new NotFoundException('Sesión de caja no encontrada');
    if (apertura.estado === CajaStatus.CLOSED) {
      throw new BadRequestException('La sesión de caja ya está cerrada');
    }

    // Ventas de la sesión
    const ventas = await this.prisma.db.venta.findMany({
      where: { aperturaCajaId: aperturaId, estado: { not: VentaStatus.ANULADA } },
      include: {
        pagos: { include: { metodoPago: { select: { esEfectivo: true } } } },
      },
    });

    let totalFacturado = 0;
    let totalFiao = 0;
    let efectivoVentas = 0;

    for (const v of ventas) {
      totalFacturado += Number(v.total);
      totalFiao += Number(v.saldo);
      for (const p of v.pagos) {
        if (p.metodoPago?.esEfectivo) {
          efectivoVentas += Number(p.monto);
        }
      }
    }

    const montoInicial = Number(apertura.montoInicial);
    const efectivoEsperado = this.round(montoInicial + efectivoVentas);
    const diferencia = this.round(dto.efectivoContado - efectivoEsperado);

    // Alquiler de silla (Pieza 2b): desglose informativo — cuánto de lo de
    // arriba es en realidad dinero de inquilinos POR_CAJA, no del salón.
    const desgloseInquilinos = await this.calcularDesgloseInquilinos(
      ventas.map((v) => v.id),
    );

    const cerrada = await this.prisma.$transaction(async (tx) => {
      await tx.caja.update({
        where: { id: apertura.cajaId },
        data: { estado: CajaStatus.CLOSED },
      });
      return tx.aperturaCaja.update({
        where: { id: aperturaId },
        data: {
          estado: CajaStatus.CLOSED,
          fechaCierre: new Date(),
          efectivoEsperado,
          efectivoContado: dto.efectivoContado,
          diferencia,
          totalFacturado: this.round(totalFacturado),
          totalFiao: this.round(totalFiao),
        },
      });
    });

    // Auditoría: la diferencia entre lo esperado y lo contado es justo lo
    // que un dueño necesita ver sin tener que abrir el arqueo completo —
    // una diferencia distinta de 0 es la señal de alerta más directa.
    await this.audit.log({
      modulo: 'CAJA',
      entidad: 'AperturaCaja',
      entidadId: aperturaId,
      accion: 'CLOSE',
      datosDespues: {
        cajaNombre: (apertura as any).caja?.nombre,
        efectivoEsperado,
        efectivoContado: dto.efectivoContado,
        diferencia,
        totalFacturado: this.round(totalFacturado),
        numVentas: ventas.length,
      },
    });

    return {
      ...cerrada,
      arqueo: {
        montoInicial,
        efectivoVentas: this.round(efectivoVentas),
        efectivoEsperado,
        efectivoContado: dto.efectivoContado,
        diferencia,
        totalFacturado: this.round(totalFacturado),
        totalFiao: this.round(totalFiao),
        numVentas: ventas.length,
        ...desgloseInquilinos,
      },
    };
  }

  /** Estado actual de una sesión abierta (resumen en vivo). */
  async resumen(aperturaId: string) {
    const apertura = await this.prisma.db.aperturaCaja.findFirst({
      where: { id: aperturaId },
    });
    if (!apertura) throw new NotFoundException('Sesión de caja no encontrada');

    const ventas = await this.prisma.db.venta.findMany({
      where: { aperturaCajaId: aperturaId, estado: { not: VentaStatus.ANULADA } },
      select: { id: true, total: true, saldo: true },
    });
    const totalFacturado = ventas.reduce((a, v) => a + Number(v.total), 0);
    const totalFiao = ventas.reduce((a, v) => a + Number(v.saldo), 0);
    const desgloseInquilinos = await this.calcularDesgloseInquilinos(
      ventas.map((v) => v.id),
    );

    return {
      aperturaId,
      estado: apertura.estado,
      montoInicial: Number(apertura.montoInicial),
      totalFacturado: this.round(totalFacturado),
      totalFiao: this.round(totalFiao),
      numVentas: ventas.length,
      ...desgloseInquilinos,
    };
  }

  /**
   * Alquiler de silla (Pieza 2b): de las ventas dadas, cuánto es en
   * realidad de inquilinos POR_CAJA — dinero que está en la gaveta pero no
   * es del salón. Puramente informativo, NO cambia totalFacturado/
   * efectivoVentas/totalFiao ni se persiste en AperturaCaja — el arqueo
   * físico sigue siendo el mismo de siempre, esto es un renglón aparte.
   * Una venta cuenta aquí solo si TODAS sus líneas de servicio son de UN
   * mismo empleado inquilino POR_CAJA — la "factura limpia" (Misión A) ya
   * garantiza que si hay un inquilino en la venta, es así.
   */
  private async calcularDesgloseInquilinos(
    ventaIds: string[],
  ): Promise<{ totalInquilinosPorCaja: number; efectivoInquilinosPorCaja: number }> {
    if (ventaIds.length === 0) {
      return { totalInquilinosPorCaja: 0, efectivoInquilinosPorCaja: 0 };
    }

    const ventas = await this.prisma.db.venta.findMany({
      where: { id: { in: ventaIds } },
      select: {
        id: true,
        total: true,
        detalles: { select: { tipo: true, empleadoId: true } },
        pagos: { select: { monto: true, metodoPago: { select: { esEfectivo: true } } } },
      },
    });

    const esInquilinoPorCajaCache = new Map<string, boolean>();
    const esInquilinoPorCaja = async (empleadoId: string): Promise<boolean> => {
      if (esInquilinoPorCajaCache.has(empleadoId)) {
        return esInquilinoPorCajaCache.get(empleadoId)!;
      }
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
      esInquilinoPorCajaCache.set(empleadoId, resultado);
      return resultado;
    };

    let totalInquilinosPorCaja = 0;
    let efectivoInquilinosPorCaja = 0;

    for (const v of ventas) {
      const empleadoIds = [
        ...new Set(
          v.detalles
            .filter((d) => d.tipo === LineaTipo.SERVICIO && d.empleadoId)
            .map((d) => d.empleadoId as string),
        ),
      ];
      if (empleadoIds.length !== 1) continue; // no es una factura limpia de un solo inquilino
      if (!(await esInquilinoPorCaja(empleadoIds[0]))) continue;

      totalInquilinosPorCaja += Number(v.total);
      for (const p of v.pagos) {
        if (p.metodoPago?.esEfectivo) efectivoInquilinosPorCaja += Number(p.monto);
      }
    }

    return {
      totalInquilinosPorCaja: this.round(totalInquilinosPorCaja),
      efectivoInquilinosPorCaja: this.round(efectivoInquilinosPorCaja),
    };
  }

  private round(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
}
