import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateCabinaDto, UpdateCabinaDto } from './dto/cabina.dto';

@Injectable()
export class CabinasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(sucursalId?: string) {
    return this.prisma.db.cabina.findMany({
      where: { ...(sucursalId && { sucursalId }) },
      include: { sucursal: { select: { id: true, nombre: true } } },
      orderBy: { nombre: 'asc' },
    });
  }

  async create(dto: CreateCabinaDto) {
    const suc = await this.prisma.db.sucursal.findFirst({
      where: { id: dto.sucursalId },
      select: { id: true },
    });
    if (!suc) throw new BadRequestException('Sucursal no válida');

    return this.prisma.db.cabina.create({
      data: {
        nombre: dto.nombre,
        sucursalId: dto.sucursalId,
        activa: dto.activa ?? true,
      } as any,
    });
  }

  async update(id: string, dto: UpdateCabinaDto) {
    await this.ensureExists(id);
    return this.prisma.db.cabina.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.activa !== undefined && { activa: dto.activa }),
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.db.cabina.update({
      where: { id },
      data: { deletedAt: new Date(), activa: false },
    });
    return { success: true };
  }

  private async ensureExists(id: string) {
    const c = await this.prisma.db.cabina.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!c) throw new NotFoundException('Cabina no encontrada');
  }
}
