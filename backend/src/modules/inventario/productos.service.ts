import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  CreateProductoDto,
  UpdateProductoDto,
  CreateCategoriaProductoDto,
  UpdateCategoriaProductoDto,
} from './dto/inventario.dto';

@Injectable()
export class CategoriasProductoService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.db.categoriaProducto.findMany({
      include: { _count: { select: { productos: true } } },
      orderBy: { nombre: 'asc' },
    });
  }

  async create(dto: CreateCategoriaProductoDto) {
    const existe = await this.prisma.db.categoriaProducto.findFirst({
      where: { nombre: dto.nombre },
      select: { id: true },
    });
    if (existe) throw new ConflictException('Ya existe una categoría con ese nombre');
    return this.prisma.db.categoriaProducto.create({
      data: {
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        activo: dto.activo ?? true,
      } as any,
    });
  }

  async update(id: string, dto: UpdateCategoriaProductoDto) {
    await this.ensureExists(id);
    return this.prisma.db.categoriaProducto.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    const productos = await this.prisma.db.producto.count({
      where: { categoriaId: id },
    });
    if (productos > 0) {
      throw new BadRequestException(
        'No se puede eliminar una categoría con productos asociados',
      );
    }
    await this.prisma.db.categoriaProducto.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
    return { success: true };
  }

  private async ensureExists(id: string) {
    const c = await this.prisma.db.categoriaProducto.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!c) throw new NotFoundException('Categoría de producto no encontrada');
  }
}

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filtros: { q?: string; categoriaId?: string; activo?: boolean }) {
    return this.prisma.db.producto.findMany({
      where: {
        ...(filtros.activo !== undefined && { activo: filtros.activo }),
        ...(filtros.categoriaId && { categoriaId: filtros.categoriaId }),
        ...(filtros.q && {
          OR: [
            { nombre: { contains: filtros.q, mode: 'insensitive' } },
            { codigo: { contains: filtros.q, mode: 'insensitive' } },
            { codigoBarra: { contains: filtros.q } },
            { marca: { contains: filtros.q, mode: 'insensitive' } },
          ],
        }),
      },
      include: { categoriaRef: { select: { id: true, nombre: true } } },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: string) {
    const producto = await this.prisma.db.producto.findFirst({
      where: { id },
      include: {
        categoriaRef: { select: { id: true, nombre: true } },
        stockSucursales: true,
      },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return producto;
  }

  async create(dto: CreateProductoDto) {
    if (dto.categoriaId) await this.validateCategoria(dto.categoriaId);
    if (dto.codigo) {
      const existe = await this.prisma.db.producto.findFirst({
        where: { codigo: dto.codigo },
        select: { id: true },
      });
      if (existe) throw new ConflictException('Ya existe un producto con ese código');
    }

    return this.prisma.db.producto.create({
      data: {
        nombre: dto.nombre,
        codigo: dto.codigo,
        codigoBarra: dto.codigoBarra,
        descripcion: dto.descripcion,
        marca: dto.marca,
        categoriaId: dto.categoriaId,
        tipo: dto.tipo,
        unidadMedida: dto.unidadMedida,
        costo: dto.costo,
        precio: dto.precio,
        itbisPct: dto.itbisPct,
        existencia: dto.stockActual ?? 0,
        stockMinimo: dto.stockMinimo ?? 0,
        permiteVentaSinStock: dto.permiteVentaSinStock ?? false,
        generaComision: dto.generaComision ?? false,
        activo: dto.activo ?? true,
      } as any,
    });
  }

  async update(id: string, dto: UpdateProductoDto) {
    await this.ensureExists(id);
    if (dto.categoriaId) await this.validateCategoria(dto.categoriaId);

    return this.prisma.db.producto.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.codigo !== undefined && { codigo: dto.codigo }),
        ...(dto.codigoBarra !== undefined && { codigoBarra: dto.codigoBarra }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.marca !== undefined && { marca: dto.marca }),
        ...(dto.categoriaId !== undefined && { categoriaId: dto.categoriaId }),
        ...(dto.tipo !== undefined && { tipo: dto.tipo }),
        ...(dto.unidadMedida !== undefined && { unidadMedida: dto.unidadMedida }),
        ...(dto.costo !== undefined && { costo: dto.costo }),
        ...(dto.precio !== undefined && { precio: dto.precio }),
        ...(dto.itbisPct !== undefined && { itbisPct: dto.itbisPct }),
        ...(dto.stockMinimo !== undefined && { stockMinimo: dto.stockMinimo }),
        ...(dto.permiteVentaSinStock !== undefined && {
          permiteVentaSinStock: dto.permiteVentaSinStock,
        }),
        ...(dto.generaComision !== undefined && {
          generaComision: dto.generaComision,
        }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
        // Nota: stockActual NO se edita aquí; usar ajustes para trazabilidad
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.db.producto.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
    return { success: true };
  }

  // ---------- ALERTAS DE STOCK ----------
  async stockBajo() {
    // Productos donde existencia <= stockMinimo (y mínimo > 0)
    const productos = await this.prisma.db.producto.findMany({
      where: { activo: true, stockMinimo: { gt: 0 } },
      select: {
        id: true,
        nombre: true,
        existencia: true,
        stockMinimo: true,
      },
      orderBy: { existencia: 'asc' },
    });
    return productos
      .filter((p) => p.existencia <= p.stockMinimo)
      .map((p) => ({
        productoId: p.id,
        producto: p.nombre,
        stockActual: p.existencia,
        stockMinimo: p.stockMinimo,
        faltante: p.stockMinimo - p.existencia,
      }));
  }

  private async ensureExists(id: string) {
    const p = await this.prisma.db.producto.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!p) throw new NotFoundException('Producto no encontrado');
  }

  private async validateCategoria(categoriaId: string) {
    const c = await this.prisma.db.categoriaProducto.findFirst({
      where: { id: categoriaId },
      select: { id: true },
    });
    if (!c) throw new BadRequestException('Categoría de producto no válida');
  }
}
