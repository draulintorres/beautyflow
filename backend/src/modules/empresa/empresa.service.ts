import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../core/prisma/prisma.service';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { getEmpresaId, getCurrentUser } from '../../core/tenant/tenant-context';
import { AuditService } from '../../core/audit/audit.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class EmpresaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Devuelve la empresa del tenant actual con sus módulos activos.
   * Empresa no lleva filtro de tenant en el cliente extendido (no tiene
   * empresaId propio), así que se consulta por id resuelto del contexto.
   */
  async findOwn() {
    const empresaId = getEmpresaId();
    const [empresa, sub] = await Promise.all([
      this.prisma.empresa.findFirst({
        where: { id: empresaId, deletedAt: null },
        include: {
          modulos: { where: { activo: true }, select: { modulo: true } },
          _count: { select: { sucursales: true, usuarios: true } },
        },
      }),
      this.prisma.subscription.findUnique({
        where: { empresaId },
        include: { planRef: { select: { maxUsuarios: true, maxSucursales: true, maxEmpleados: true } } },
      }),
    ]);
    if (!empresa) throw new NotFoundException('Empresa no encontrada');

    return {
      ...this.toResponse(empresa),
      maxUsuarios: sub?.planRef?.maxUsuarios ?? null,
      maxSucursales: sub?.planRef?.maxSucursales ?? null,
      maxEmpleados: sub?.planRef?.maxEmpleados ?? null,
    };
  }

  /** Actualiza la empresa del tenant actual. */
  async updateOwn(dto: UpdateEmpresaDto) {
    const empresaId = getEmpresaId();

    // Asegurar que existe (y no está borrada) antes de actualizar
    const exists = await this.prisma.empresa.findFirst({
      where: { id: empresaId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Empresa no encontrada');

    // Candado de PIN (Parte B): esta sección es EXCLUSIVAMENTE de OWNER,
    // aunque la ruta en general también admita ADMIN para el resto de
    // Ajustes — así un ADMIN no puede aflojar (ni fortalecer) el candado
    // que también lo controla a él mismo al anular ventas.
    const tocaPin = dto.pinAnulacionActivo !== undefined || dto.pinAnulacion !== undefined;
    if (tocaPin) {
      const user = getCurrentUser();
      if (user.rol !== 'OWNER') {
        throw new ForbiddenException(
          'Solo el propietario (OWNER) puede configurar el PIN de anulación.',
        );
      }
    }

    // Contribuyente DGII / ITBIS: mismo criterio que el PIN — decide si las
    // facturas cobran impuesto o no, así que queda exclusivo de OWNER
    // aunque ADMIN pueda editar el resto de Ajustes.
    if (dto.itbisPct !== undefined) {
      const user = getCurrentUser();
      if (user.rol !== 'OWNER') {
        throw new ForbiddenException(
          'Solo el propietario (OWNER) puede configurar si el negocio cobra ITBIS.',
        );
      }
    }

    const data: Prisma.EmpresaUpdateInput = {
      ...(dto.nombre !== undefined && { nombre: dto.nombre }),
      ...(dto.rnc !== undefined && { rnc: dto.rnc }),
      ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
      ...(dto.telefono !== undefined && { telefono: dto.telefono }),
      ...(dto.direccion !== undefined && { direccion: dto.direccion }),
      ...(dto.redes !== undefined && { redes: dto.redes }),
      ...(dto.moneda !== undefined && { moneda: dto.moneda }),
      ...(dto.itbisPct !== undefined && { itbisPct: dto.itbisPct }),
      ...(dto.permiteFiao !== undefined && { permiteFiao: dto.permiteFiao }),
      ...(dto.limiteCreditoDefault !== undefined && {
        limiteCreditoDefault: dto.limiteCreditoDefault,
      }),
      ...(dto.diasVencimiento !== undefined && {
        diasVencimiento: dto.diasVencimiento,
      }),
      ...(dto.comisionFiaoPolitica !== undefined && {
        comisionFiaoPolitica: dto.comisionFiaoPolitica,
      }),
      ...(dto.umbralVipMonto !== undefined && {
        umbralVipMonto: dto.umbralVipMonto,
      }),
      ...(dto.umbralFrecuenteVisitas !== undefined && {
        umbralFrecuenteVisitas: dto.umbralFrecuenteVisitas,
      }),
      ...(dto.verticales !== undefined && { verticales: dto.verticales }),
      ...(dto.horaRecordatorio !== undefined && {
        horaRecordatorio: dto.horaRecordatorio,
      }),
      ...(dto.minutosAvisoCita !== undefined && {
        minutosAvisoCita: dto.minutosAvisoCita,
      }),
      ...(dto.pinAnulacionActivo !== undefined && {
        pinAnulacionActivo: dto.pinAnulacionActivo,
      }),
    };

    // El hash nunca pasa por el objeto `data` de arriba a propósito: así
    // el spread genérico de auditoría de abajo no puede llegar a incluirlo
    // por accidente si alguien agrega un campo nuevo sin fijarse.
    if (dto.pinAnulacion !== undefined) {
      data.pinAnulacionHash = await bcrypt.hash(dto.pinAnulacion, 12);
    }

    const updated = await this.prisma.empresa.update({
      where: { id: empresaId },
      data,
      include: {
        modulos: { where: { activo: true }, select: { modulo: true } },
        _count: { select: { sucursales: true, usuarios: true } },
      },
    });

    // Auditoría: nunca se loguea el PIN (ni plano ni hasheado) — solo que
    // cambió y el estado del toggle, igual que el resto de campos sí se
    // audita con su valor real.
    const { pinAnulacionHash, ...dataAuditable } = data as any;
    await this.audit.log({
      modulo: 'CONFIG',
      entidad: 'Empresa',
      entidadId: empresaId,
      accion: 'UPDATE',
      datosDespues: {
        ...dataAuditable,
        ...(pinAnulacionHash !== undefined && { pinAnulacionCambiado: true }),
      },
    });

    return this.toResponse(updated);
  }

  private toResponse(e: any) {
    return {
      id: e.id,
      nombre: e.nombre,
      slug: e.slug,
      rnc: e.rnc,
      logoUrl: e.logoUrl,
      telefono: e.telefono,
      direccion: e.direccion,
      redes: e.redes,
      moneda: e.moneda,
      itbisPct: Number(e.itbisPct),
      permiteFiao: e.permiteFiao,
      limiteCreditoDefault: Number(e.limiteCreditoDefault),
      diasVencimiento: e.diasVencimiento,
      comisionFiaoPolitica: e.comisionFiaoPolitica,
      umbralVipMonto: Number(e.umbralVipMonto),
      umbralFrecuenteVisitas: e.umbralFrecuenteVisitas,
      verticales: e.verticales,
      horaRecordatorio: e.horaRecordatorio,
      minutosAvisoCita: e.minutosAvisoCita,
      // Nunca se expone pinAnulacionHash — solo si el candado está
      // encendido y si ya hay un PIN definido (para que el frontend sepa
      // si es "definir" o "cambiar" sin nunca ver el valor real).
      pinAnulacionActivo: e.pinAnulacionActivo,
      pinAnulacionConfigurado: !!e.pinAnulacionHash,
      plan: e.plan,
      estado: e.estado,
      modulosActivos: e.modulos?.map((m: any) => m.modulo) ?? [],
      totalSucursales: e._count?.sucursales ?? 0,
      totalUsuarios: e._count?.usuarios ?? 0,
    };
  }
}
