import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateServicioDto, UpdateServicioDto } from './dto/catalogo.dto';
import { AuditService } from '../../core/audit/audit.service';
import { Vertical } from '@prisma/client';

@Injectable()
export class ServiciosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(filtros: {
    categoriaId?: string;
    vertical?: Vertical;
    activo?: boolean;
  }) {
    return this.prisma.db.servicio.findMany({
      where: {
        ...(filtros.categoriaId && { categoriaId: filtros.categoriaId }),
        ...(filtros.vertical && { vertical: filtros.vertical }),
        ...(filtros.activo !== undefined && { activo: filtros.activo }),
      },
      include: { categoria: { select: { id: true, nombre: true } } },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: string) {
    const servicio = await this.prisma.db.servicio.findFirst({
      where: { id },
      include: { categoria: { select: { id: true, nombre: true } } },
    });
    if (!servicio) throw new NotFoundException('Servicio no encontrado');
    return servicio;
  }

  async create(dto: CreateServicioDto) {
    await this.validateCategoria(dto.categoriaId);

    return this.prisma.db.servicio.create({
      data: {
        nombre: dto.nombre,
        categoriaId: dto.categoriaId,
        vertical: dto.vertical,
        descripcion: dto.descripcion,
        precio: dto.precio,
        duracionMin: dto.duracionMin,
        comisionPct: dto.comisionPct,
        requiereCabina: dto.requiereCabina ?? false,
        activo: dto.activo ?? true,
      } as any,
      include: { categoria: { select: { id: true, nombre: true } } },
    });
  }

  async update(id: string, dto: UpdateServicioDto) {
    await this.ensureExists(id);
    if (dto.categoriaId) {
      await this.validateCategoria(dto.categoriaId);
    }

    // Capturar precio anterior para auditar cambios de precio
    const previo = await this.prisma.db.servicio.findFirst({
      where: { id },
      select: { precio: true },
    });

    const actualizado = await this.prisma.db.servicio.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.categoriaId !== undefined && { categoriaId: dto.categoriaId }),
        ...(dto.vertical !== undefined && { vertical: dto.vertical }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.precio !== undefined && { precio: dto.precio }),
        ...(dto.duracionMin !== undefined && { duracionMin: dto.duracionMin }),
        ...(dto.comisionPct !== undefined && { comisionPct: dto.comisionPct }),
        ...(dto.requiereCabina !== undefined && {
          requiereCabina: dto.requiereCabina,
        }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
      },
      include: { categoria: { select: { id: true, nombre: true } } },
    });

    // Auditar específicamente el cambio de precio
    if (dto.precio !== undefined && Number(previo?.precio) !== dto.precio) {
      await this.audit.log({
        modulo: 'CATALOGO',
        entidad: 'Servicio',
        entidadId: id,
        accion: 'PRICE_CHANGE',
        datosAntes: { precio: Number(previo?.precio) },
        datosDespues: { precio: dto.precio },
      });
    }

    return actualizado;
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.db.servicio.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
    return { success: true };
  }

  private async ensureExists(id: string) {
    const s = await this.prisma.db.servicio.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!s) throw new NotFoundException('Servicio no encontrado');
  }

  private async validateCategoria(categoriaId: string) {
    const cat = await this.prisma.db.categoriaServicio.findFirst({
      where: { id: categoriaId },
      select: { id: true },
    });
    if (!cat) throw new BadRequestException('Categoría no válida');
  }
}
