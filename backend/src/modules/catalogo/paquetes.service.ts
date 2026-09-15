import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreatePaqueteDto, UpdatePaqueteDto } from './dto/catalogo.dto';

@Injectable()
export class PaquetesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const paquetes = await this.prisma.db.paquete.findMany({
      include: {
        servicios: {
          include: {
            servicio: { select: { id: true, nombre: true, precio: true } },
          },
        },
      },
      orderBy: { nombre: 'asc' },
    });
    return paquetes.map((p) => this.withAhorro(p));
  }

  async findOne(id: string) {
    const paquete = await this.prisma.db.paquete.findFirst({
      where: { id },
      include: {
        servicios: {
          include: {
            servicio: { select: { id: true, nombre: true, precio: true } },
          },
        },
      },
    });
    if (!paquete) throw new NotFoundException('Paquete no encontrado');
    return this.withAhorro(paquete);
  }

  async create(dto: CreatePaqueteDto) {
    await this.validateServicios(dto.servicios.map((s) => s.servicioId));

    const paquete = await this.prisma.db.paquete.create({
      data: {
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        precio: dto.precio,
        activo: dto.activo ?? true,
        servicios: {
          create: dto.servicios.map((s) => ({
            servicioId: s.servicioId,
            cantidad: s.cantidad ?? 1,
          })),
        },
      } as any,
      include: {
        servicios: {
          include: {
            servicio: { select: { id: true, nombre: true, precio: true } },
          },
        },
      },
    });
    return this.withAhorro(paquete);
  }

  async update(id: string, dto: UpdatePaqueteDto) {
    await this.ensureExists(id);

    if (dto.servicios) {
      await this.validateServicios(dto.servicios.map((s) => s.servicioId));
      // Reemplazar la composición del paquete (transaccional: evita dejar el set vacío)
      await this.prisma.$transaction([
        this.prisma.paqueteServicio.deleteMany({ where: { paqueteId: id } }),
        this.prisma.paqueteServicio.createMany({
          data: dto.servicios.map((s) => ({
            paqueteId: id,
            servicioId: s.servicioId,
            cantidad: s.cantidad ?? 1,
          })),
          skipDuplicates: true,
        }),
      ]);
    }

    await this.prisma.db.paquete.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.precio !== undefined && { precio: dto.precio }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
      },
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.db.paquete.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
    return { success: true };
  }

  // ---------- helpers ----------
  private async ensureExists(id: string) {
    const p = await this.prisma.db.paquete.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!p) throw new NotFoundException('Paquete no encontrado');
  }

  private async validateServicios(servicioIds: string[]) {
    const unicos = [...new Set(servicioIds)];
    const encontrados = await this.prisma.db.servicio.findMany({
      where: { id: { in: unicos } },
      select: { id: true },
    });
    if (encontrados.length !== unicos.length) {
      throw new BadRequestException('Uno o más servicios no son válidos');
    }
  }

  /** Calcula el precio "suelto" (suma de servicios) y el ahorro del paquete. */
  private withAhorro(p: any) {
    const precioSuelto = p.servicios.reduce(
      (acc: number, ps: any) => acc + Number(ps.servicio.precio) * ps.cantidad,
      0,
    );
    const precio = Number(p.precio);
    return {
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio,
      precioSuelto,
      ahorro: Math.max(0, precioSuelto - precio),
      activo: p.activo,
      servicios: p.servicios.map((ps: any) => ({
        servicioId: ps.servicio.id,
        nombre: ps.servicio.nombre,
        precio: Number(ps.servicio.precio),
        cantidad: ps.cantidad,
      })),
    };
  }
}
