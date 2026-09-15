import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  CreateUsuarioDto,
  UpdateUsuarioDto,
  ResetUsuarioPasswordDto,
} from './dto/usuario.dto';
import { getCurrentUser } from '../../core/tenant/tenant-context';
import { LimitsService } from '../superadmin/limits.service';
import { AuditService } from '../../core/audit/audit.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    const usuarios = await this.prisma.db.usuario.findMany({
      include: { rol: { select: { nombre: true, roleKey: true } } },
      orderBy: { nombre: 'asc' },
    });
    return usuarios.map((u) => this.toResponse(u));
  }

  async findOne(id: string) {
    const usuario = await this.prisma.db.usuario.findFirst({
      where: { id },
      include: { rol: { select: { nombre: true, roleKey: true } } },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return this.toResponse(usuario);
  }

  async create(dto: CreateUsuarioDto) {
    // Validar límite del plan antes de crear
    await this.limits.verificar('usuarios');

    // El rol debe existir y pertenecer a la empresa (filtro de tenant aplica)
    const rol = await this.prisma.db.rol.findFirst({
      where: { id: dto.rolId },
    });
    if (!rol) throw new BadRequestException('Rol no válido');

    // Email único por empresa
    const existe = await this.prisma.db.usuario.findFirst({
      where: { email: dto.email },
    });
    if (existe) {
      throw new ConflictException('Ya existe un usuario con ese email en la empresa');
    }

    // Contraseña: la provista o una temporal con cambio obligatorio
    const tempPassword = dto.password ?? this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const debeChangePassword = !dto.password;

    const usuario = await this.prisma.db.usuario.create({
      data: {
        nombre: dto.nombre,
        email: dto.email,
        telefono: dto.telefono,
        rolId: dto.rolId,
        passwordHash,
        debeChangePassword,
      } as any,
      include: { rol: { select: { nombre: true, roleKey: true } } },
    });

    await this.audit.log({
      modulo: 'USUARIOS',
      entidad: 'Usuario',
      entidadId: usuario.id,
      accion: 'CREATE',
      datosDespues: { nombre: usuario.nombre, email: usuario.email, rol: (usuario as any).rol?.roleKey },
    });

    return {
      ...this.toResponse(usuario),
      // Solo se devuelve la temporal si el sistema la generó
      ...(debeChangePassword ? { passwordTemporal: tempPassword } : {}),
    };
  }

  async update(id: string, dto: UpdateUsuarioDto) {
    const antes = await this.prisma.db.usuario.findFirst({
      where: { id },
      include: { rol: { select: { nombre: true, roleKey: true } } },
    });
    if (!antes) throw new NotFoundException('Usuario no encontrado');

    if (dto.rolId) {
      const rol = await this.prisma.db.rol.findFirst({ where: { id: dto.rolId } });
      if (!rol) throw new BadRequestException('Rol no válido');
    }

    const usuario = await this.prisma.db.usuario.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.telefono !== undefined && { telefono: dto.telefono }),
        ...(dto.rolId !== undefined && { rolId: dto.rolId }),
      },
      include: { rol: { select: { nombre: true, roleKey: true } } },
    });

    // Cambio de rol/permisos: es lo más sensible de esta pantalla, así que
    // se marca con su propia acción en vez de un UPDATE genérico.
    const cambioRol = dto.rolId !== undefined && dto.rolId !== antes.rolId;
    await this.audit.log({
      modulo: 'USUARIOS',
      entidad: 'Usuario',
      entidadId: id,
      accion: cambioRol ? 'CHANGE_ROLE' : 'UPDATE',
      datosAntes: { nombre: antes.nombre, rol: antes.rol?.roleKey },
      datosDespues: { nombre: usuario.nombre, rol: (usuario as any).rol?.roleKey },
    });

    return this.toResponse(usuario);
  }

  async activar(id: string) {
    await this.ensureExists(id);
    const usuario = await this.prisma.db.usuario.update({
      where: { id },
      data: { activo: true },
    });
    await this.audit.log({
      modulo: 'USUARIOS',
      entidad: 'Usuario',
      entidadId: id,
      accion: 'ACTIVATE',
      datosDespues: { nombre: usuario.nombre },
    });
    return { success: true, activo: true };
  }

  async desactivar(id: string) {
    const usuario = await this.prisma.db.usuario.findFirst({ where: { id }, select: { id: true, nombre: true } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    // No permitir auto-desactivarse
    const current = getCurrentUser();
    if (current.usuarioId === id) {
      throw new BadRequestException('No puedes desactivar tu propio usuario');
    }

    await this.prisma.db.usuario.update({
      where: { id },
      data: { activo: false },
    });
    // Revocar sesiones activas del usuario desactivado
    await this.prisma.refreshToken.updateMany({
      where: { usuarioId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.log({
      modulo: 'USUARIOS',
      entidad: 'Usuario',
      entidadId: id,
      accion: 'DEACTIVATE',
      datosDespues: { nombre: usuario.nombre },
    });

    return { success: true, activo: false };
  }

  async resetPassword(id: string, dto: ResetUsuarioPasswordDto) {
    const usuario = await this.prisma.db.usuario.findFirst({ where: { id }, select: { id: true, nombre: true } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    const newPassword = dto.newPassword ?? this.generateTempPassword();
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const debeChangePassword = !dto.newPassword;

    await this.prisma.db.usuario.update({
      where: { id },
      data: { passwordHash, debeChangePassword },
    });
    // Invalidar sesiones tras el reset
    await this.prisma.refreshToken.updateMany({
      where: { usuarioId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.log({
      modulo: 'USUARIOS',
      entidad: 'Usuario',
      entidadId: id,
      accion: 'RESET_PASSWORD',
      datosDespues: { nombre: usuario.nombre },
    });

    return {
      success: true,
      ...(debeChangePassword ? { passwordTemporal: newPassword } : {}),
    };
  }

  async getRoles() {
    const roles = await this.prisma.db.rol.findMany({
      select: { id: true, roleKey: true, nombre: true },
      orderBy: { nombre: 'asc' },
    });
    // La DB puede tener duplicados por roleKey (seed con y sin tilde).
    // Iteramos en orden asc → la última escritura en el Map es la versión acentuada (ñ > n, ó > o en Unicode).
    const byKey = new Map<string, (typeof roles)[0]>();
    for (const r of roles) byKey.set(r.roleKey as string, r);
    return [...byKey.values()];
  }

  // ---------- helpers ----------
  private async ensureExists(id: string) {
    const u = await this.prisma.db.usuario.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!u) throw new NotFoundException('Usuario no encontrado');
  }

  private generateTempPassword(): string {
    // 10 chars alfanuméricos legibles
    return randomBytes(8).toString('base64url').slice(0, 10);
  }

  private toResponse(u: any) {
    return {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      telefono: u.telefono,
      rolId: u.rolId,
      rol: u.rol?.roleKey,
      rolNombre: u.rol?.nombre,
      activo: u.activo,
      debeChangePassword: u.debeChangePassword,
      ultimoLogin: u.ultimoLogin,
      createdAt: u.createdAt,
    };
  }
}
