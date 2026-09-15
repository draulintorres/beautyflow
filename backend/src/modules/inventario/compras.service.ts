import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  CreateProveedorDto,
  UpdateProveedorDto,
  CreateCompraDto,
} from './dto/inventario.dto';
import { getEmpresaId, getCurrentUser } from '../../core/tenant/tenant-context';
import { MovimientoInventarioTipo } from '@prisma/client';

@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(activo?: boolean) {
    return this.prisma.db.proveedor.findMany({
      where: { ...(activo !== undefined && { activo }) },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: string) {
    const p = await this.prisma.db.proveedor.findFirst({ where: { id } });
    if (!p) throw new NotFoundException('Proveedor no encontrado');
    return p;
  }

  async create(dto: CreateProveedorDto) {
    return this.prisma.db.proveedor.create({
      data: {
        nombre: dto.nombre,
        rnc: dto.rnc,
        telefono: dto.telefono,
        email: dto.email,
        direccion: dto.direccion,
        contacto: dto.contacto,
        activo: dto.activo ?? true,
      } as any,
    });
  }

  async update(id: string, dto: UpdateProveedorDto) {
    await this.findOne(id);
    return this.prisma.db.proveedor.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.rnc !== undefined && { rnc: dto.rnc }),
        ...(dto.telefono !== undefined && { telefono: dto.telefono }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.direccion !== undefined && { direccion: dto.direccion }),
        ...(dto.contacto !== undefined && { contacto: dto.contacto }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.db.proveedor.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
    return { success: true };
  }
}

@Injectable()
export class ComprasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const compras = await this.prisma.db.compra.findMany({
      include: {
        proveedor: { select: { nombre: true } },
        _count: { select: { detalles: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return compras.map((c) => ({
      id: c.id,
      numero: c.numero,
      numeroFactura: c.numeroFactura,
      proveedor: c.proveedor?.nombre,
      total: Number(c.total),
      confirmada: c.confirmada,
      fecha: c.fecha,
      items: c._count.detalles,
    }));
  }

  async findOne(id: string) {
    const compra = await this.prisma.db.compra.findFirst({
      where: { id },
      include: {
        proveedor: true,
        detalles: {
          include: { producto: { select: { id: true, nombre: true } } },
        },
      },
    });
    if (!compra) throw new NotFoundException('Compra no encontrada');
    return compra;
  }

  async create(dto: CreateCompraDto) {
    const empresaId = getEmpresaId();
    const usuarioId = getCurrentUser().usuarioId;

    // Validar proveedor y productos
    const proveedor = await this.prisma.db.proveedor.findFirst({
      where: { id: dto.proveedorId },
      select: { id: true },
    });
    if (!proveedor) throw new BadRequestException('Proveedor no válido');

    const productoIds = dto.items.map((i) => i.productoId);
    const productos = await this.prisma.db.producto.findMany({
      where: { id: { in: productoIds } },
      select: { id: true },
    });
    if (productos.length !== new Set(productoIds).size) {
      throw new BadRequestException('Uno o más productos no son válidos');
    }
    if (dto.sucursalId) {
      const suc = await this.prisma.db.sucursal.findFirst({
        where: { id: dto.sucursalId },
        select: { id: true },
      });
      if (!suc) throw new BadRequestException('Sucursal no válida');
    }

    // Calcular totales
    let subtotal = 0;
    let itbisTotal = 0;
    const detalles = dto.items.map((i) => {
      const sub = this.round(i.costo * i.cantidad);
      const itbis = i.itbis ?? 0;
      subtotal += sub;
      itbisTotal += itbis;
      return {
        productoId: i.productoId,
        cantidad: i.cantidad,
        costoUnit: i.costo,
        itbis,
        subtotal: sub,
        total: this.round(sub + itbis),
      };
    });
    const total = this.round(subtotal + itbisTotal);

    const compra = await this.prisma.$transaction(async (tx) => {
      const last = await tx.compra.findFirst({
        where: { empresaId },
        orderBy: { numero: 'desc' },
        select: { numero: true },
      });
      return tx.compra.create({
        data: {
          empresaId,
          proveedorId: dto.proveedorId,
          sucursalId: dto.sucursalId,
          numero: (last?.numero ?? 0) + 1,
          numeroFactura: dto.numeroFactura,
          fecha: dto.fecha ? new Date(dto.fecha) : new Date(),
          subtotal: this.round(subtotal),
          itbis: this.round(itbisTotal),
          total,
          confirmada: false,
          createdBy: usuarioId,
          detalles: { create: detalles },
        },
      });
    });

    return this.findOne(compra.id);
  }

  /** Confirmar compra: suma stock y registra movimientos ENTRADA/COMPRA. */
  async confirmar(id: string) {
    const empresaId = getEmpresaId();
    const usuarioId = getCurrentUser().usuarioId;

    const compra = await this.prisma.db.compra.findFirst({
      where: { id },
      include: { detalles: true },
    });
    if (!compra) throw new NotFoundException('Compra no encontrada');
    if (compra.confirmada) {
      throw new BadRequestException('La compra ya está confirmada');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const d of compra.detalles) {
        const producto = await tx.producto.findFirst({
          where: { id: d.productoId, empresaId },
          select: { existencia: true, costo: true },
        });
        if (!producto) continue;

        const saldoAnterior = producto.existencia;
        const saldoNuevo = saldoAnterior + d.cantidad;

        await tx.producto.update({
          where: { id: d.productoId },
          data: {
            existencia: saldoNuevo,
            // Actualizar costo al último de compra
            costo: d.costoUnit,
          },
        });

        // Stock por sucursal si la compra tiene sucursal
        if (compra.sucursalId) {
          const existing = await tx.stockSucursal.findFirst({
            where: { productoId: d.productoId, sucursalId: compra.sucursalId },
            select: { id: true, existencia: true },
          });
          if (existing) {
            await tx.stockSucursal.update({
              where: { id: existing.id },
              data: { existencia: existing.existencia + d.cantidad },
            });
          } else {
            await tx.stockSucursal.create({
              data: {
                empresaId,
                productoId: d.productoId,
                sucursalId: compra.sucursalId,
                existencia: d.cantidad,
              },
            });
          }
        }

        await tx.movimientoInventario.create({
          data: {
            empresaId,
            productoId: d.productoId,
            sucursalId: compra.sucursalId,
            tipo: MovimientoInventarioTipo.ENTRADA,
            motivo: 'COMPRA',
            cantidad: d.cantidad,
            saldoAnterior,
            saldoNuevo,
            referenciaTipo: 'COMPRA',
            referenciaId: compra.id,
            createdBy: usuarioId,
          },
        });
      }

      await tx.compra.update({
        where: { id },
        data: { confirmada: true },
      });
    });

    return this.findOne(id);
  }

  private round(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
}
