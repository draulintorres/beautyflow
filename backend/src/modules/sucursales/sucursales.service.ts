import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateSucursalDto, UpdateSucursalDto } from './dto/sucursal.dto';
import { getEmpresaId } from '../../core/tenant/tenant-context';
import { LimitsService } from '../superadmin/limits.service';

@Injectable()
export class SucursalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
  ) {}

  /** Lista las sucursales de la empresa (principal primero, luego por nombre). */
  async findAll() {
    return this.prisma.db.sucursal.findMany({
      orderBy: [{ esPrincipal: 'desc' }, { nombre: 'asc' }],
    });
  }

  async findOne(id: string) {
    const sucursal = await this.prisma.db.sucursal.findFirst({
      where: { id },
    });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    return sucursal;
  }

  async create(dto: CreateSucursalDto) {
    await this.limits.verificar('sucursales');

    // Si se marca como principal, desmarcar la principal anterior
    if (dto.esPrincipal) {
      await this.clearPrincipal();
    } else {
      // Si es la primera sucursal de la empresa, forzarla como principal
      const count = await this.prisma.db.sucursal.count();
      if (count === 0) dto.esPrincipal = true;
    }

    return this.prisma.db.sucursal.create({
      data: {
        nombre: dto.nombre,
        direccion: dto.direccion,
        telefono: dto.telefono,
        esPrincipal: dto.esPrincipal ?? false,
        activo: dto.activo ?? true,
      } as any,
    });
  }

  async update(id: string, dto: UpdateSucursalDto) {
    await this.findOne(id); // valida existencia + tenant

    if (dto.esPrincipal === true) {
      await this.clearPrincipal(id);
    }

    return this.prisma.db.sucursal.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.direccion !== undefined && { direccion: dto.direccion }),
        ...(dto.telefono !== undefined && { telefono: dto.telefono }),
        ...(dto.esPrincipal !== undefined && { esPrincipal: dto.esPrincipal }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
      },
    });
  }

  /** Soft delete. No se permite borrar la única sucursal ni la principal si hay otras. */
  async remove(id: string) {
    const sucursal = await this.findOne(id);

    const total = await this.prisma.db.sucursal.count();
    if (total <= 1) {
      throw new BadRequestException(
        'No se puede eliminar la única sucursal de la empresa',
      );
    }
    if (sucursal.esPrincipal) {
      throw new BadRequestException(
        'No se puede eliminar la sucursal principal. Marca otra como principal primero.',
      );
    }

    await this.prisma.db.sucursal.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
    return { success: true };
  }

  /** Quita el flag de principal de todas las sucursales (excepto exceptId). */
  private async clearPrincipal(exceptId?: string) {
    const empresaId = getEmpresaId();
    await this.prisma.db.sucursal.updateMany({
      where: {
        esPrincipal: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { esPrincipal: false },
    });
    // empresaId queda implícito por el filtro de tenant, referenciado para claridad
    void empresaId;
  }
}
