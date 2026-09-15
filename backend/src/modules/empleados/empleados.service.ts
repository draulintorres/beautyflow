import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ComisionBase, ModeloPago } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  CreateEmpleadoDto,
  UpdateEmpleadoDto,
  SetEspecialidadesDto,
  SetHorariosDto,
  CreateBloqueoDto,
  SetComisionesDto,
  SetComisionUiDto,
  CrearAccesoDto,
} from './dto/empleado.dto';
import { getEmpresaId, getCurrentUser } from '../../core/tenant/tenant-context';
import { SucursalScopeService } from '../../core/tenant/sucursal-scope.service';
import { LimitsService } from '../superadmin/limits.service';
import { AuditService } from '../../core/audit/audit.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

@Injectable()
export class EmpleadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly sucursalScope: SucursalScopeService,
    private readonly audit: AuditService,
  ) {}

  // ---------- CRUD ----------
  async findAll() {
    // Aislamiento por sucursal: un usuario no-OWNER asignado a una sucursal
    // solo ve a los empleados de esa sucursal (afecta Equipo, POS, Agenda y
    // Reportes, que comparten este endpoint).
    const suc = await this.sucursalScope.whereSucursal();
    return this.prisma.db.empleado.findMany({
      where: { ...suc },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        usuario: {
          select: {
            id: true, email: true, activo: true,
            rol: { select: { roleKey: true, nombre: true } },
          },
        },
        _count: { select: { especialidades: true } },
        especialidades: { select: { servicio: { select: { id: true, nombre: true } } } },
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: string) {
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        usuario: {
          select: {
            id: true, email: true, activo: true,
            rol: { select: { roleKey: true, nombre: true } },
          },
        },
        especialidades: {
          include: { servicio: { select: { id: true, nombre: true } } },
        },
        horarios: { orderBy: { diaSemana: 'asc' } },
        comisionConfig: {
          where: { deletedAt: null },
          include: { servicio: { select: { id: true, nombre: true } } },
        },
      },
    });
    if (!empleado) throw new NotFoundException('Empleado no encontrado');
    return empleado;
  }

  async create(dto: CreateEmpleadoDto) {
    await this.limits.verificar('empleados');

    if (dto.usuarioId) {
      await this.validateUsuarioLibre(dto.usuarioId);
    }
    if (dto.sucursalId) {
      await this.validateSucursal(dto.sucursalId);
    }

    return this.prisma.db.empleado.create({
      data: {
        nombre: dto.nombre,
        telefono: dto.telefono,
        puesto: dto.puesto,
        sucursalId: dto.sucursalId,
        usuarioId: dto.usuarioId,
        activo: dto.activo ?? true,
        ...(dto.participaAgenda !== undefined && { participaAgenda: dto.participaAgenda }),
      } as any,
    });
  }

  async update(id: string, dto: UpdateEmpleadoDto) {
    await this.ensureExists(id);

    if (dto.usuarioId) {
      await this.validateUsuarioLibre(dto.usuarioId, id);
    }
    if (dto.sucursalId) {
      await this.validateSucursal(dto.sucursalId);
    }

    return this.prisma.db.empleado.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.telefono !== undefined && { telefono: dto.telefono }),
        ...(dto.puesto !== undefined && { puesto: dto.puesto }),
        ...(dto.sucursalId !== undefined && { sucursalId: dto.sucursalId }),
        ...(dto.usuarioId !== undefined && { usuarioId: dto.usuarioId }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
        ...(dto.enVacaciones !== undefined && { enVacaciones: dto.enVacaciones }),
        ...(dto.participaAgenda !== undefined && { participaAgenda: dto.participaAgenda }),
        ...(dto.modeloPago !== undefined && { modeloPago: dto.modeloPago }),
        ...(dto.sueldoMonto !== undefined && { sueldoMonto: dto.sueldoMonto }),
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.db.empleado.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
    return { success: true };
  }

  // ---------- ESPECIALIDADES ----------
  async setEspecialidades(id: string, dto: SetEspecialidadesDto) {
    await this.ensureExists(id);

    // Validar que los servicios pertenezcan a la empresa
    const servicios = await this.prisma.db.servicio.findMany({
      where: { id: { in: dto.servicioIds } },
      select: { id: true },
    });
    if (servicios.length !== dto.servicioIds.length) {
      throw new BadRequestException('Uno o más servicios no son válidos');
    }

    // Reemplazar el set completo (transaccional)
    await this.prisma.$transaction([
      this.prisma.empleadoServicio.deleteMany({
        where: { empleadoId: id },
      }),
      this.prisma.empleadoServicio.createMany({
        data: dto.servicioIds.map((servicioId) => ({
          empleadoId: id,
          servicioId,
        })),
        skipDuplicates: true,
      }),
    ]);

    return this.getEspecialidades(id);
  }

  async getEspecialidades(id: string) {
    await this.ensureExists(id);
    const items = await this.prisma.empleadoServicio.findMany({
      where: { empleadoId: id },
      include: { servicio: { select: { id: true, nombre: true, precio: true } } },
    });
    return items.map((i) => i.servicio);
  }

  // ---------- HORARIOS ----------
  async setHorarios(id: string, dto: SetHorariosDto) {
    await this.ensureExists(id);

    for (const h of dto.horarios) {
      if (this.toMin(h.horaFin) <= this.toMin(h.horaInicio)) {
        throw new BadRequestException(
          `Horario inválido para día ${h.diaSemana}: la hora fin debe ser mayor que la de inicio`,
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.empleadoHorario.deleteMany({ where: { empleadoId: id } }),
      this.prisma.empleadoHorario.createMany({
        data: dto.horarios.map((h) => ({
          empleadoId: id,
          diaSemana: h.diaSemana,
          horaInicio: h.horaInicio,
          horaFin: h.horaFin,
          activo: h.activo ?? true,
        })),
      }),
    ]);

    return this.prisma.empleadoHorario.findMany({
      where: { empleadoId: id },
      orderBy: { diaSemana: 'asc' },
    });
  }

  // ---------- BLOQUEOS ----------
  async addBloqueo(id: string, dto: CreateBloqueoDto) {
    await this.ensureExists(id);

    const inicio = new Date(dto.inicio);
    const fin = new Date(dto.fin);
    if (fin <= inicio) {
      throw new BadRequestException('La hora fin debe ser posterior a la de inicio');
    }

    return this.prisma.db.bloqueoHorario.create({
      data: {
        empleadoId: id,
        tipo: dto.tipo,
        inicio,
        fin,
        recurrente: dto.recurrente ?? false,
        diaSemana: dto.diaSemana,
        motivo: dto.motivo,
      } as any,
    });
  }

  async getBloqueos(id: string) {
    await this.ensureExists(id);
    return this.prisma.db.bloqueoHorario.findMany({
      where: { empleadoId: id },
      orderBy: { inicio: 'asc' },
    });
  }

  async removeBloqueo(id: string, bloqueoId: string) {
    await this.ensureExists(id);
    const bloqueo = await this.prisma.db.bloqueoHorario.findFirst({
      where: { id: bloqueoId, empleadoId: id },
    });
    if (!bloqueo) throw new NotFoundException('Bloqueo no encontrado');
    await this.prisma.db.bloqueoHorario.update({
      where: { id: bloqueoId },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }

  // ---------- COMISIONES ----------
  async setComisiones(id: string, dto: SetComisionesDto) {
    const empleado = await this.ensureExists(id);

    for (const c of dto.comisiones) {
      if (c.servicioId) {
        const serv = await this.prisma.db.servicio.findFirst({
          where: { id: c.servicioId },
          select: { id: true },
        });
        if (!serv) {
          throw new BadRequestException('Servicio de comisión no válido');
        }
      }
    }

    // Reemplazo total de la configuración de comisiones del empleado
    await this.prisma.db.comisionConfig.updateMany({
      where: { empleadoId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    const empresaId = getEmpresaId();
    await this.prisma.comisionConfig.createMany({
      data: dto.comisiones.map((c) => ({
        empresaId,
        empleadoId: id,
        base: c.base,
        porcentaje: c.porcentaje ?? null,
        montoFijo: c.montoFijo ?? null,
        servicioId: c.servicioId ?? null,
        activo: c.activo ?? true,
      })),
    });

    await this.audit.log({
      modulo: 'EQUIPO',
      entidad: 'ComisionConfig',
      entidadId: id,
      accion: 'UPDATE',
      datosDespues: { empleadoNombre: empleado.nombre, cantidadReglas: dto.comisiones.length },
    });

    return this.getComisiones(id);
  }

  async getComisiones(id: string) {
    await this.ensureExists(id);
    return this.prisma.db.comisionConfig.findMany({
      where: { empleadoId: id, deletedAt: null },
      include: { servicio: { select: { id: true, nombre: true } } },
    });
  }

  async getComisionUi(id: string) {
    await this.ensureExists(id);
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id },
      select: { modeloPago: true, sueldoMonto: true },
    });
    const configs = await this.prisma.db.comisionConfig.findMany({
      where: { empleadoId: id, base: ComisionBase.SERVICIO, deletedAt: null },
      include: { servicio: { select: { id: true, nombre: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const general = configs.find((c) => !c.servicioId);
    const overrides = configs
      .filter((c) => !!c.servicioId)
      .map((c) => ({
        servicioId: c.servicioId!,
        servicioNombre: c.servicio?.nombre ?? '',
        pct: Number(c.porcentaje ?? 0),
      }));
    return {
      modeloPago: empleado!.modeloPago,
      sueldoMonto:
        empleado!.sueldoMonto !== null ? Number(empleado!.sueldoMonto) : null,
      pctBase: general ? Number(general.porcentaje ?? 0) : null,
      overrides,
    };
  }

  async setComisionUi(id: string, dto: SetComisionUiDto) {
    const empleado = await this.ensureExists(id);

    // Validaciones ANTES de cualquier mutación
    if (dto.overrides && dto.overrides.length > 0) {
      const ids = dto.overrides.map((o) => o.servicioId);
      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException(
          'No puede haber servicios duplicados en las excepciones',
        );
      }
      for (const ov of dto.overrides) {
        const svc = await this.prisma.db.servicio.findFirst({
          where: { id: ov.servicioId },
          select: { id: true },
        });
        if (!svc)
          throw new BadRequestException(
            `Servicio no válido: ${ov.servicioId}`,
          );
      }
    }

    // Preparar rows a crear (antes de la transacción)
    const empresaId = getEmpresaId();
    const toCreate: any[] = [];
    if (dto.modeloPago === ModeloPago.COMISION) {
      if (dto.pctBase !== undefined && dto.pctBase !== null) {
        toCreate.push({
          empresaId,
          empleadoId: id,
          base: ComisionBase.SERVICIO,
          porcentaje: dto.pctBase,
          servicioId: null,
          activo: true,
        });
      }
      for (const ov of dto.overrides ?? []) {
        toCreate.push({
          empresaId,
          empleadoId: id,
          base: ComisionBase.SERVICIO,
          porcentaje: ov.pct,
          servicioId: ov.servicioId,
          activo: true,
        });
      }
    }

    // Mutaciones atómicas: si createMany falla el soft-delete se revierte
    await this.prisma.$transaction(async (tx) => {
      await tx.empleado.update({
        where: { id, empresaId },
        data: {
          modeloPago: dto.modeloPago,
          ...(dto.sueldoMonto !== undefined && { sueldoMonto: dto.sueldoMonto }),
        },
      });
      await tx.comisionConfig.updateMany({
        where: { empleadoId: id, empresaId, base: ComisionBase.SERVICIO, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (toCreate.length > 0) {
        await tx.comisionConfig.createMany({ data: toCreate });
      }
    });

    await this.audit.log({
      modulo: 'EQUIPO',
      entidad: 'ComisionConfig',
      entidadId: id,
      accion: 'UPDATE',
      datosDespues: {
        empleadoNombre: empleado.nombre,
        modeloPago: dto.modeloPago,
        pctBase: dto.pctBase ?? null,
        cantidadExcepciones: dto.overrides?.length ?? 0,
      },
    });

    return this.getComisionUi(id);
  }

  // ---------- ACCESO AL SISTEMA ----------
  async crearAcceso(id: string, dto: CrearAccesoDto) {
    const empresaId = getEmpresaId();

    // Verificar empleado existe y no tiene acceso
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id },
      select: { id: true, nombre: true, usuarioId: true },
    });
    if (!empleado) throw new NotFoundException('Empleado no encontrado');
    if (empleado.usuarioId) {
      throw new ConflictException('Este empleado ya tiene acceso al sistema');
    }

    // Verificar límite de usuarios del plan
    await this.limits.verificar('usuarios');

    // Email único en la empresa
    const emailExists = await this.prisma.db.usuario.findFirst({
      where: { email: dto.email },
    });
    if (emailExists) {
      throw new ConflictException('Ya existe un usuario con ese email en la empresa');
    }

    // Rol válido
    const rol = await this.prisma.db.rol.findFirst({ where: { id: dto.rolId } });
    if (!rol) throw new BadRequestException('Rol no válido');

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const { newUsuario } = await this.prisma.$transaction(async (tx) => {
      const newUsuario = await tx.usuario.create({
        data: {
          empresaId,
          nombre: empleado.nombre,
          email: dto.email,
          rolId: dto.rolId,
          passwordHash,
          debeChangePassword: true,
        },
        include: { rol: { select: { roleKey: true, nombre: true } } },
      });
      await tx.empleado.update({
        where: { id },
        data: { usuarioId: newUsuario.id },
      });
      return { newUsuario };
    });

    return {
      usuarioId: newUsuario.id,
      email: newUsuario.email,
      rol: (newUsuario.rol as any).roleKey,
      rolNombre: (newUsuario.rol as any).nombre,
      passwordTemporal: tempPassword,
    };
  }

  async quitarAcceso(id: string) {
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id },
      select: { id: true, usuarioId: true },
    });
    if (!empleado) throw new NotFoundException('Empleado no encontrado');
    if (!empleado.usuarioId) {
      throw new BadRequestException('Este empleado no tiene acceso al sistema');
    }

    const current = getCurrentUser();
    if (current.usuarioId === empleado.usuarioId) {
      throw new BadRequestException('No puedes quitarte el acceso a ti mismo');
    }

    // Desactivar usuario y revocar sesiones
    await this.prisma.db.usuario.update({
      where: { id: empleado.usuarioId },
      data: { activo: false },
    });
    await this.prisma.refreshToken.updateMany({
      where: { usuarioId: empleado.usuarioId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Desvincular del empleado
    await this.prisma.db.empleado.update({
      where: { id },
      data: { usuarioId: null },
    });

    return { success: true };
  }

  // ---------- helpers ----------
  private async ensureExists(id: string) {
    const e = await this.prisma.db.empleado.findFirst({
      where: { id },
      select: { id: true, nombre: true },
    });
    if (!e) throw new NotFoundException('Empleado no encontrado');
    return e;
  }

  private async validateUsuarioLibre(usuarioId: string, exceptEmpleadoId?: string) {
    const usuario = await this.prisma.db.usuario.findFirst({
      where: { id: usuarioId },
      select: { id: true },
    });
    if (!usuario) throw new BadRequestException('Usuario no válido');

    const yaAsignado = await this.prisma.db.empleado.findFirst({
      where: {
        usuarioId,
        ...(exceptEmpleadoId ? { id: { not: exceptEmpleadoId } } : {}),
      },
      select: { id: true },
    });
    if (yaAsignado) {
      throw new ConflictException('Ese usuario ya está asociado a otro empleado');
    }
  }

  private async validateSucursal(sucursalId: string) {
    const suc = await this.prisma.db.sucursal.findFirst({
      where: { id: sucursalId },
      select: { id: true },
    });
    if (!suc) throw new BadRequestException('Sucursal no válida');
  }

  private toMin(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  private generateTempPassword(): string {
    return randomBytes(8).toString('base64url').slice(0, 10);
  }
}
