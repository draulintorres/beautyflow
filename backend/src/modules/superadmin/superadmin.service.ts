import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  SuperAdminLoginDto,
  CrearEmpresaDto,
  EditarEmpresaDto,
  CrearPlanDto,
  UpdatePlanDto,
  CambiarPlanDto,
  ToggleModuloDto,
} from './dto/superadmin.dto';
import {
  EmpresaStatus,
  SubStatus,
  RoleKey,
  PlanType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { ModulosEfectivosService } from './modulos-efectivos.service';
import { MODULOS_GATEABLES, MODULOS_POR_PLAN } from '../../core/auth/permisos.matrix';

/**
 * Servicio del Super Admin. Opera SIN contexto de tenant: usa el cliente
 * Prisma crudo (this.prisma, no this.prisma.db) porque gestiona TODAS las
 * empresas de la plataforma.
 */
@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly modulosEfectivos: ModulosEfectivosService,
  ) {}

  // ============ AUTH ============
  async login(dto: SuperAdminLoginDto) {
    const admin = await this.prisma.superAdmin.findUnique({
      where: { email: dto.email },
    });
    if (!admin || !admin.activo || admin.deletedAt) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const valido = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!valido) throw new UnauthorizedException('Credenciales inválidas');

    await this.prisma.superAdmin.update({
      where: { id: admin.id },
      data: { ultimoLogin: new Date() },
    });

    const accessToken = this.jwt.sign(
      { sub: admin.id, tipo: 'superadmin' },
      {
        secret: this.config.getOrThrow('JWT_SUPERADMIN_SECRET'),
        expiresIn: '8h',
      },
    );
    return {
      accessToken,
      admin: { id: admin.id, nombre: admin.nombre, email: admin.email },
    };
  }

  // ============ EMPRESAS ============
  async listarEmpresas(filtro?: { estado?: EmpresaStatus }) {
    const empresas = await this.prisma.empresa.findMany({
      where: {
        deletedAt: null,
        ...(filtro?.estado && { estado: filtro.estado }),
      },
      include: {
        subscription: { include: { planRef: true } },
        _count: { select: { usuarios: true, sucursales: true, empleados: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return empresas.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      slug: e.slug,
      estado: e.estado,
      plan: e.subscription?.planRef?.nombre ?? e.plan,
      planEstado: e.subscription?.status,
      proximoPago: e.subscription?.currentPeriodEnd,
      usuarios: e._count.usuarios,
      sucursales: e._count.sucursales,
      empleados: e._count.empleados,
      createdAt: e.createdAt,
    }));
  }

  async crearEmpresa(dto: CrearEmpresaDto) {
    // slug único
    const existe = await this.prisma.empresa.findUnique({
      where: { slug: dto.slug },
    });
    if (existe) throw new ConflictException('El slug ya está en uso');

    const plan = await this.prisma.plan.findFirst({
      where: { id: dto.planId, deletedAt: null },
    });
    if (!plan) throw new BadRequestException('Plan no válido');

    const ownerPassword = dto.ownerPassword ?? randomBytes(6).toString('base64url');
    const passwordHash = await bcrypt.hash(ownerPassword, 12);

    const resultado = await this.prisma.$transaction(async (tx) => {
      // Crear empresa
      const empresa = await tx.empresa.create({
        data: {
          nombre: dto.nombre,
          slug: dto.slug,
          verticales: dto.verticales ?? [],
          plan: plan.tipo,
          estado: EmpresaStatus.ACTIVE,
        },
      });

      // Crear suscripción
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await tx.subscription.create({
        data: {
          empresaId: empresa.id,
          planId: plan.id,
          plan: plan.tipo,
          status: SubStatus.ACTIVE,
          currentPeriodEnd: periodEnd,
        },
      });

      // Catálogo completo de roles (mismo patrón que prisma/seed.ts) — el
      // sistema de permisos ya asume estos 11 roles fijos, hardcodeados en
      // `permisos.matrix.ts` (MATRIZ por RoleKey), así que toda empresa
      // nueva los necesita desde el día uno para poder dar acceso a
      // alguien sin que ese alguien termine siendo OWNER (único rol que
      // existía hasta ahora, ver commit anterior). No se filtra por
      // vertical de negocio — es el mismo catálogo fijo para todas.
      const ROLES_ESTANDAR: { nombre: string; roleKey: RoleKey }[] = [
        { nombre: 'Dueño', roleKey: RoleKey.OWNER },
        { nombre: 'Administrador', roleKey: RoleKey.ADMIN },
        { nombre: 'Encargado', roleKey: RoleKey.MANAGER },
        { nombre: 'Cajero', roleKey: RoleKey.CASHIER },
        { nombre: 'Recepción', roleKey: RoleKey.RECEPCION },
        { nombre: 'Estilista', roleKey: RoleKey.ESTILISTA },
        { nombre: 'Manicurista', roleKey: RoleKey.MANICURISTA },
        { nombre: 'Barbero', roleKey: RoleKey.BARBERO },
        { nombre: 'Esteticista', roleKey: RoleKey.ESTETICISTA },
        { nombre: 'Masajista', roleKey: RoleKey.MASAJISTA },
        { nombre: 'Inquilino', roleKey: RoleKey.ALQUILER },
      ];
      // Secuencial (no Promise.all) — varias queries concurrentes sobre el
      // mismo `tx` de una transacción interactiva de Prisma no son seguras.
      const rolesCreados: { id: string; roleKey: RoleKey }[] = [];
      for (const r of ROLES_ESTANDAR) {
        rolesCreados.push(
          await tx.rol.create({
            data: {
              empresaId: empresa.id,
              nombre: r.nombre,
              roleKey: r.roleKey,
              esSistema: true,
            },
          }),
        );
      }
      const rolOwner = rolesCreados.find((r) => r.roleKey === RoleKey.OWNER)!;

      // Usuario OWNER
      await tx.usuario.create({
        data: {
          empresaId: empresa.id,
          rolId: rolOwner.id,
          nombre: dto.ownerNombre,
          email: dto.ownerEmail,
          passwordHash,
        },
      });

      // Sucursal principal
      await tx.sucursal.create({
        data: {
          empresaId: empresa.id,
          nombre: 'Principal',
          esPrincipal: true,
        },
      });

      // Método de pago base — sin esto el POS no tenía nada que ofrecer al
      // cobrar (el grid de métodos salía vacío y el botón de confirmar
      // terminaba mandando la venta como fiao por accidente). Solo
      // Efectivo: es el único método universal a cualquier negocio;
      // Tarjeta/Transferencia dependen de cómo cobra cada quien, y los
      // configura el dueño (pantalla de Ajustes pendiente, ronda aparte).
      await tx.metodoPago.create({
        data: {
          empresaId: empresa.id,
          nombre: 'Efectivo',
          esEfectivo: true,
          activo: true,
          orden: 1,
        },
      });

      return empresa;
    });

    // Punto de asignación de plan — sincronizar modulos_activos
    await this.sincronizarModulosEmpresa(resultado.id, plan.tipo);

    return {
      id: resultado.id,
      slug: resultado.slug,
      ownerEmail: dto.ownerEmail,
      // Solo se devuelve si se generó automáticamente
      ...(dto.ownerPassword ? {} : { ownerPasswordTemporal: ownerPassword }),
    };
  }

  async editarEmpresa(id: string, dto: EditarEmpresaDto) {
    await this.ensureEmpresa(id);
    let planTipo: PlanType | undefined;
    if (dto.planId) {
      const plan = await this.prisma.plan.findFirst({
        where: { id: dto.planId, deletedAt: null },
      });
      if (!plan) throw new BadRequestException('Plan no válido');
      // Punto de cambio de plan — actualizar subscription y empresa.plan
      await this.prisma.subscription.update({
        where: { empresaId: id },
        data: { planId: plan.id, plan: plan.tipo },
      });
      planTipo = plan.tipo;
    }
    const resultado = await this.prisma.empresa.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(planTipo !== undefined && { plan: planTipo }),
      },
    });
    // Sincronizar modulos_activos si cambió el plan
    if (planTipo !== undefined) {
      await this.sincronizarModulosEmpresa(id, planTipo);
    }
    return resultado;
  }

  async suspenderEmpresa(id: string, motivo?: string) {
    await this.ensureEmpresa(id);
    await this.prisma.$transaction([
      this.prisma.empresa.update({
        where: { id },
        data: { estado: EmpresaStatus.SUSPENDED },
      }),
      this.prisma.subscription.update({
        where: { empresaId: id },
        data: { status: SubStatus.SUSPENDED },
      }),
    ]);
    return { success: true, estado: 'SUSPENDIDA', motivo };
  }

  async reactivarEmpresa(id: string) {
    await this.ensureEmpresa(id);
    await this.prisma.$transaction([
      this.prisma.empresa.update({
        where: { id },
        data: { estado: EmpresaStatus.ACTIVE },
      }),
      this.prisma.subscription.update({
        where: { empresaId: id },
        data: { status: SubStatus.ACTIVE },
      }),
    ]);
    return { success: true, estado: 'ACTIVA' };
  }

  async eliminarEmpresa(id: string) {
    await this.ensureEmpresa(id);
    await this.prisma.empresa.update({
      where: { id },
      data: { deletedAt: new Date(), estado: EmpresaStatus.CANCELED },
    });
    return { success: true };
  }

  // ============ PLANES ============
  async listarPlanes() {
    return this.prisma.plan.findMany({
      where: { deletedAt: null },
      orderBy: { orden: 'asc' },
    });
  }

  async crearPlan(dto: CrearPlanDto) {
    return this.prisma.plan.create({
      data: {
        nombre: dto.nombre,
        tipo: dto.tipo,
        precio: dto.precio,
        maxUsuarios: dto.maxUsuarios ?? null,
        maxSucursales: dto.maxSucursales ?? null,
        maxEmpleados: dto.maxEmpleados ?? null,
        modulos: dto.modulos ?? [],
        activo: dto.activo ?? true,
        orden: dto.orden ?? 0,
      },
    });
  }

  async actualizarPlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.prisma.plan.findFirst({
      where: { id, deletedAt: null },
    });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    return this.prisma.plan.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.tipo !== undefined && { tipo: dto.tipo }),
        ...(dto.precio !== undefined && { precio: dto.precio }),
        ...(dto.maxUsuarios !== undefined && { maxUsuarios: dto.maxUsuarios }),
        ...(dto.maxSucursales !== undefined && { maxSucursales: dto.maxSucursales }),
        ...(dto.maxEmpleados !== undefined && { maxEmpleados: dto.maxEmpleados }),
        ...(dto.modulos !== undefined && { modulos: dto.modulos }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
        ...(dto.orden !== undefined && { orden: dto.orden }),
      },
    });
  }

  // ============ MÓDULOS POR PLAN ============

  /**
   * Upsert de los 5 gateables en modulos_activos según el plan.
   * activo=true si el plan los incluye, activo=false si no.
   */
  async sincronizarModulosEmpresa(empresaId: string, planType: PlanType): Promise<void> {
    const gateablesDelPlan = MODULOS_POR_PLAN[planType] ?? [];
    await Promise.all(
      MODULOS_GATEABLES.map((modulo) =>
        this.prisma.moduloActivo.upsert({
          where: { empresaId_modulo: { empresaId, modulo } },
          create: { empresaId, modulo, activo: gateablesDelPlan.includes(modulo) },
          update: { activo: gateablesDelPlan.includes(modulo) },
        }),
      ),
    );
    this.modulosEfectivos.invalidar(empresaId);
  }

  /** Cambia el plan de una empresa — crea Subscription si no existe (ej. Beauty Glam). */
  async cambiarPlan(empresaId: string, dto: CambiarPlanDto) {
    await this.ensureEmpresa(empresaId);
    const plan = await this.prisma.plan.findFirst({
      where: { id: dto.planId, deletedAt: null },
    });
    if (!plan) throw new BadRequestException('Plan no válido');

    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await this.prisma.$transaction([
      this.prisma.empresa.update({
        where: { id: empresaId },
        data: { plan: plan.tipo },
      }),
      this.prisma.subscription.upsert({
        where: { empresaId },
        create: {
          empresaId,
          planId: plan.id,
          plan: plan.tipo,
          status: SubStatus.ACTIVE,
          currentPeriodEnd: periodEnd,
        },
        update: { planId: plan.id, plan: plan.tipo },
      }),
    ]);

    await this.sincronizarModulosEmpresa(empresaId, plan.tipo);
    return { success: true, plan: plan.nombre, tipo: plan.tipo };
  }

  /** Override manual de un módulo gateable en una empresa específica. */
  async toggleModuloEmpresa(empresaId: string, dto: ToggleModuloDto) {
    if (!(MODULOS_GATEABLES as string[]).includes(dto.modulo)) {
      throw new BadRequestException(
        `El módulo '${dto.modulo}' no es gateable. Los módulos base no se pueden apagar. Gateables válidos: ${MODULOS_GATEABLES.join(', ')}.`,
      );
    }
    await this.ensureEmpresa(empresaId);

    await this.prisma.moduloActivo.upsert({
      where: { empresaId_modulo: { empresaId, modulo: dto.modulo } },
      create: { empresaId, modulo: dto.modulo, activo: dto.activo },
      update: { activo: dto.activo },
    });

    this.modulosEfectivos.invalidar(empresaId);
    return { success: true, modulo: dto.modulo, activo: dto.activo };
  }

  // ============ helpers ============
  private async ensureEmpresa(id: string) {
    const e = await this.prisma.empresa.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!e) throw new NotFoundException('Empresa no encontrada');
  }
}
