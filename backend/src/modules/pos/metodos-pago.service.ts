import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateMetodoPagoDto, UpdateMetodoPagoDto } from './dto/caja.dto';

@Injectable()
export class MetodosPagoService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.db.metodoPago.findMany({
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
  }

  async create(dto: CreateMetodoPagoDto) {
    const existe = await this.prisma.db.metodoPago.findFirst({
      where: { nombre: dto.nombre },
      select: { id: true },
    });
    if (existe) {
      throw new ConflictException('Ya existe un método de pago con ese nombre');
    }
    return this.prisma.db.metodoPago.create({
      data: {
        nombre: dto.nombre,
        esEfectivo: dto.esEfectivo ?? false,
        orden: dto.orden ?? 0,
        activo: dto.activo ?? true,
      } as any,
    });
  }

  async update(id: string, dto: UpdateMetodoPagoDto) {
    await this.ensureExists(id);
    return this.prisma.db.metodoPago.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.esEfectivo !== undefined && { esEfectivo: dto.esEfectivo }),
        ...(dto.orden !== undefined && { orden: dto.orden }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.db.metodoPago.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
    return { success: true };
  }

  private async ensureExists(id: string) {
    const m = await this.prisma.db.metodoPago.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!m) throw new NotFoundException('Método de pago no encontrado');
  }
}
