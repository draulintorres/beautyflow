import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DisponibilidadService } from '../empleados/disponibilidad.service';
import {
  CreateCitaDto,
  RescheduleCitaDto,
  ESTADO_ES_TO_ENUM,
  ENUM_TO_ESTADO_ES,
} from './dto/cita.dto';
import { getEmpresaId, getCurrentUser } from '../../core/tenant/tenant-context';
import { SucursalScopeService } from '../../core/tenant/sucursal-scope.service';
import { AuditService } from '../../core/audit/audit.service';
import { InquilinoService } from '../../core/auth/inquilino.service';
import { NotificationService } from '../notificaciones/notification.service';
import {
  CitaStatus,
  CitaOrigen,
  NotificacionEvento,
  Prisma,
  VentaStatus,
  ModeloPago,
  RoleKey,
} from '@prisma/client';

/** Roles "de negocio": ven el ingreso del SALÓN, no el de un empleado
 *  individual. Coincide con quiénes NO son un especialista de silla
 *  (BARBERO/ESTILISTA/MANICURISTA/ESTETICISTA/MASAJISTA) ni un inquilino. */
const ROLES_SALON = new Set<RoleKey>([
  RoleKey.OWNER,
  RoleKey.ADMIN,
  RoleKey.MANAGER,
  RoleKey.RECEPCION,
  RoleKey.CASHIER,
]);

/** Transiciones de estado permitidas. */
const TRANSICIONES: Record<CitaStatus, CitaStatus[]> = {
  [CitaStatus.SCHEDULED]: [
    CitaStatus.CONFIRMED,
    CitaStatus.IN_PROGRESS,
    CitaStatus.CANCELED,
    CitaStatus.NO_SHOW,
  ],
  [CitaStatus.CONFIRMED]: [
    CitaStatus.IN_PROGRESS,
    CitaStatus.CANCELED,
    CitaStatus.NO_SHOW,
  ],
  [CitaStatus.IN_PROGRESS]: [CitaStatus.COMPLETED, CitaStatus.CANCELED],
  [CitaStatus.COMPLETED]: [], // terminal
  [CitaStatus.CANCELED]: [], // terminal
  [CitaStatus.NO_SHOW]: [], // terminal
};

@Injectable()
export class AgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly disponibilidad: DisponibilidadService,
    private readonly audit: AuditService,
    private readonly notif: NotificationService,
    private readonly inquilinoSvc: InquilinoService,
    private readonly sucursalScope: SucursalScopeService,
  ) {}

  // ---------- CREAR ----------
  async create(dto: CreateCitaDto) {
    const empresaId = getEmpresaId();

    // Corrección (agenda del inquilino): si quien crea es un inquilino, se
    // FUERZA el empleadoId de la cita al suyo — se ignora silenciosamente
    // cualquier empleadoId que mande el cliente. Mismo enfoque que las
    // líneas del POS en Pieza 3 (forzar > rechazar: más robusto y no
    // requiere que el frontend adivine bien antes de enviar).
    const inquilino = await this.inquilinoSvc.resolverInquilino();
    let empleadoId: string;
    if (inquilino.esInquilino) {
      empleadoId = inquilino.empleadoId!;
    } else if (dto.empleadoId) {
      empleadoId = dto.empleadoId;
    } else {
      // Sin profesional elegido: la cita queda para el dueño mismo (solo
      // válido si quien crea la cita ES el OWNER — resolveEmpleadoParaCita
      // rechaza cualquier otro rol en vez de adivinar).
      empleadoId = (await this.resolveEmpleadoParaCita()).id;
    }
    dto = { ...dto, empleadoId };

    // 1. Validar cliente y empleado
    const [cliente, empleado] = await Promise.all([
      this.prisma.db.cliente.findFirst({
        where: { id: dto.clienteId },
        select: { id: true },
      }),
      this.prisma.db.empleado.findFirst({
        where: { id: empleadoId },
        select: { id: true, sucursalId: true },
      }),
    ]);
    if (!cliente) throw new BadRequestException('Cliente no válido');
    if (!empleado) throw new BadRequestException('Empleado no válido');

    // sucursalId explícito del body (si el caller no manda uno, se usa el
    // del empleado más abajo) — Parte B de la auditoría de aislamiento,
    // 2026-09-11: no se validaba, así que una cita podía quedar con un
    // sucursalId de otra empresa.
    if (dto.sucursalId) {
      const sucursal = await this.prisma.db.sucursal.findFirst({
        where: { id: dto.sucursalId },
        select: { id: true },
      });
      if (!sucursal) throw new BadRequestException('Sucursal no válida');
    }

    // 2. Cargar servicios y calcular duración, precios, cabina
    const servicios = await this.prisma.db.servicio.findMany({
      where: { id: { in: dto.servicios } },
    });
    if (servicios.length !== dto.servicios.length) {
      throw new BadRequestException('Uno o más servicios no son válidos');
    }

    const duracionTotal = servicios.reduce((a, s) => a + s.duracionMin, 0);
    const requiereCabina = servicios.some((s) => s.requiereCabina);

    // 3. Construir rango de tiempo
    const inicio = new Date(`${dto.fecha}T${dto.horaInicio}:00`);
    const fin = new Date(inicio.getTime() + duracionTotal * 60_000);

    // 4. Anti-solapamiento del empleado (regla más importante)
    const libre = await this.disponibilidad.estaDisponible(
      empleadoId,
      inicio,
      fin,
    );
    if (!libre) {
      throw new ConflictException(
        'El empleado ya tiene una cita o bloqueo en ese horario',
      );
    }

    // 5. Resolver cabina si algún servicio la requiere
    const sucursalId = dto.sucursalId ?? empleado.sucursalId ?? undefined;
    let cabinaId: string | undefined;
    if (requiereCabina) {
      if (!sucursalId) {
        throw new BadRequestException(
          'Se requiere una sucursal para asignar cabina',
        );
      }
      const cabina = await this.disponibilidad.findCabinaLibre(
        sucursalId,
        inicio,
        fin,
      );
      if (!cabina) {
        throw new ConflictException(
          'No hay cabinas disponibles en ese horario',
        );
      }
      cabinaId = cabina;
    }

    // 6. Calcular montos
    const subtotal = servicios.reduce((a, s) => a + Number(s.precio), 0);
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { itbisPct: true },
    });
    const itbis = subtotal * (Number(empresa?.itbisPct ?? 0) / 100);
    const total = subtotal + itbis;

    // 7. Crear cita + servicios en una transacción
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore TS2321: Excessive stack depth — Prisma extended client; funciona en runtime
    const cita = await this.prisma.db.cita.create({
      data: {
        sucursalId,
        clienteId: dto.clienteId,
        empleadoId,
        cabinaId,
        inicio,
        fin,
        estado: CitaStatus.SCHEDULED,
        subtotal,
        itbis,
        total,
        origen: dto.origen ?? CitaOrigen.WEB,
        notas: dto.notas,
        servicios: {
          create: servicios.map((s) => ({
            servicioId: s.id,
            precio: s.precio,
            duracionMin: s.duracionMin,
          })),
        },
      } as any,
      include: this.fullInclude(),
    });

    await this.audit.log({
      modulo: 'AGENDA',
      entidad: 'Cita',
      entidadId: cita.id,
      accion: 'CREATE',
      datosDespues: { empleadoId, inicio, fin, total },
    });

    await this.notif.notificar({
      evento: NotificacionEvento.CITA_CREADA,
      clienteId: dto.clienteId,
      variables: {
        fecha: inicio.toISOString().slice(0, 10),
        hora: `${String(inicio.getHours()).padStart(2, '0')}:${String(inicio.getMinutes()).padStart(2, '0')}`,
      },
      referenciaTipo: 'CITA',
      referenciaId: cita.id,
    });

    return this.toResponse(cita);
  }

  // ---------- CONSULTAR AGENDA ----------
  /**
   * Alquiler de silla (Pieza 3): si quien consulta es un inquilino, el
   * empleadoId que venga en el query se IGNORA por completo y se fuerza al
   * suyo — un inquilino nunca puede ver la agenda de otro, ni manipulando
   * la petición.
   */
  async findByFecha(
    fecha: string,
    empleadoIdQuery?: string,
    sucursalIdQuery?: string,
  ) {
    const inquilino = await this.inquilinoSvc.resolverInquilino();
    const empleadoId = inquilino.esInquilino
      ? inquilino.empleadoId!
      : empleadoIdQuery;

    const dayStart = new Date(`${fecha}T00:00:00`);
    const dayEnd = new Date(`${fecha}T23:59:59.999`);

    // Aislamiento por sucursal: un usuario no-OWNER asignado a una sucursal
    // solo ve las citas de esa sucursal. El OWNER puede pasar `sucursalId`
    // (viene del selector del Dashboard) para ver solo una sucursal; sin él
    // ve todas.
    const scope = await this.sucursalScope.resolve();
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sucursalId = scope.scoped
      ? scope.sucursalId
      : sucursalIdQuery && UUID_RE.test(sucursalIdQuery)
        ? sucursalIdQuery
        : null;

    const citas = await this.prisma.db.cita.findMany({
      where: {
        ...(sucursalId && { sucursalId }),
        inicio: { gte: dayStart, lte: dayEnd },
        ...(empleadoId && { empleadoId }),
      },
      include: this.fullInclude(),
      orderBy: { inicio: 'asc' },
    });

    return citas.map((c) => this.toResponse(c));
  }

  async findOne(id: string) {
    const cita = await this.prisma.db.cita.findFirst({
      where: { id },
      include: this.fullInclude(),
    });
    if (!cita) throw new NotFoundException('Cita no encontrada');

    const inquilino = await this.inquilinoSvc.resolverInquilino();
    if (inquilino.esInquilino && cita.empleadoId !== inquilino.empleadoId) {
      throw new NotFoundException('Cita no encontrada');
    }
    return this.toResponse(cita);
  }

  /**
   * KPI "Ingreso de hoy" (dinero REAL, a diferencia de "Ingreso esperado"
   * que es la proyección de citas y se sigue calculando en el frontend a
   * partir de `findByFecha` — esto no lo toca).
   *
   * Base: ventas PAGADA creadas hoy (mismo rango de fecha que usa
   * `findByFecha`/`VentasService.findAll` — sin conversión de TZ RD porque
   * `fecha` ya llega como string del cliente, igual que en esos dos; no
   * hay contexto-sin-request como en los crons que justifique ese patrón
   * aquí).
   *
   * Filtrado por quién mira — FORZADO en backend, nunca por lo que pida el
   * cliente:
   * - Inquilino: solo ventas donde aparece su propio empleadoId en alguna
   *   línea (directo o por caja, todo es su ingreso).
   * - Roles de negocio (dueño/admin/manager/recepción/cajero): ingreso del
   *   SALÓN — se excluye toda venta que tenga una línea de un inquilino
   *   (directo O por caja: ninguno de los dos es dinero del salón, el
   *   por-caja ya se ve aparte en el desglose de arqueo de Pieza 2b). Una
   *   venta de puro producto sin línea de inquilino sí cuenta.
   * - Especialista normal (comisión/sueldo): solo ventas donde aparece su
   *   propio empleadoId.
   */
  async ingresoHoy(fecha: string): Promise<number> {
    const dayStart = new Date(`${fecha}T00:00:00`);
    const dayEnd = new Date(`${fecha}T23:59:59.999`);

    // Aislamiento por sucursal: si el usuario está limitado a una sucursal,
    // "Ingreso de hoy" cuenta solo las ventas de esa sucursal.
    const suc = await this.sucursalScope.whereSucursal();

    const ventas = await this.prisma.db.venta.findMany({
      where: {
        ...suc,
        estado: VentaStatus.PAGADA,
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      select: { total: true, detalles: { select: { empleadoId: true } } },
    });

    const inquilino = await this.inquilinoSvc.resolverInquilino();
    if (inquilino.esInquilino) {
      return this.round(
        ventas
          .filter((v) => v.detalles.some((d) => d.empleadoId === inquilino.empleadoId))
          .reduce((s, v) => s + Number(v.total), 0),
      );
    }

    const user = getCurrentUser();
    if (ROLES_SALON.has(user.rol as RoleKey)) {
      const inquilinos = await this.prisma.db.empleado.findMany({
        where: { modeloPago: ModeloPago.ALQUILER, alquilerConfig: { activo: true } },
        select: { id: true },
      });
      const idsInquilinos = new Set(inquilinos.map((e) => e.id));
      return this.round(
        ventas
          .filter((v) => !v.detalles.some((d) => d.empleadoId && idsInquilinos.has(d.empleadoId)))
          .reduce((s, v) => s + Number(v.total), 0),
      );
    }

    // Especialista normal (comisión/sueldo): su propio ingreso.
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { usuarioId: user.usuarioId },
      select: { id: true },
    });
    if (!empleado) return 0;
    return this.round(
      ventas
        .filter((v) => v.detalles.some((d) => d.empleadoId === empleado.id))
        .reduce((s, v) => s + Number(v.total), 0),
    );
  }

  // ---------- CAMBIAR ESTADO ----------
  async changeEstado(id: string, estadoEs: string) {
    const cita = await this.prisma.db.cita.findFirst({
      where: { id },
      select: { id: true, estado: true, empleadoId: true },
    });
    if (!cita) throw new NotFoundException('Cita no encontrada');
    await this.assertPropiaSiInquilino(cita.empleadoId);

    const nuevoEstado = ESTADO_ES_TO_ENUM[estadoEs];
    const permitidas = TRANSICIONES[cita.estado];

    if (cita.estado === nuevoEstado) {
      return this.findOne(id);
    }
    if (!permitidas.includes(nuevoEstado)) {
      throw new BadRequestException(
        `No se puede pasar de ${ENUM_TO_ESTADO_ES[cita.estado]} a ${estadoEs}`,
      );
    }

    await this.prisma.db.cita.update({
      where: { id },
      data: { estado: nuevoEstado },
    });
    return this.findOne(id);
  }

  // ---------- CANCELAR ----------
  async cancelar(id: string) {
    const cita = await this.prisma.db.cita.findFirst({
      where: { id },
      select: { id: true, estado: true, empleadoId: true },
    });
    if (!cita) throw new NotFoundException('Cita no encontrada');
    await this.assertPropiaSiInquilino(cita.empleadoId);

    if (
      cita.estado === CitaStatus.COMPLETED ||
      cita.estado === CitaStatus.CANCELED ||
      cita.estado === CitaStatus.NO_SHOW
    ) {
      throw new BadRequestException(
        'No se puede cancelar una cita finalizada, cancelada o no asistida',
      );
    }

    await this.prisma.db.cita.update({
      where: { id },
      data: { estado: CitaStatus.CANCELED },
    });
    await this.audit.log({
      modulo: 'AGENDA',
      entidad: 'Cita',
      entidadId: id,
      accion: 'CANCEL',
      datosAntes: { estado: cita.estado },
      datosDespues: { estado: 'CANCELED' },
    });
    await this.notif.notificar({
      evento: NotificacionEvento.CANCELACION,
      clienteId: (await this.prisma.db.cita.findFirst({ where: { id }, select: { clienteId: true } }))?.clienteId ?? undefined,
      referenciaTipo: 'CITA',
      referenciaId: id,
    });
    return this.findOne(id);
  }

  // ---------- REPROGRAMAR ----------
  async reschedule(id: string, dto: RescheduleCitaDto) {
    const cita = await this.prisma.db.cita.findFirst({
      where: { id },
      include: { servicios: true },
    });
    if (!cita) throw new NotFoundException('Cita no encontrada');
    const inquilino = await this.assertPropiaSiInquilino(cita.empleadoId);

    if (
      cita.estado === CitaStatus.COMPLETED ||
      cita.estado === CitaStatus.CANCELED ||
      cita.estado === CitaStatus.NO_SHOW
    ) {
      throw new BadRequestException(
        'No se puede reprogramar una cita finalizada, cancelada o no asistida',
      );
    }

    // Un inquilino nunca reasigna su cita a otro empleado, aunque lo mande
    // en el body — se fuerza a que siga siendo la suya.
    const empleadoId = inquilino.esInquilino
      ? cita.empleadoId
      : (dto.empleadoId ?? cita.empleadoId);
    // Si se está reasignando a otro empleado, confirmar que es de esta
    // empresa (Parte B de la auditoría de aislamiento, 2026-09-11) — antes
    // no se validaba, así que un empleadoId de otra empresa quedaba escrito
    // tal cual en Cita.empleadoId.
    if (!inquilino.esInquilino && dto.empleadoId && dto.empleadoId !== cita.empleadoId) {
      const empleadoNuevo = await this.prisma.db.empleado.findFirst({
        where: { id: dto.empleadoId },
        select: { id: true },
      });
      if (!empleadoNuevo) throw new BadRequestException('Empleado no válido');
    }
    const duracionTotal = cita.servicios.reduce((a, s) => a + s.duracionMin, 0);
    const inicio = new Date(`${dto.fecha}T${dto.horaInicio}:00`);
    const fin = new Date(inicio.getTime() + duracionTotal * 60_000);

    // Anti-solapamiento excluyendo la propia cita
    const libre = await this.disponibilidad.estaDisponible(
      empleadoId,
      inicio,
      fin,
      id,
    );
    if (!libre) {
      throw new ConflictException(
        'El empleado ya tiene una cita o bloqueo en ese horario',
      );
    }

    // Revalidar cabina si aplica
    let cabinaId = cita.cabinaId ?? undefined;
    if (cita.cabinaId) {
      const sucursalId = cita.sucursalId ?? undefined;
      if (sucursalId) {
        const cabina = await this.disponibilidad.findCabinaLibre(
          sucursalId,
          inicio,
          fin,
          id,
        );
        if (!cabina) {
          throw new ConflictException(
            'No hay cabinas disponibles en el nuevo horario',
          );
        }
        cabinaId = cabina;
      }
    }

    await this.prisma.db.cita.update({
      where: { id },
      data: { empleadoId, cabinaId, inicio, fin },
    });

    await this.audit.log({
      modulo: 'AGENDA',
      entidad: 'Cita',
      entidadId: id,
      accion: 'RESCHEDULE',
      datosAntes: { inicio: cita.inicio, empleadoId: cita.empleadoId },
      datosDespues: { inicio, fin, empleadoId },
    });

    return this.findOne(id);
  }

  // ---------- helpers ----------
  /**
   * Resuelve el Empleado a usar cuando Nueva Cita se manda sin
   * empleadoId — el dueño dejó "Empleado" sin elegir para agendarse a sí
   * mismo. Mismo patrón que resolveEmpleadoRegistra() en
   * ventas.service.ts (POS), reimplementado acá a propósito: Agenda es un
   * flujo distinto y ese método ya cerrado no debía tocarse. Si el
   * Empleado del usuario actual no existe todavía, se crea (esCuentaDueno)
   * SOLO si es el OWNER — cualquier otro rol sin Empleado vinculado se
   * rechaza en vez de adivinar a quién asignarle la cita.
   */
  private async resolveEmpleadoParaCita(): Promise<{
    id: string;
    sucursalId: string | null;
  }> {
    const user = getCurrentUser();
    const existente = await this.prisma.db.empleado.findFirst({
      where: { usuarioId: user.usuarioId },
      select: { id: true, sucursalId: true, esCuentaDueno: true },
    });
    if (existente) {
      // Backfill puntual: dueños cuyo Empleado fantasma se creó ANTES de
      // este fix (ej. desde el POS, que nunca necesitó sucursalId) se
      // quedaron sin sucursal — sin esto, seguían topándose con "Se
      // requiere una sucursal para asignar cabina" para siempre. Solo se
      // toca si es esCuentaDueno: un empleado real sin sucursal puede ser
      // así a propósito, no se le toca nada.
      if (existente.esCuentaDueno && !existente.sucursalId) {
        const sucursalId = await this.resolverSucursalPrincipal();
        if (sucursalId) {
          return this.prisma.db.empleado.update({
            where: { id: existente.id },
            data: { sucursalId },
            select: { id: true, sucursalId: true },
          });
        }
      }
      return existente;
    }

    if (user.rol !== RoleKey.OWNER) {
      throw new BadRequestException(
        'Elegí un profesional para la cita, o pedí que vinculen tu usuario a un empleado desde Equipo.',
      );
    }

    const [usuario, sucursalId] = await Promise.all([
      this.prisma.usuario.findUnique({
        where: { id: user.usuarioId },
        select: { nombre: true },
      }),
      this.resolverSucursalPrincipal(),
    ]);
    return this.prisma.db.empleado.create({
      data: {
        usuarioId: user.usuarioId,
        nombre: usuario?.nombre ?? 'Dueño',
        activo: true,
        esCuentaDueno: true,
        sucursalId,
      } as any,
      select: { id: true, sucursalId: true },
    });
  }

  /**
   * Mismo criterio que resolverSucursalPrincipal() en ventas.service.ts:
   * la marcada esPrincipal, o si no hay ninguna, la primera activa. Sin
   * esto, el Empleado del dueño nacía sin sucursal y cualquier cita con un
   * servicio que requiere cabina fallaba con "Se requiere una sucursal
   * para asignar cabina" -- confirmado en vivo probando esta ronda.
   */
  private async resolverSucursalPrincipal(): Promise<string | undefined> {
    const principal = await this.prisma.db.sucursal.findFirst({
      where: { activo: true },
      orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    return principal?.id;
  }

  /**
   * Corrección (agenda del inquilino): si quien opera es un inquilino y la
   * cita no es suya, 404 (no revelar existencia) — mismo patrón que el
   * resto de Pieza 3. Devuelve la identidad resuelta para que el llamador
   * la reutilice (evita resolverla dos veces).
   */
  private async assertPropiaSiInquilino(citaEmpleadoId: string) {
    const inquilino = await this.inquilinoSvc.resolverInquilino();
    if (inquilino.esInquilino && citaEmpleadoId !== inquilino.empleadoId) {
      throw new NotFoundException('Cita no encontrada');
    }
    return inquilino;
  }

  private fullInclude(): Prisma.CitaInclude {
    return {
      cliente: { select: { id: true, nombre: true, telefono: true, whatsapp: true } },
      empleado: { select: { id: true, nombre: true } },
      cabina: { select: { id: true, nombre: true } },
      servicios: {
        include: { servicio: { select: { id: true, nombre: true } } },
      },
      // Candado "una venta por cita" (Parte B): solo existe (no-null) si
      // hay una venta ACTIVA ligada — anular() limpia venta.citaId, así
      // que una venta anulada no aparece aquí y la cita vuelve a ser
      // cobrable. El frontend usa esto para mostrar "Ya cobrada" + recibo
      // en vez de "Cobrar".
      venta: { select: { id: true, estado: true } },
    };
  }

  private toResponse(c: any) {
    return {
      id: c.id,
      fecha: c.inicio.toISOString().slice(0, 10),
      horaInicio: this.hhmm(c.inicio),
      horaFin: this.hhmm(c.fin),
      estado: ENUM_TO_ESTADO_ES[c.estado as CitaStatus],
      cliente: c.cliente
        ? { id: c.cliente.id, nombre: c.cliente.nombre, telefono: c.cliente.telefono }
        : null,
      empleado: c.empleado
        ? { id: c.empleado.id, nombre: c.empleado.nombre }
        : null,
      cabina: c.cabina ? { id: c.cabina.id, nombre: c.cabina.nombre } : null,
      venta: c.venta ? { id: c.venta.id, estado: c.venta.estado } : null,
      servicios:
        c.servicios?.map((s: any) => ({
          servicioId: s.servicioId,
          nombre: s.servicio?.nombre,
          precio: Number(s.precio),
          duracionMin: s.duracionMin,
        })) ?? [],
      subtotal: Number(c.subtotal),
      descuento: Number(c.descuento),
      itbis: Number(c.itbis),
      total: Number(c.total),
      origen: c.origen,
      notas: c.notas,
    };
  }

  private hhmm(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(
      d.getMinutes(),
    ).padStart(2, '0')}`;
  }

  private round(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
}
