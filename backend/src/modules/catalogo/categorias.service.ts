import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateCategoriaDto, UpdateCategoriaDto } from './dto/catalogo.dto';

@Injectable()
export class CategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.db.categoriaServicio.findMany({
      include: { _count: { select: { servicios: true } } },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
  }

  async findOne(id: string) {
    const cat = await this.prisma.db.categoriaServicio.findFirst({
      where: { id },
      include: { _count: { select: { servicios: true } } },
    });
    if (!cat) throw new NotFoundException('Categoría no encontrada');
    return cat;
  }

  async create(dto: CreateCategoriaDto) {
    return this.prisma.db.categoriaServicio.create({
      data: {
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        icono: dto.icono,
        vertical: dto.vertical,
        orden: dto.orden ?? 0,
        activo: dto.activo ?? true,
      } as any,
    });
  }

  async update(id: string, dto: UpdateCategoriaDto) {
    await this.ensureExists(id);
    return this.prisma.db.categoriaServicio.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.icono !== undefined && { icono: dto.icono }),
        ...(dto.vertical !== undefined && { vertical: dto.vertical }),
        ...(dto.orden !== undefined && { orden: dto.orden }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    // No permitir borrar una categoría con servicios activos
    const servicios = await this.prisma.db.servicio.count({
      where: { categoriaId: id },
    });
    if (servicios > 0) {
      throw new BadRequestException(
        'No se puede eliminar una categoría con servicios. Reasigna o elimina los servicios primero.',
      );
    }
    await this.prisma.db.categoriaServicio.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
    return { success: true };
  }

  private async ensureExists(id: string) {
    const c = await this.prisma.db.categoriaServicio.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!c) throw new NotFoundException('Categoría no encontrada');
  }
}
