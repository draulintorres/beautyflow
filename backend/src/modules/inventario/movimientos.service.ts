import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AjusteInventarioDto, TransferenciaDto } from './dto/inventario.dto';
import { getEmpresaId, getCurrentUser } from '../../core/tenant/tenant-context';
import { AuditService } from '../../core/audit/audit.service';
import { MovimientoInventarioTipo, Prisma } from '@prisma/client';

@Injectable()
export class MovimientosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- KARDEX ----------
  async kardex(productoId: string, filtros: { desde?: string; hasta?: string }) {
    const producto = await this.prisma.db.producto.findFirst({
      where: { id: productoId },
      select: { id: true, nombre: true, existencia: true },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');

    const movimientos = await this.prisma.db.movimientoInventario.findMany({
      where: {
        productoId,
        ...(filtros.desde || filtros.hasta
          ? {
              createdAt: {
                ...(filtros.desde && { gte: new Date(`${filtros.desde}T00:00:00`) }),
                ...(filtros.hasta && { lte: new Date(`${filtros.hasta}T23:59:59.999`) }),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      producto: producto.nombre,
      existenciaActual: producto.existencia,
      movimientos: movimientos.map((m) => ({
        fecha: m.createdAt,
        tipo: m.tipo,
        motivo: m.motivo,
        cantidad: m.cantidad,
        saldoAnterior: m.saldoAnterior,
        saldoNuevo: m.saldoNuevo,
        referencia: m.referenciaTipo,
        usuarioId: m.createdBy,
      })),
    };
  }

  // ---------- AJUSTE ----------
  async ajustar(dto: AjusteInventarioDto) {
    const empresaId = getEmpresaId();
    const usuarioId = getCurrentUser().usuarioId;

    const producto = await this.prisma.db.producto.findFirst({
      where: { id: dto.productoId },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');

    if (dto.cantidad === 0) {
      throw new BadRequestException('La cantidad del ajuste no puede ser cero');
    }

    const saldoAnterior = producto.existencia;
    const saldoNuevo = saldoAnterior + dto.cantidad;
    if (saldoNuevo < 0) {
      throw new BadRequestException(
        `El ajuste dejaría el stock negativo (actual: ${saldoAnterior}, ajuste: ${dto.cantidad})`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.producto.update({
        where: { id: dto.productoId },
        data: { existencia: saldoNuevo },
      });
      await tx.movimientoInventario.create({
        data: {
          empresaId,
          productoId: dto.productoId,
          sucursalId: dto.sucursalId,
          tipo: MovimientoInventarioTipo.AJUSTE,
          motivo: `AJUSTE: ${dto.motivo}`,
          cantidad: dto.cantidad,
          saldoAnterior,
          saldoNuevo,
          referenciaTipo: 'AJUSTE',
          createdBy: usuarioId,
        },
      });
    });

    await this.audit.log({
      modulo: 'INVENTARIO',
      entidad: 'Producto',
      entidadId: dto.productoId,
      accion: 'ADJUST',
      datosAntes: { existencia: saldoAnterior },
      datosDespues: { existencia: saldoNuevo, ajuste: dto.cantidad, motivo: dto.motivo },
    });

    return {
      productoId: dto.productoId,
      saldoAnterior,
      saldoNuevo,
      ajuste: dto.cantidad,
    };
  }

  // ---------- TRANSFERENCIA ENTRE SUCURSALES ----------
  async transferir(dto: TransferenciaDto) {
    const empresaId = getEmpresaId();
    const usuarioId = getCurrentUser().usuarioId;

    if (dto.origenId === dto.destinoId) {
      throw new BadRequestException('Origen y destino no pueden ser iguales');
    }

    // Validar sucursales
    const sucursales = await this.prisma.db.sucursal.findMany({
      where: { id: { in: [dto.origenId, dto.destinoId] } },
      select: { id: true },
    });
    if (sucursales.length !== 2) {
      throw new BadRequestException('Sucursal de origen o destino no válida');
    }

    // Validar stock por sucursal de origen para todos los items antes de mover nada
    for (const item of dto.items) {
      const stockOrigen = await this.getStockSucursal(item.productoId, dto.origenId);
      if (stockOrigen < item.cantidad) {
        const prod = await this.prisma.db.producto.findFirst({
          where: { id: item.productoId },
          select: { nombre: true },
        });
        throw new BadRequestException(
          `Stock insuficiente de ${prod?.nombre ?? item.productoId} en la sucursal origen (disponible: ${stockOrigen})`,
        );
      }
    }

    // Ejecutar todo en una transacción: dos movimientos por item
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const producto = await tx.producto.findFirst({
          where: { id: item.productoId, empresaId },
        });
        if (!producto) continue;

        // SALIDA de origen
        const stockOrigenAntes = await this.getStockSucursalTx(
          tx,
          item.productoId,
          dto.origenId,
        );
        await this.upsertStockTx(
          tx,
          empresaId,
          item.productoId,
          dto.origenId,
          stockOrigenAntes - item.cantidad,
        );
        await tx.movimientoInventario.create({
          data: {
            empresaId,
            productoId: item.productoId,
            sucursalId: dto.origenId,
            tipo: MovimientoInventarioTipo.SALIDA,
            motivo: 'TRANSFERENCIA',
            cantidad: -item.cantidad,
            saldoAnterior: stockOrigenAntes,
            saldoNuevo: stockOrigenAntes - item.cantidad,
            referenciaTipo: 'SALIDA_TRANSFERENCIA',
            referenciaId: dto.destinoId,
            createdBy: usuarioId,
          },
        });

        // ENTRADA a destino
        const stockDestinoAntes = await this.getStockSucursalTx(
          tx,
          item.productoId,
          dto.destinoId,
        );
        await this.upsertStockTx(
          tx,
          empresaId,
          item.productoId,
          dto.destinoId,
          stockDestinoAntes + item.cantidad,
        );
        await tx.movimientoInventario.create({
          data: {
            empresaId,
            productoId: item.productoId,
            sucursalId: dto.destinoId,
            tipo: MovimientoInventarioTipo.ENTRADA,
            motivo: 'TRANSFERENCIA',
            cantidad: item.cantidad,
            saldoAnterior: stockDestinoAntes,
            saldoNuevo: stockDestinoAntes + item.cantidad,
            referenciaTipo: 'ENTRADA_TRANSFERENCIA',
            referenciaId: dto.origenId,
            createdBy: usuarioId,
          },
        });
        // El total global del producto no cambia (solo se mueve entre sucursales)
      }
    });

    await this.audit.log({
      modulo: 'INVENTARIO',
      entidad: 'Transferencia',
      accion: 'TRANSFER',
      datosDespues: {
        origenId: dto.origenId,
        destinoId: dto.destinoId,
        items: dto.items,
      },
    });

    return { success: true, items: dto.items.length };
  }

  // ---------- helpers de stock por sucursal ----------
  private async getStockSucursal(productoId: string, sucursalId: string) {
    const s = await this.prisma.db.stockSucursal.findFirst({
      where: { productoId, sucursalId },
      select: { existencia: true },
    });
    return s?.existencia ?? 0;
  }

  private async getStockSucursalTx(
    tx: Prisma.TransactionClient,
    productoId: string,
    sucursalId: string,
  ) {
    const s = await tx.stockSucursal.findFirst({
      where: { productoId, sucursalId },
      select: { existencia: true },
    });
    return s?.existencia ?? 0;
  }

  private async upsertStockTx(
    tx: Prisma.TransactionClient,
    empresaId: string,
    productoId: string,
    sucursalId: string,
    nuevaExistencia: number,
  ) {
    const existing = await tx.stockSucursal.findFirst({
      where: { productoId, sucursalId },
      select: { id: true },
    });
    if (existing) {
      await tx.stockSucursal.update({
        where: { id: existing.id },
        data: { existencia: nuevaExistencia },
      });
    } else {
      await tx.stockSucursal.create({
        data: { empresaId, productoId, sucursalId, existencia: nuevaExistencia },
      });
    }
  }
}
