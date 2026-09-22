import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateMetodoPagoDto, UpdateMetodoPagoDto } from './dto/caja.dto';

@Injectable()
export class MetodosPagoService {
  constructor(private readonly prisma: PrismaService) {}

  // Por defecto, solo activos — quien cobra (POS, Cuentas por Cobrar) nunca
  // debe poder elegir un método que el dueño desactivó. Ajustes es la
  // única pantalla que necesita ver también los inactivos (para poder
  // reactivarlos), y lo pide explícito con `incluirInactivos`.
  async findAll(incluirInactivos = false) {
    return this.prisma.db.metodoPago.findMany({
      where: incluirInactivos ? undefined : { activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
  }

  async create(dto: CreateMetodoPagoDto) {
    const nombre = dto.nombre.trim();
    if (!nombre) throw new BadRequestException('El nombre no puede estar vacío');

    // Sin distinguir mayúsculas/minúsculas — "efectivo" y "Efectivo" son
    // el mismo método de pago para quien está cobrando.
    const existe = await this.prisma.db.metodoPago.findFirst({
      where: { nombre: { equals: nombre, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existe) {
      throw new ConflictException('Ya existe un método de pago con ese nombre');
    }

    // `orden` autoasignado al final de la lista — el frontend (pantalla de
    // Ajustes) no manda uno, solo el nombre.
    let orden = dto.orden;
    if (orden === undefined) {
      const ultimo = await this.prisma.db.metodoPago.findFirst({
        orderBy: { orden: 'desc' },
        select: { orden: true },
      });
      orden = (ultimo?.orden ?? 0) + 1;
    }

    return this.prisma.db.metodoPago.create({
      data: {
        nombre,
        // `esEfectivo: true` queda reservado para el único método
        // "Efectivo" que se siembra al crear la empresa
        // (superadmin.service.ts) — cualquier método creado desde acá
        // (Ajustes) es explícitamente `false`, sin importar qué mande el
        // caller.
        esEfectivo: false,
        orden,
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
