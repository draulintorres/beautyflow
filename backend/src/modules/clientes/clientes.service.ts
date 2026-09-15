import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  CreateClienteDto,
  UpdateClienteDto,
  ClienteEtiqueta,
} from './dto/cliente.dto';
import { getEmpresaId } from '../../core/tenant/tenant-context';
import { SucursalScopeService } from '../../core/tenant/sucursal-scope.service';
import { CitaStatus, VentaStatus } from '@prisma/client';
import { ENUM_TO_ESTADO_ES } from '../agenda/dto/cita.dto';

@Injectable()
export class ClientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sucursalScope: SucursalScopeService,
  ) {}

  // ---------- LISTAR (con filtro de etiqueta y búsqueda) ----------
  async findAll(filtros: {
    q?: string;
    etiqueta?: ClienteEtiqueta;
    activo?: boolean;
  }) {
    const clientes = await this.prisma.db.cliente.findMany({
      where: {
        ...(filtros.activo !== undefined && { activo: filtros.activo }),
        ...(filtros.q && {
          OR: [
            { nombre: { contains: filtros.q, mode: 'insensitive' } },
            { apellido: { contains: filtros.q, mode: 'insensitive' } },
            { telefono: { contains: filtros.q } },
            { whatsapp: { contains: filtros.q } },
          ],
        }),
      },
      include: { _count: { select: { citas: true, ventas: true } } },
      orderBy: { nombre: 'asc' },
    });

    const empresa = await this.getEmpresaConfig();

    // Gasto acumulado por cliente (una sola consulta agregada para toda la lista)
    const ids = clientes.map((c) => c.id);
    const gastos = await this.prisma.db.venta.groupBy({
      by: ['clienteId'],
      where: {
        clienteId: { in: ids },
        estado: { not: VentaStatus.ANULADA },
      },
      _sum: { total: true },
    });
    const gastoMap = new Map<string, number>(
      gastos.map((g) => [g.clienteId as string, Number(g._sum.total ?? 0)]),
    );

    const enriquecidos = clientes.map((c) =>
      this.enrich(c, empresa, gastoMap.get(c.id) ?? 0),
    );

    // Filtrar por etiqueta calculada
    if (filtros.etiqueta) {
      return enriquecidos.filter((c) =>
        c.etiquetas.includes(filtros.etiqueta as ClienteEtiqueta),
      );
    }
    return enriquecidos;
  }

  async findOne(id: string) {
    const cliente = await this.prisma.db.cliente.findFirst({
      where: { id },
      include: { _count: { select: { citas: true, ventas: true } } },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    const empresa = await this.getEmpresaConfig();
    const gasto = await this.calcGastoAcumulado(id);
    return this.enrich(cliente, empresa, gasto);
  }

  async create(dto: CreateClienteDto) {
    // Evitar duplicado por teléfono dentro de la empresa
    if (dto.telefono) {
      const existe = await this.prisma.db.cliente.findFirst({
        where: { telefono: dto.telefono },
        select: { id: true },
      });
      if (existe) {
        throw new ConflictException(
          'Ya existe un cliente con ese teléfono en la empresa',
        );
      }
    }

    const empresa = await this.getEmpresaConfig();
    const cliente = await this.prisma.db.cliente.create({
      data: {
        nombre: dto.nombre,
        apellido: dto.apellido,
        telefono: dto.telefono,
        whatsapp: dto.whatsapp ?? dto.telefono, // por defecto el mismo número
        email: dto.email,
        fechaNac: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
        sexo: dto.sexo,
        cedula: dto.cedula,
        direccion: dto.direccion,
        notas: dto.notas,
        alergias: dto.alergias,
        permiteFiao: dto.permiteFiao ?? empresa.permiteFiao,
        limiteCredito: dto.limiteCredito ?? empresa.limiteCreditoDefault,
        activo: dto.activo ?? true,
      } as any,
      include: { _count: { select: { citas: true, ventas: true } } },
    });
    return this.enrich(cliente, empresa, 0);
  }

  async update(id: string, dto: UpdateClienteDto) {
    await this.ensureExists(id);
    const cliente = await this.prisma.db.cliente.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.apellido !== undefined && { apellido: dto.apellido }),
        ...(dto.telefono !== undefined && { telefono: dto.telefono }),
        ...(dto.whatsapp !== undefined && { whatsapp: dto.whatsapp }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.fechaNacimiento !== undefined && {
          fechaNac: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : null,
        }),
        ...(dto.sexo !== undefined && { sexo: dto.sexo }),
        ...(dto.cedula !== undefined && { cedula: dto.cedula }),
        ...(dto.direccion !== undefined && { direccion: dto.direccion }),
        ...(dto.notas !== undefined && { notas: dto.notas }),
        ...(dto.alergias !== undefined && { alergias: dto.alergias }),
        ...(dto.permiteFiao !== undefined && { permiteFiao: dto.permiteFiao }),
        ...(dto.limiteCredito !== undefined && {
          limiteCredito: dto.limiteCredito,
        }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
      },
      include: { _count: { select: { citas: true, ventas: true } } },
    });
    const empresa = await this.getEmpresaConfig();
    const gasto = await this.calcGastoAcumulado(id);
    return this.enrich(cliente, empresa, gasto);
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.db.cliente.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
    return { success: true };
  }

  // ---------- HISTORIAL DE CITAS ----------
  async getCitas(id: string) {
    await this.ensureExists(id);
    // Aislamiento por sucursal: el historial de citas del cliente que ve un
    // usuario aislado es solo el de SU sucursal.
    const suc = await this.sucursalScope.whereSucursal();
    const citas = await this.prisma.db.cita.findMany({
      where: { clienteId: id, ...suc },
      include: {
        empleado: { select: { nombre: true } },
        servicios: {
          include: { servicio: { select: { nombre: true } } },
        },
      },
      orderBy: { inicio: 'desc' },
    });

    return citas.map((c) => ({
      id: c.id,
      fecha: c.inicio.toISOString().slice(0, 10),
      servicios: c.servicios.map((s) => s.servicio?.nombre).filter(Boolean),
      empleado: c.empleado?.nombre,
      estado: ENUM_TO_ESTADO_ES[c.estado as CitaStatus],
      total: Number(c.total),
    }));
  }

  // ---------- HISTORIAL DE COMPRAS ----------
  async getCompras(id: string) {
    await this.ensureExists(id);
    // Aislamiento por sucursal: solo las compras hechas en la sucursal del
    // usuario aislado.
    const suc = await this.sucursalScope.whereSucursal();
    const ventas = await this.prisma.db.venta.findMany({
      where: { clienteId: id, estado: { not: VentaStatus.OPEN }, ...suc },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        numero: true,
        createdAt: true,
        total: true,
        saldo: true,
        estado: true,
      },
    });

    return ventas.map((v) => ({
      id: v.id,
      factura: `F${String(v.numero).padStart(7, '0')}`,
      fecha: v.createdAt.toISOString().slice(0, 10),
      total: Number(v.total),
      balancePendiente: Number(v.saldo),
      estado: v.estado,
    }));
  }

  // ---------- BALANCE ----------
  async getBalance(id: string) {
    const cliente = await this.prisma.db.cliente.findFirst({
      where: { id },
      select: { id: true, limiteCredito: true, permiteFiao: true },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const balancePendiente = await this.calcDeuda(id);
    const limiteCredito = Number(cliente.limiteCredito);

    return {
      limiteCredito,
      balancePendiente,
      disponible: Math.max(0, limiteCredito - balancePendiente),
      permiteFiao: cliente.permiteFiao,
    };
  }

  // ---------- helpers ----------
  private async ensureExists(id: string) {
    const c = await this.prisma.db.cliente.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!c) throw new NotFoundException('Cliente no encontrado');
  }

  /** Deuda real = suma de saldos de ventas pendientes/parciales. */
  private async calcDeuda(clienteId: string): Promise<number> {
    const agg = await this.prisma.db.venta.aggregate({
      where: {
        clienteId,
        estado: {
          in: [VentaStatus.PENDIENTE, VentaStatus.ABONO_PARCIAL],
        },
      },
      _sum: { saldo: true },
    });
    return Number(agg._sum.saldo ?? 0);
  }

  /** Gasto acumulado = suma de totales de ventas no anuladas. */
  private async calcGastoAcumulado(clienteId: string): Promise<number> {
    const agg = await this.prisma.db.venta.aggregate({
      where: { clienteId, estado: { not: VentaStatus.ANULADA } },
      _sum: { total: true },
    });
    return Number(agg._sum.total ?? 0);
  }

  private async getEmpresaConfig() {
    const empresaId = getEmpresaId();
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        permiteFiao: true,
        limiteCreditoDefault: true,
        umbralVipMonto: true,
        umbralFrecuenteVisitas: true,
      },
    });
    return {
      permiteFiao: empresa?.permiteFiao ?? true,
      limiteCreditoDefault: Number(empresa?.limiteCreditoDefault ?? 0),
      umbralVipMonto: Number(empresa?.umbralVipMonto ?? 50000),
      umbralFrecuenteVisitas: empresa?.umbralFrecuenteVisitas ?? 10,
    };
  }

  /** Enriquece el cliente con etiquetas dinámicas y deuda cacheada. */
  private enrich(c: any, empresa: any, gastoAcumulado: number) {
    const etiquetas = this.calcEtiquetas(c, empresa, gastoAcumulado);
    return {
      id: c.id,
      nombre: c.nombre,
      apellido: c.apellido,
      telefono: c.telefono,
      whatsapp: c.whatsapp,
      email: c.email,
      fechaNacimiento: c.fechaNac
        ? c.fechaNac.toISOString().slice(0, 10)
        : null,
      sexo: c.sexo,
      cedula: c.cedula,
      direccion: c.direccion,
      notas: c.notas,
      alergias: c.alergias,
      activo: c.activo,
      permiteFiao: c.permiteFiao,
      limiteCredito: Number(c.limiteCredito),
      balancePendiente: Number(c.deudaActual),
      gastoAcumulado,
      totalCitas: c._count?.citas ?? 0,
      totalCompras: c._count?.ventas ?? 0,
      etiquetas,
    };
  }

  /**
   * Etiquetas calculadas en runtime (siempre reflejan la realidad):
   *  - VIP: gasto acumulado >= umbral de la empresa
   *  - MOROSO: balance pendiente > 0
   *  - FRECUENTE: nº de citas >= umbral
   *  - NUEVO: registrado hace < 30 días
   *  - CUMPLEANOS: cumple este mes
   */
  private calcEtiquetas(
    c: any,
    empresa: any,
    gastoAcumulado: number,
  ): ClienteEtiqueta[] {
    const tags: ClienteEtiqueta[] = [];
    const deuda = Number(c.deudaActual ?? 0);
    const visitas = c._count?.citas ?? 0;

    if (gastoAcumulado >= empresa.umbralVipMonto) tags.push('VIP');
    if (deuda > 0) tags.push('MOROSO');
    if (visitas >= empresa.umbralFrecuenteVisitas) tags.push('FRECUENTE');

    // NUEVO: < 30 días desde el registro
    if (c.createdAt) {
      const dias =
        (Date.now() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (dias < 30) tags.push('NUEVO');
    }

    // CUMPLEANOS: cumple este mes
    if (c.fechaNac) {
      const mesNac = new Date(c.fechaNac).getMonth();
      if (mesNac === new Date().getMonth()) tags.push('CUMPLEANOS');
    }

    return tags;
  }
}
