import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { getEmpresaId, getCurrentUser } from '../../core/tenant/tenant-context';
import { SucursalScopeService } from '../../core/tenant/sucursal-scope.service';
import { InquilinoService } from '../../core/auth/inquilino.service';
import { AuditService } from '../../core/audit/audit.service';
import {
  UpsertAlquilerConfigDto,
  RegistrarAbonoAlquilerDto,
  ListarDeudasFiltro,
  CrearDeudaPruebaDto,
} from './dto/alquiler.dto';
import { EstadoDeudaAlquiler, Prisma } from '@prisma/client';

/**
 * Pieza 1 del alquiler de silla: solo configuración + estructura de la
 * cuenta por cobrar. Nada aquí genera deuda automáticamente todavía — eso
 * es Pieza 2, cuando el POS sepa que vendió algo de un empleado ALQUILER.
 */
@Injectable()
export class AlquilerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inquilinoSvc: InquilinoService,
    private readonly sucursalScope: SucursalScopeService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Config ----------

  private async assertEmpleadoExiste(empleadoId: string) {
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id: empleadoId },
      select: { id: true, nombre: true },
    });
    if (!empleado) throw new NotFoundException('Empleado no encontrado');
    return empleado;
  }

  async getConfig(empleadoId: string) {
    return this.prisma.db.alquilerConfig.findFirst({ where: { empleadoId } });
  }

  async upsertConfig(empleadoId: string, dto: UpsertAlquilerConfigDto) {
    const empleado = await this.assertEmpleadoExiste(empleadoId);
    const empresaId = getEmpresaId();

    const existing = await this.prisma.db.alquilerConfig.findFirst({
      where: { empleadoId },
      select: { id: true },
    });

    const data = {
      tipoCuota: dto.tipoCuota,
      flujoDinero: dto.flujoDinero,
      montoPorServicio: dto.montoPorServicio ?? null,
      montoRenta: dto.montoRenta ?? null,
      periodoRenta: dto.periodoRenta ?? null,
      activo: dto.activo ?? true,
    };

    const resultado = existing
      ? await this.prisma.db.alquilerConfig.update({ where: { id: existing.id }, data })
      : await this.prisma.db.alquilerConfig.create({ data: { empresaId, empleadoId, ...data } });

    await this.audit.log({
      modulo: 'EQUIPO',
      entidad: 'AlquilerConfig',
      entidadId: empleadoId,
      accion: 'UPDATE',
      datosDespues: {
        empleadoNombre: empleado.nombre,
        tipoCuota: dto.tipoCuota,
        flujoDinero: dto.flujoDinero,
        activo: dto.activo ?? true,
      },
    });

    return resultado;
  }

  // ---------- Deudas ----------

  /**
   * Alquiler de silla (Pieza 3): si quien consulta es un inquilino, se
   * ignora el empleadoId del query y se fuerza al suyo — nunca ve deudas
   * de otro inquilino. El dueño/admin sigue viendo las de todos.
   */
  async listarDeudas(query: ListarDeudasFiltro) {
    const inquilino = await this.inquilinoSvc.resolverInquilino();
    const empleadoId = inquilino.esInquilino
      ? inquilino.empleadoId!
      : query.empleadoId;

    // Aislamiento por sucursal: un ADMIN asignado a una sucursal solo ve las
    // deudas de alquiler de los inquilinos de esa sucursal (DeudaAlquiler no
    // tiene sucursalId propio → se filtra vía el empleado).
    const suc = await this.sucursalScope.whereSucursal();

    return this.prisma.db.deudaAlquiler.findMany({
      where: {
        ...(empleadoId && { empleadoId }),
        ...(query.estado && { estado: query.estado }),
        ...(suc.sucursalId ? { empleado: { sucursalId: suc.sucursalId } } : {}),
      },
      include: { empleado: { select: { id: true, nombre: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findDeuda(id: string) {
    const deuda = await this.prisma.db.deudaAlquiler.findFirst({
      where: { id },
      include: { abonos: { orderBy: { createdAt: 'desc' } } },
    });
    if (!deuda) throw new NotFoundException('Deuda no encontrada');

    const inquilino = await this.inquilinoSvc.resolverInquilino();
    if (inquilino.esInquilino && deuda.empleadoId !== inquilino.empleadoId) {
      throw new NotFoundException('Deuda no encontrada');
    }
    return deuda;
  }

  /** Registra un abono contra una deuda. Mismo patrón que Venta.registrarAbono. */
  async registrarAbono(deudaId: string, dto: RegistrarAbonoAlquilerDto) {
    const deuda = await this.prisma.db.deudaAlquiler.findFirst({ where: { id: deudaId } });
    if (!deuda) throw new NotFoundException('Deuda no encontrada');
    if (deuda.estado === EstadoDeudaAlquiler.ANULADA) {
      throw new BadRequestException('La deuda está anulada');
    }
    const saldoActual = Number(deuda.saldo);
    if (saldoActual <= 0) {
      throw new BadRequestException('La deuda no tiene saldo pendiente');
    }
    if (dto.monto > saldoActual + 0.01) {
      throw new BadRequestException(
        `El abono (${dto.monto}) excede el saldo pendiente (${saldoActual})`,
      );
    }
    if (dto.metodoPagoId) {
      const metodo = await this.prisma.db.metodoPago.findFirst({
        where: { id: dto.metodoPagoId },
        select: { id: true },
      });
      if (!metodo) throw new BadRequestException('Método de pago no válido');
    }

    await this.prisma.$transaction((tx) =>
      this.aplicarAbonoEnTx(tx, deuda, dto.monto, dto.metodoPagoId, dto.nota),
    );

    return this.findDeuda(deudaId);
  }

  /**
   * Cobro general: reparte un monto entre todas las cuotas abiertas del
   * inquilino, de la más antigua a la más nueva, dentro de UNA transacción.
   * Usa el mismo aplicarAbonoEnTx que el abono individual — no hay dos
   * formas de registrar dinero.
   */
  async registrarAbonoGeneral(empleadoId: string, dto: RegistrarAbonoAlquilerDto) {
    const empresaId = getEmpresaId();
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id: empleadoId },
      select: { id: true },
    });
    if (!empleado) throw new NotFoundException('Inquilino no encontrado');

    if (dto.metodoPagoId) {
      const metodo = await this.prisma.db.metodoPago.findFirst({
        where: { id: dto.metodoPagoId },
        select: { id: true },
      });
      if (!metodo) throw new BadRequestException('Método de pago no válido');
    }

    return this.prisma.$transaction(async (tx) => {
      const deudas = await tx.deudaAlquiler.findMany({
        where: {
          empresaId,
          empleadoId,
          estado: { in: [EstadoDeudaAlquiler.PENDIENTE, EstadoDeudaAlquiler.ABONO_PARCIAL] },
        },
        orderBy: { createdAt: 'asc' },
      });
      const saldoTotal = this.round(deudas.reduce((s, d) => s + Number(d.saldo), 0));
      if (saldoTotal <= 0) {
        throw new BadRequestException('El inquilino no tiene saldo pendiente');
      }
      if (dto.monto > saldoTotal + 0.01) {
        throw new BadRequestException(
          `El monto (${dto.monto}) excede el saldo total del inquilino (${saldoTotal})`,
        );
      }

      let restante = dto.monto;
      const aplicado: {
        deudaId: string; concepto: string; aplicado: number;
        saldoRestante: number; estado: EstadoDeudaAlquiler;
      }[] = [];
      for (const d of deudas) {
        if (restante <= 0.005) break;
        const aplica = this.round(Math.min(restante, Number(d.saldo)));
        if (aplica <= 0) continue;
        const r = await this.aplicarAbonoEnTx(tx, d, aplica, dto.metodoPagoId, dto.nota);
        restante = this.round(restante - aplica);
        aplicado.push({
          deudaId: d.id,
          concepto: d.concepto,
          aplicado: aplica,
          saldoRestante: r.nuevoSaldo,
          estado: r.nuevoEstado,
        });
      }

      const totalAplicado = this.round(dto.monto - restante);
      return {
        aplicado,
        totalAplicado,
        saldoTotalAntes: saldoTotal,
        saldoTotalDespues: this.round(saldoTotal - totalAplicado),
      };
    });
  }

  private async aplicarAbonoEnTx(
    tx: Prisma.TransactionClient,
    deuda: { id: string; montoTotal: Prisma.Decimal; montoPagado: Prisma.Decimal },
    monto: number,
    metodoPagoId?: string,
    nota?: string,
  ) {
    const empresaId = getEmpresaId();
    const user = getCurrentUser();
    const nuevoPagado = this.round(Number(deuda.montoPagado) + monto);
    const nuevoSaldo = this.round(Number(deuda.montoTotal) - nuevoPagado);
    const nuevoEstado =
      nuevoSaldo <= 0.01 ? EstadoDeudaAlquiler.SALDADA : EstadoDeudaAlquiler.ABONO_PARCIAL;

    await tx.abonoAlquiler.create({
      data: {
        empresaId,
        deudaAlquilerId: deuda.id,
        monto,
        metodoPagoId,
        nota,
        creadoPor: user.usuarioId,
      },
    });
    await tx.deudaAlquiler.update({
      where: { id: deuda.id },
      data: { montoPagado: nuevoPagado, saldo: nuevoSaldo, estado: nuevoEstado },
    });
    return { nuevoSaldo, nuevoEstado };
  }

  // ---------- dev ----------

  async crearDeudaPrueba(dto: CrearDeudaPruebaDto) {
    await this.assertEmpleadoExiste(dto.empleadoId);
    const empresaId = getEmpresaId();
    const montoTotal = dto.montoTotal ?? 500;

    return this.prisma.db.deudaAlquiler.create({
      data: {
        empresaId,
        empleadoId: dto.empleadoId,
        concepto: dto.concepto ?? 'Deuda de prueba',
        montoTotal,
        montoPagado: 0,
        saldo: montoTotal,
        estado: EstadoDeudaAlquiler.PENDIENTE,
      },
    });
  }

  private round(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
}
