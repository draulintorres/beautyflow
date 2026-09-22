import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  CreateVentaDto,
  AbonoDeudaDto,
  LineaVentaDto,
  VENTA_ESTADO_ES,
} from './dto/pos.dto';
import { getEmpresaId, getCurrentUser } from '../../core/tenant/tenant-context';
import { SucursalScopeService } from '../../core/tenant/sucursal-scope.service';
import { AuditService } from '../../core/audit/audit.service';
import { InquilinoService } from '../../core/auth/inquilino.service';
import { NotificationService } from '../notificaciones/notification.service';
import {
  VentaStatus,
  VentaOrigen,
  LineaTipo,
  CitaStatus,
  RoleKey,
  MovimientoInventarioTipo,
  MovimientoCreditoTipo,
  ComisionBase,
  ModeloPago,
  NotificacionEvento,
  Prisma,
  FlujoDineroAlquiler,
  TipoCuotaAlquiler,
  EstadoDeudaAlquiler,
} from '@prisma/client';

/**
 * Cliente dentro de una transacción. Las transacciones de este archivo
 * corren sobre `this.prisma.db.$transaction` (no `this.prisma.$transaction`)
 * para que la extensión de aislamiento por tenant de `prisma.service.ts`
 * (empresaId auto-inyectado, incluido el filtro de DetalleVenta/Pago vía su
 * relación con Venta) también cubra las operaciones hechas dentro del `tx`.
 * TypeScript no logra unificar el tipo de ese `tx` extendido con
 * `Prisma.TransactionClient` (limitación conocida de Prisma Client
 * Extensions: los tipos genéricos del cliente extendido no son
 * estructuralmente asignables al tipo del cliente base) — en runtime ambos
 * exponen exactamente la misma API, así que se tipa ancho aquí en vez de
 * pelear con esa limitación.
 */
type TxClient = any;

/** Línea ya calculada, lista para persistir. */
interface LineaCalculada {
  tipo: LineaTipo;
  servicioId?: string;
  productoId?: string;
  empleadoId?: string;
  descripcion: string;
  cantidad: number;
  precioUnit: number;
  descuento: number;
  subtotal: number;
  comisionPct: number;
  comisionMonto: number;
}

@Injectable()
export class VentasService {
  private readonly logger = new Logger('Ventas');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notif: NotificationService,
    private readonly inquilinoSvc: InquilinoService,
    private readonly sucursalScope: SucursalScopeService,
  ) {}

  // ============ CREAR VENTA (directa) ============
  async create(dto: CreateVentaDto) {
    const empresaId = getEmpresaId();
    const user = getCurrentUser();

    // Candado "una venta por cita" (Parte B): si esta venta viene de
    // "Cobrar" en Agenda, la cita no debe tener ya una venta ACTIVA. Una
    // venta anulada limpia su citaId (ver anular()), así que una cita con
    // venta anulada vuelve a estar disponible para cobrarse — el chequeo
    // es simplemente "¿la cita tiene HOY un venta ligada?", ya que
    // anular() es lo único que puede dejarla en null de nuevo.
    if (dto.citaId) {
      const cita = await this.prisma.db.cita.findFirst({
        where: { id: dto.citaId },
        select: { id: true, venta: { select: { id: true } } },
      });
      if (!cita) throw new NotFoundException('Cita no encontrada');
      if (cita.venta) {
        throw new ConflictException('Esta cita ya fue cobrada.');
      }
    }

    // Validar que el resto de IDs foráneos del body pertenezcan a esta
    // empresa (Parte B de la auditoría de aislamiento, 2026-09-11).
    // clienteId antes solo se validaba en el camino de fiao (validarFiao) —
    // una venta pagada de una vez nunca lo chequeaba, así que un clienteId
    // de otra empresa quedaba escrito tal cual y aparecía luego en el
    // historial de compras de un cliente que no es de esta empresa.
    // aperturaCajaId y sucursalId no se validaban en absoluto.
    if (dto.clienteId) {
      const cliente = await this.prisma.db.cliente.findFirst({
        where: { id: dto.clienteId },
        select: { id: true },
      });
      if (!cliente) throw new BadRequestException('Cliente no válido');
    }
    if (dto.aperturaCajaId) {
      const apertura = await this.prisma.db.aperturaCaja.findFirst({
        where: { id: dto.aperturaCajaId },
        select: { id: true },
      });
      if (!apertura) throw new BadRequestException('Apertura de caja no válida');
    }
    if (dto.sucursalId) {
      const suc = await this.prisma.db.sucursal.findFirst({
        where: { id: dto.sucursalId },
        select: { id: true },
      });
      if (!suc) throw new BadRequestException('Sucursal no válida');
    }
    if (dto.pagos?.length) {
      const metodoIds = [...new Set(dto.pagos.map((p) => p.metodoPagoId))];
      const metodos = await this.prisma.db.metodoPago.findMany({
        where: { id: { in: metodoIds } },
        select: { id: true },
      });
      if (metodos.length !== metodoIds.length) {
        throw new BadRequestException('Uno o más métodos de pago no son válidos');
      }
    }
    if (dto.propina?.empleadoId) {
      await this.validarEmpleadoId(dto.propina.empleadoId);
    }

    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { itbisPct: true, comisionFiaoPolitica: true },
    });
    const itbisPct = Number(empresa?.itbisPct ?? 0);

    // Empleado que registra (debe existir uno ligado al usuario o pasar el primero)
    const empleadoRegistra = await this.resolveEmpleadoRegistra(user.usuarioId);

    // Alquiler de silla (Pieza 3): si quien crea la venta es un inquilino,
    // se FUERZA el empleadoId de sus líneas de servicio al suyo propio —
    // se ignora cualquier empleadoId que mande el cliente. Se hace ANTES
    // de calcularLineas para que la comisión (si aplica) también se
    // calcule contra el empleado real, no contra el que alguien intentó
    // inyectar.
    const inquilino = await this.inquilinoSvc.resolverInquilino(user);
    const lineasDto = inquilino.esInquilino
      ? dto.lineas.map((l) =>
          l.tipo === LineaTipo.SERVICIO
            ? { ...l, empleadoId: inquilino.empleadoId! }
            : l,
        )
      : dto.lineas;

    // 1. Calcular líneas (servicios y productos), comisiones y validar stock
    const { lineas, requiereStock } = await this.calcularLineas(lineasDto);

    // Alquiler de silla: factura limpia del inquilino (Misión A, Pieza 2b)
    await this.validarFacturaLimpiaInquilino(lineas);

    // 2. Totales
    const subtotalLineas = lineas.reduce((a, l) => a + l.subtotal, 0);
    const descuentoGlobal = dto.descuentoGlobal ?? 0;
    const baseImponible = Math.max(0, subtotalLineas - descuentoGlobal);
    const itbis = this.round(baseImponible * (itbisPct / 100));
    const propinaMonto = dto.propina?.monto ?? 0;
    const total = this.round(baseImponible + itbis + propinaMonto);

    // 3. Pagos y resolución de estado (fiao)
    const pagos = dto.pagos ?? [];
    const totalPagado = this.round(pagos.reduce((a, p) => a + p.monto, 0));
    const saldo = this.round(total - totalPagado);

    if (saldo < -0.01) {
      throw new BadRequestException(
        'El monto pagado excede el total de la venta',
      );
    }

    // Validación de fiao si queda saldo
    if (saldo > 0.01) {
      await this.validarFiao(dto.clienteId, saldo, dto.permitirFiao);
    }

    const estado = this.resolverEstado(total, totalPagado, saldo);

    // Alquiler de silla (Fase B2, Pieza 2a, caso DIRECTO): si TODA la venta
    // es de inquilino(s) DIRECTO+POR_SERVICIO, su dinero no es del salón —
    // no se liga a ninguna sesión de caja. Facturas mixtas (con producto o
    // con líneas de otro empleado) NO se excluyen — ver nota de alcance en
    // el reporte de Pieza 2a.
    const aperturaCajaId = await this.resolverAperturaCajaId(dto.aperturaCajaId, lineas);

    // Sucursal de la venta (Parte A — reporte por sucursal en Inicio): el
    // POS nunca pide explícitamente la sucursal en la UI, así que si el
    // caller no la manda se deriva del empleado que registra (su sucursal
    // asignada en Equipo) y, si tampoco la tiene, de la sucursal principal
    // de la empresa. Así toda venta nueva queda taggeada sin tocar el
    // frontend del POS.
    const sucursalId =
      dto.sucursalId ??
      empleadoRegistra.sucursalId ??
      (await this.resolverSucursalPrincipal());

    // 4. Transacción: crear venta + detalles + pagos + propina + inventario + crédito + comisiones
    const venta = await this.prisma.db.$transaction(async (tx) => {
      const numero = await this.nextNumero(tx, empresaId);

      const nuevaVenta = await tx.venta.create({
        data: {
          empresaId,
          sucursalId,
          aperturaCajaId,
          clienteId: dto.clienteId,
          citaId: dto.citaId,
          empleadoId: empleadoRegistra.id,
          numero,
          origen: dto.citaId ? VentaOrigen.CITA : VentaOrigen.DIRECTA,
          subtotal: subtotalLineas,
          descuento: descuentoGlobal,
          itbis,
          propina: propinaMonto,
          total,
          saldo,
          estado,
          detalles: {
            create: lineas.map((l) => ({
              tipo: l.tipo,
              servicioId: l.servicioId,
              productoId: l.productoId,
              empleadoId: l.empleadoId,
              descripcion: l.descripcion,
              cantidad: l.cantidad,
              precioUnit: l.precioUnit,
              descuento: l.descuento,
              subtotal: l.subtotal,
              comisionPct: l.comisionPct,
              comisionMonto: l.comisionMonto,
            })),
          },
        },
      });

      // Pagos
      for (const p of pagos) {
        await tx.pago.create({
          data: {
            ventaId: nuevaVenta.id,
            metodoPagoId: p.metodoPagoId,
            monto: p.monto,
            referencia: p.referencia,
            empleadoId: empleadoRegistra.id,
          },
        });
      }

      // Alquiler de silla: si esta venta ya nació PAGADA, genera la cuota
      // de los inquilinos DIRECTO+POR_SERVICIO involucrados, atómico con
      // la propia venta.
      if (estado === VentaStatus.PAGADA) {
        await this.generarDeudaAlquilerSiAplica(tx, nuevaVenta.id, numero);
      }

      // Propina
      if (dto.propina && propinaMonto > 0) {
        await tx.propina.create({
          data: {
            empresaId,
            ventaId: nuevaVenta.id,
            empleadoId: dto.propina.empleadoId,
            monto: propinaMonto,
            generaComision: dto.propina.generaComision ?? false,
          },
        });
      }

      // Inventario: descontar stock de productos
      if (requiereStock) {
        await this.descontarInventario(tx, empresaId, lineas, nuevaVenta.id, user.usuarioId);
      }

      // Crédito: si hay saldo, registrar cargo en cuenta corriente
      if (saldo > 0.01 && dto.clienteId) {
        await tx.movimientoCredito.create({
          data: {
            empresaId,
            clienteId: dto.clienteId,
            ventaId: nuevaVenta.id,
            tipo: MovimientoCreditoTipo.CARGO,
            monto: saldo,
            descripcion: `Fiao venta #${numero}`,
          },
        });
        await this.actualizarDeudaCliente(tx, dto.clienteId);
      }

      // Candado "una venta por cita" (Parte B): al registrar la venta, la
      // cita pasa a COMPLETED — así "Cobrar" deja de mostrarse y la agenda
      // refleja que ya se atendió y cobró. Si esta venta se anula después,
      // anular() revierte la cita a CONFIRMED (ver ahí).
      if (dto.citaId) {
        await tx.cita.update({
          where: { id: dto.citaId },
          data: { estado: CitaStatus.COMPLETED },
        });
      }

      return nuevaVenta;
    });

    await this.audit.log({
      modulo: 'POS',
      entidad: 'Venta',
      entidadId: venta.id,
      accion: 'CREATE',
      datosDespues: { numero: venta.numero, total, estado, saldo },
    });

    if (dto.clienteId) {
      await this.notif.notificar({
        evento: NotificacionEvento.FACTURA_EMITIDA,
        clienteId: dto.clienteId,
        variables: {
          factura: `F${String(venta.numero).padStart(7, '0')}`,
          total: total.toFixed(2),
        },
        referenciaTipo: 'VENTA',
        referenciaId: venta.id,
      });
    }

    return this.findOne(venta.id);
  }

  // ============ VENTA DESDE CITA ============
  async createFromCita(citaId: string) {
    const empresaId = getEmpresaId();
    const user = getCurrentUser();

    const cita = await this.prisma.db.cita.findFirst({
      where: { id: citaId },
      include: {
        servicios: { include: { servicio: true } },
        venta: { select: { id: true } },
      },
    });
    if (!cita) throw new NotFoundException('Cita no encontrada');
    if (cita.venta) {
      throw new ConflictException('La cita ya tiene una venta asociada');
    }
    if (
      cita.estado === CitaStatus.CANCELED ||
      cita.estado === CitaStatus.NO_SHOW
    ) {
      throw new BadRequestException(
        'No se puede facturar una cita cancelada o no asistida',
      );
    }

    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { itbisPct: true },
    });
    const itbisPct = Number(empresa?.itbisPct ?? 0);
    const empleadoRegistra = await this.resolveEmpleadoRegistra(user.usuarioId);

    // Construir líneas desde los servicios de la cita, con comisión del empleado de la cita
    const lineas: LineaCalculada[] = [];
    for (const cs of cita.servicios) {
      const precio = Number(cs.precio);
      const { comisionPct, comisionMonto } = await this.calcComision(
        cita.empleadoId,
        cs.servicioId,
        precio,
      );
      lineas.push({
        tipo: LineaTipo.SERVICIO,
        servicioId: cs.servicioId,
        empleadoId: cita.empleadoId,
        descripcion: cs.servicio.nombre,
        cantidad: 1,
        precioUnit: precio,
        descuento: 0,
        subtotal: precio,
        comisionPct,
        comisionMonto,
      });
    }

    const subtotal = lineas.reduce((a, l) => a + l.subtotal, 0);
    const itbis = this.round(subtotal * (itbisPct / 100));
    const total = this.round(subtotal + itbis);

    const venta = await this.prisma.db.$transaction(async (tx) => {
      const numero = await this.nextNumero(tx, empresaId);
      const nuevaVenta = await tx.venta.create({
        data: {
          empresaId,
          sucursalId: cita.sucursalId,
          clienteId: cita.clienteId,
          citaId: cita.id,
          empleadoId: empleadoRegistra.id,
          numero,
          origen: VentaOrigen.CITA,
          subtotal,
          itbis,
          total,
          saldo: total,
          estado: VentaStatus.OPEN,
          detalles: {
            create: lineas.map((l) => ({
              tipo: l.tipo,
              servicioId: l.servicioId,
              empleadoId: l.empleadoId,
              descripcion: l.descripcion,
              cantidad: l.cantidad,
              precioUnit: l.precioUnit,
              descuento: l.descuento,
              subtotal: l.subtotal,
              comisionPct: l.comisionPct,
              comisionMonto: l.comisionMonto,
            })),
          },
        },
      });

      // Marcar la cita como finalizada
      await tx.cita.update({
        where: { id: cita.id },
        data: { estado: CitaStatus.COMPLETED },
      });

      return nuevaVenta;
    });

    await this.audit.log({
      modulo: 'POS',
      entidad: 'Venta',
      entidadId: venta.id,
      accion: 'CREATE_FROM_CITA',
      datosDespues: { citaId, total, numero: venta.numero },
    });

    return this.findOne(venta.id);
  }

  // ============ REGISTRAR PAGO / ABONO ============
  async registrarAbono(ventaId: string, dto: AbonoDeudaDto) {
    const empresaId = getEmpresaId();
    const venta = await this.prisma.db.venta.findFirst({
      where: { id: ventaId },
    });
    if (!venta) throw new NotFoundException('Venta no encontrada');
    if (venta.estado === VentaStatus.ANULADA) {
      throw new BadRequestException('La venta está anulada');
    }
    const saldoActual = Number(venta.saldo);
    if (saldoActual <= 0) {
      throw new BadRequestException('La venta no tiene saldo pendiente');
    }
    if (dto.monto > saldoActual + 0.01) {
      throw new BadRequestException(
        `El abono (${dto.monto}) excede el saldo pendiente (${saldoActual})`,
      );
    }
    const metodo = await this.prisma.db.metodoPago.findFirst({
      where: { id: dto.metodoPagoId },
      select: { id: true },
    });
    if (!metodo) throw new BadRequestException('Método de pago no válido');

    const nuevoSaldo = this.round(saldoActual - dto.monto);
    const nuevoEstado =
      nuevoSaldo <= 0.01 ? VentaStatus.PAGADA : VentaStatus.ABONO_PARCIAL;

    await this.prisma.db.$transaction(async (tx) => {
      await tx.pago.create({
        data: {
          ventaId,
          metodoPagoId: dto.metodoPagoId,
          monto: dto.monto,
          referencia: dto.referencia,
          esAbonoDeuda: true,
        },
      });
      await tx.venta.update({
        where: { id: ventaId },
        data: { saldo: nuevoSaldo, estado: nuevoEstado },
      });
      if (nuevoEstado === VentaStatus.PAGADA) {
        await this.generarDeudaAlquilerSiAplica(tx, ventaId, venta.numero);
      }
      if (venta.clienteId) {
        await tx.movimientoCredito.create({
          data: {
            empresaId,
            clienteId: venta.clienteId,
            ventaId,
            tipo: MovimientoCreditoTipo.ABONO,
            monto: dto.monto,
            descripcion: `Abono venta #${venta.numero}`,
          },
        });
        await this.actualizarDeudaCliente(tx, venta.clienteId);
      }
    });

    await this.audit.log({
      modulo: 'POS',
      entidad: 'Venta',
      entidadId: ventaId,
      accion: 'ABONO',
      datosAntes: { saldo: saldoActual },
      datosDespues: { numero: venta.numero, monto: dto.monto, saldoNuevo: nuevoSaldo, estado: nuevoEstado },
    });

    if (venta.clienteId) {
      await this.notif.notificar({
        evento: NotificacionEvento.PAGO_RECIBIDO,
        clienteId: venta.clienteId,
        variables: {
          monto: dto.monto.toFixed(2),
          saldo: nuevoSaldo.toFixed(2),
        },
        referenciaTipo: 'VENTA',
        referenciaId: ventaId,
      });
    }

    return this.findOne(ventaId);
  }

  // ============ ANULAR ============
  async anular(ventaId: string, motivo: string, pin?: string) {
    const empresaId = getEmpresaId();
    const venta = await this.prisma.db.venta.findFirst({
      where: { id: ventaId },
      include: { detalles: true },
    });
    if (!venta) throw new NotFoundException('Venta no encontrada');
    if (venta.estado === VentaStatus.ANULADA) {
      throw new BadRequestException('La venta ya está anulada');
    }

    // Candado de PIN (Parte B): capa extra opcional, ENCIMA del rol
    // OWNER/ADMIN que ya exige el guard de la ruta — no lo reemplaza. Solo
    // se exige/valida si la empresa lo tiene activado. Mensajes distintos
    // para "falta motivo" (ya lo valida el DTO), "falta PIN" y "PIN
    // incorrecto", tal como pide el spec.
    const empresaCfg = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { pinAnulacionActivo: true, pinAnulacionHash: true },
    });
    if (empresaCfg?.pinAnulacionActivo) {
      this.checkPinLockout(empresaId);
      if (!pin) {
        throw new BadRequestException('Debes ingresar el PIN para anular esta venta.');
      }
      const pinValido = empresaCfg.pinAnulacionHash
        ? await bcrypt.compare(pin, empresaCfg.pinAnulacionHash)
        : false;
      if (!pinValido) {
        this.registrarPinFallo(empresaId);
        throw new ForbiddenException('PIN incorrecto.');
      }
      this.registrarPinExito(empresaId);
    }

    // Comisiones: si alguna línea ya está en una liquidación PAGADA, no se
    // puede anular la venta directamente — primero hay que anular esa
    // liquidación (flujo ya existente en Comisiones). Si está en una
    // liquidación aún no pagada, sí se puede: se resta esta línea de sus
    // totales y se libera (liquidacionId → null) dentro de la transacción.
    const liquidacionIds = [
      ...new Set(
        venta.detalles.map((d) => d.liquidacionId).filter((id): id is string => !!id),
      ),
    ];
    // OJO: LiquidacionComision no tiene columna deletedAt — hay que usar el
    // cliente plano (this.prisma), no this.prisma.db (que inyecta
    // deletedAt:null automático y rompe con "Unknown argument" en modelos
    // sin soft-delete). Mismo patrón que liquidaciones.service.ts.
    const liquidaciones = liquidacionIds.length
      ? await this.prisma.liquidacionComision.findMany({
          where: { id: { in: liquidacionIds } },
        })
      : [];
    const liquidacionPagada = liquidaciones.find((l) => l.pagada);
    if (liquidacionPagada) {
      throw new BadRequestException(
        `Esta venta ya fue incluida en una liquidación de comisiones pagada ` +
        `(periodo ${liquidacionPagada.periodoIni.toISOString().slice(0, 10)} a ` +
        `${liquidacionPagada.periodoFin.toISOString().slice(0, 10)}). ` +
        `Anula primero esa liquidación antes de anular la venta.`,
      );
    }
    const liquidacionesPendientes = liquidaciones.filter((l) => !l.pagada && !l.anuladaAt);

    await this.prisma.db.$transaction(async (tx) => {
      // Revertir inventario de productos
      for (const d of venta.detalles) {
        if (d.productoId && d.tipo !== LineaTipo.SERVICIO) {
          await tx.producto.update({
            where: { id: d.productoId },
            data: { existencia: { increment: d.cantidad } },
          });
          await tx.movimientoInventario.create({
            data: {
              empresaId,
              productoId: d.productoId,
              tipo: MovimientoInventarioTipo.ENTRADA,
              cantidad: d.cantidad,
              motivo: `Anulación venta #${venta.numero}`,
              referenciaTipo: 'VENTA_ANULADA',
              referenciaId: venta.id,
            },
          });
        }
      }

      // Comisiones: sacar las líneas de esta venta de cualquier liquidación
      // pendiente (no pagada) y descontar su aporte de los totales.
      for (const liq of liquidacionesPendientes) {
        const lineasDeEstaVenta = venta.detalles.filter((d) => d.liquidacionId === liq.id);
        const restaServicios = lineasDeEstaVenta
          .filter((d) => d.tipo === LineaTipo.SERVICIO)
          .reduce((a, d) => a + Number(d.subtotal), 0);
        const restaProductos = lineasDeEstaVenta
          .filter((d) => d.tipo !== LineaTipo.SERVICIO)
          .reduce((a, d) => a + Number(d.subtotal), 0);
        const restaComision = lineasDeEstaVenta.reduce((a, d) => a + Number(d.comisionMonto), 0);

        await tx.liquidacionComision.update({
          where: { id: liq.id },
          data: {
            totalServicios: { decrement: this.round(restaServicios) },
            totalProductos: { decrement: this.round(restaProductos) },
            totalPagar: { decrement: this.round(restaComision) },
          },
        });
        await tx.detalleVenta.updateMany({
          where: { id: { in: lineasDeEstaVenta.map((d) => d.id) } },
          data: { liquidacionId: null },
        });
      }

      await tx.venta.update({
        where: { id: ventaId },
        data: {
          estado: VentaStatus.ANULADA,
          saldo: 0,
          motivoAnulacion: motivo,
          anuladaAt: new Date(),
          // Candado "una venta por cita" (Parte B): libera la cita para que
          // pueda cobrarse de nuevo — ver el chequeo en create().
          citaId: null,
        },
      });

      // Cita ligada: vuelve a un estado cobrable. CONFIRMED (no el que
      // tenía antes, que no se guarda) porque si llegó a tener una venta
      // fue porque ya estaba confirmada/en curso — es el estado más
      // razonable para retomarla desde Agenda.
      if (venta.citaId) {
        await tx.cita.update({
          where: { id: venta.citaId },
          data: { estado: CitaStatus.CONFIRMED },
        });
      }

      await this.revertirDeudaAlquilerSiAplica(tx, ventaId);

      if (venta.clienteId && Number(venta.saldo) > 0) {
        await this.actualizarDeudaCliente(tx, venta.clienteId);
      }
    });

    await this.audit.log({
      modulo: 'POS',
      entidad: 'Venta',
      entidadId: ventaId,
      accion: 'VOID',
      datosAntes: {
        numero: venta.numero,
        estado: venta.estado,
        total: Number(venta.total),
        saldo: Number(venta.saldo),
      },
      datosDespues: { estado: 'ANULADA', motivo },
    });

    return this.findOne(ventaId);
  }

  // ============ CONSULTAS ============
  async findOne(id: string) {
    const venta = await this.prisma.db.venta.findFirst({
      where: { id },
      include: {
        cliente: { select: { id: true, nombre: true, telefono: true } },
        detalles: { include: { empleado: { select: { nombre: true } } } },
        pagos: {
          include: { metodoPago: { select: { nombre: true } } },
          orderBy: { createdAt: 'asc' },
        },
        propinas: true,
      },
    });
    if (!venta) throw new NotFoundException('Venta no encontrada');

    // Alquiler de silla (Pieza 3): un inquilino no puede ver el detalle de
    // una venta que no sea suya — 404 para no revelar su existencia.
    const inquilino = await this.inquilinoSvc.resolverInquilino();
    if (inquilino.esInquilino) {
      const esSuya = venta.detalles.some(
        (d) => d.empleadoId === inquilino.empleadoId,
      );
      if (!esSuya) throw new NotFoundException('Venta no encontrada');
    }

    // Aislamiento por sucursal: un usuario no-OWNER asignado a una sucursal
    // no puede ver (ni anular, ni imprimir recibo de) una venta de otra
    // sucursal — 404 para no revelar su existencia.
    const suc = await this.sucursalScope.whereSucursal();
    if (suc.sucursalId && venta.sucursalId !== suc.sucursalId) {
      throw new NotFoundException('Venta no encontrada');
    }

    return this.toResponse(venta);
  }

  async findAll(filtros: {
    fecha?: string;
    estado?: VentaStatus;
    empleadoId?: string;
  }) {
    // Alquiler de silla (Pieza 3): un inquilino solo ve ventas con líneas
    // suyas — se ignora cualquier empleadoId que mande el cliente y se
    // fuerza al propio.
    const inquilino = await this.inquilinoSvc.resolverInquilino();
    const empleadoId = inquilino.esInquilino
      ? inquilino.empleadoId!
      : filtros.empleadoId;

    const where: Prisma.VentaWhereInput = {};
    if (filtros.fecha) {
      where.createdAt = {
        gte: new Date(`${filtros.fecha}T00:00:00`),
        lte: new Date(`${filtros.fecha}T23:59:59.999`),
      };
    }
    if (filtros.estado) where.estado = filtros.estado;
    if (empleadoId) where.detalles = { some: { empleadoId } };

    // Aislamiento por sucursal: un usuario no-OWNER asignado a una sucursal
    // solo ve en el historial las ventas de esa sucursal.
    const suc = await this.sucursalScope.whereSucursal();
    if (suc.sucursalId) where.sucursalId = suc.sucursalId;

    const ventas = await this.prisma.db.venta.findMany({
      where,
      include: {
        cliente: { select: { nombre: true, telefono: true } },
        detalles: {
          select: { tipo: true, empleado: { select: { nombre: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return ventas.map((v) => {
      const primerServicio = v.detalles.find(
        (d) => d.tipo === LineaTipo.SERVICIO,
      );
      return {
        id: v.id,
        factura: `F${String(v.numero).padStart(7, '0')}`,
        cliente: v.cliente?.nombre ?? 'Walk-in',
        clienteTelefono: v.cliente?.telefono ?? null,
        profesional: primerServicio?.empleado?.nombre ?? null,
        total: Number(v.total),
        saldo: Number(v.saldo),
        estado: VENTA_ESTADO_ES[v.estado],
        motivoAnulacion: v.motivoAnulacion ?? null,
        fecha: v.createdAt,
      };
    });
  }

  // ============ HELPERS ============
  private async calcularLineas(
    lineasDto: LineaVentaDto[],
  ): Promise<{ lineas: LineaCalculada[]; requiereStock: boolean }> {
    const lineas: LineaCalculada[] = [];
    let requiereStock = false;

    for (const l of lineasDto) {
      if (l.tipo === LineaTipo.SERVICIO) {
        if (!l.servicioId) {
          throw new BadRequestException('servicioId requerido en líneas de servicio');
        }
        const servicio = await this.prisma.db.servicio.findFirst({
          where: { id: l.servicioId },
        });
        if (!servicio) throw new BadRequestException('Servicio no válido');

        const precio = Number(servicio.precio);
        const descuento = l.descuento ?? 0;
        const subtotal = this.round(precio * l.cantidad - descuento);

        let comisionPct = 0;
        let comisionMonto = 0;
        if (l.empleadoId) {
          await this.validarEmpleadoId(l.empleadoId);
          const com = await this.calcComision(l.empleadoId, l.servicioId, subtotal);
          comisionPct = com.comisionPct;
          comisionMonto = com.comisionMonto;
        }

        lineas.push({
          tipo: LineaTipo.SERVICIO,
          servicioId: l.servicioId,
          empleadoId: l.empleadoId,
          descripcion: servicio.nombre,
          cantidad: l.cantidad,
          precioUnit: precio,
          descuento,
          subtotal,
          comisionPct,
          comisionMonto,
        });
      } else {
        // PRODUCTO o ALIMENTO_BEBIDA
        if (!l.productoId) {
          throw new BadRequestException('productoId requerido en líneas de producto');
        }
        const producto = await this.prisma.db.producto.findFirst({
          where: { id: l.productoId },
        });
        if (!producto) throw new BadRequestException('Producto no válido');
        if (producto.existencia < l.cantidad) {
          throw new BadRequestException(
            `Stock insuficiente de ${producto.nombre} (disponible: ${producto.existencia})`,
          );
        }
        requiereStock = true;

        const precio = Number(producto.precio);
        const descuento = l.descuento ?? 0;
        const subtotal = this.round(precio * l.cantidad - descuento);

        let comisionPct = 0;
        let comisionMonto = 0;
        if (l.empleadoId) {
          await this.validarEmpleadoId(l.empleadoId);
          if (producto.generaComision) {
            const com = await this.calcComisionProducto(l.empleadoId, subtotal);
            comisionPct = com.comisionPct;
            comisionMonto = com.comisionMonto;
          }
        }

        lineas.push({
          tipo: l.tipo,
          productoId: l.productoId,
          empleadoId: l.empleadoId,
          descripcion: producto.nombre,
          cantidad: l.cantidad,
          precioUnit: precio,
          descuento,
          subtotal,
          comisionPct,
          comisionMonto,
        });
      }
    }
    return { lineas, requiereStock };
  }

  // ============ ALQUILER DE SILLA (Fase B2) ============

  /**
   * Config de alquiler activa de un empleado, o null si no es inquilino
   * (no ALQUILER, o sin AlquilerConfig activa). Punto único de donde sale
   * "¿es inquilino y con qué config?" — lo usan la exclusión de caja
   * (Pieza 2a), la validación de factura limpia y el desglose de caja
   * (Pieza 2b).
   */
  private async obtenerAlquilerConfigActiva(empleadoId: string): Promise<{
    flujoDinero: FlujoDineroAlquiler;
    tipoCuota: TipoCuotaAlquiler;
  } | null> {
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id: empleadoId },
      select: {
        modeloPago: true,
        alquilerConfig: { select: { flujoDinero: true, tipoCuota: true, activo: true } },
      },
    });
    if (empleado?.modeloPago !== ModeloPago.ALQUILER) return null;
    const cfg = empleado.alquilerConfig;
    if (!cfg || !cfg.activo) return null;
    return { flujoDinero: cfg.flujoDinero, tipoCuota: cfg.tipoCuota };
  }

  /**
   * Decide si esta venta debe quedar ligada a la caja del salón o no.
   * Solo excluye (retorna undefined) cuando TODAS las líneas son SERVICIO
   * y TODAS pertenecen a inquilino(s) DIRECTO+POR_SERVICIO — el dinero de
   * esa venta nunca es del salón. POR_CAJA nunca se excluye (Pieza 2b): su
   * dinero sí entra a la gaveta, solo se desglosa en el resumen/cierre.
   * Ventas mixtas (con producto, o con servicios de un empleado normal) ya
   * no pueden ocurrir para un inquilino — la Misión A las bloquea antes de
   * llegar aquí — así que esta función ya nunca ve ese caso ambiguo.
   */
  private async resolverAperturaCajaId(
    aperturaCajaIdSolicitado: string | undefined,
    lineas: LineaCalculada[],
  ): Promise<string | undefined> {
    if (!aperturaCajaIdSolicitado || lineas.length === 0) {
      return aperturaCajaIdSolicitado;
    }
    if (lineas.some((l) => l.tipo !== LineaTipo.SERVICIO || !l.empleadoId)) {
      return aperturaCajaIdSolicitado;
    }
    const empleadoIds = [...new Set(lineas.map((l) => l.empleadoId!))];
    for (const empleadoId of empleadoIds) {
      const cfg = await this.obtenerAlquilerConfigActiva(empleadoId);
      const esDirectoPorServicio =
        !!cfg &&
        cfg.flujoDinero === FlujoDineroAlquiler.DIRECTO &&
        cfg.tipoCuota === TipoCuotaAlquiler.POR_SERVICIO;
      if (!esDirectoPorServicio) return aperturaCajaIdSolicitado;
    }
    return undefined; // toda la venta es de inquilino(s) DIRECTO: no toca caja
  }

  /**
   * Última red de seguridad para taggear sucursalId en una venta (Parte A):
   * si ni el caller ni el empleado que registra tienen sucursal, se usa la
   * marcada esPrincipal; si no hay ninguna marcada, la primera activa. En
   * empresas de una sola sucursal esto no importa (la pestaña de Parte A
   * queda oculta), pero mantiene el dato consistente igual.
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
   * "Factura limpia" del inquilino (Misión A, Pieza 2b): si cualquier
   * línea de la venta es de un empleado con AlquilerConfig activa —sin
   * importar el flujo, DIRECTO o POR_CAJA—, TODAS las líneas deben ser
   * SERVICIO y del MISMO inquilino. Nada de productos, nada de mezclar con
   * otro empleado. Se valida ANTES de la transacción (falla rápido, no
   * gasta un número de factura en vano).
   */
  private async validarFacturaLimpiaInquilino(lineas: LineaCalculada[]): Promise<void> {
    const empleadoIds = [
      ...new Set(lineas.map((l) => l.empleadoId).filter((id): id is string => !!id)),
    ];
    const inquilinos = new Set<string>();
    for (const id of empleadoIds) {
      if (await this.obtenerAlquilerConfigActiva(id)) inquilinos.add(id);
    }
    if (inquilinos.size === 0) return; // sin inquilinos en esta venta, nada que validar

    const MSG =
      'Un colaborador por alquiler solo puede facturar sus propios servicios, sin productos ni servicios de otros. Registra una venta aparte.';

    if (inquilinos.size > 1) {
      throw new BadRequestException(MSG);
    }
    const [inquilinoId] = inquilinos;
    const esLimpia = lineas.every((l) => l.tipo === LineaTipo.SERVICIO && l.empleadoId === inquilinoId);
    if (!esLimpia) {
      throw new BadRequestException(MSG);
    }
  }

  /**
   * Al confirmarse PAGADA una venta (desde create() o desde
   * registrarAbono()), genera UNA DeudaAlquiler por inquilino POR_SERVICIO
   * involucrado — DIRECTO o POR_CAJA, el flujo del dinero no cambia que
   * deba su cuota (Pieza 2b) — una fila por venta por inquilino, no por
   * línea, para poder rastrearla a la factura sin fragmentarla.
   * Anti-duplicado: si ya existe una deuda con esta referencia para ese
   * empleado, no la vuelve a crear (idempotente ante reintentos).
   */
  private async generarDeudaAlquilerSiAplica(
    tx: TxClient,
    ventaId: string,
    numero: number,
  ): Promise<void> {
    const empresaId = getEmpresaId();
    const detalles = await tx.detalleVenta.findMany({
      where: { ventaId, tipo: LineaTipo.SERVICIO, empleadoId: { not: null } },
      select: { empleadoId: true, cantidad: true },
    });
    if (detalles.length === 0) return;

    const cantidadPorEmpleado = new Map<string, number>();
    for (const d of detalles) {
      const id = d.empleadoId!;
      cantidadPorEmpleado.set(id, (cantidadPorEmpleado.get(id) ?? 0) + d.cantidad);
    }

    for (const [empleadoId, cantidad] of cantidadPorEmpleado) {
      const empleado = await tx.empleado.findFirst({
        where: { id: empleadoId },
        select: {
          modeloPago: true,
          alquilerConfig: {
            select: { flujoDinero: true, tipoCuota: true, montoPorServicio: true, activo: true },
          },
        },
      });
      if (empleado?.modeloPago !== ModeloPago.ALQUILER) continue;
      const cfg = empleado.alquilerConfig;
      if (!cfg || !cfg.activo) continue;
      // La cuota se debe sin importar el flujo del dinero (DIRECTO o
      // POR_CAJA, Pieza 2b) — que el efectivo entre a la gaveta del salón
      // no cambia que el inquilino deba su cuota por servicio.
      if (cfg.tipoCuota !== TipoCuotaAlquiler.POR_SERVICIO || !cfg.montoPorServicio) {
        continue;
      }

      const yaExiste = await tx.deudaAlquiler.findFirst({
        where: { referenciaTipo: 'venta', referenciaId: ventaId, empleadoId },
        select: { id: true },
      });
      if (yaExiste) continue;

      const montoTotal = this.round(Number(cfg.montoPorServicio) * cantidad);
      const folio = `F${String(numero).padStart(7, '0')}`;
      await tx.deudaAlquiler.create({
        data: {
          empresaId,
          empleadoId,
          concepto: `Cuota por ${cantidad} servicio${cantidad === 1 ? '' : 's'} - Factura ${folio}`,
          montoTotal,
          montoPagado: 0,
          saldo: montoTotal,
          estado: EstadoDeudaAlquiler.PENDIENTE,
          referenciaTipo: 'venta',
          referenciaId: ventaId,
        },
      });
    }
  }

  /**
   * Al anular una venta, revierte la(s) DeudaAlquiler que hubiera generado.
   * Sin abonos: se marca ANULADA y su saldo se cierra en 0 — el servicio
   * se revirtió, no hay nada que cobrar. CON abonos: se marca ANULADA
   * igual (no se borra el registro), pero el monto ya pagado se deja tal
   * cual y se loguea como caso de revisión manual — el inquilino ya pagó
   * parte de una cuota de un servicio que ya no existe; decidir si se
   * reembolsa es una decisión del dueño, no algo que este código deba
   * automatizar.
   */
  private async revertirDeudaAlquilerSiAplica(
    tx: TxClient,
    ventaId: string,
  ): Promise<void> {
    const deudas = await tx.deudaAlquiler.findMany({
      where: { referenciaTipo: 'venta', referenciaId: ventaId },
    });
    for (const deuda of deudas) {
      if (deuda.estado === EstadoDeudaAlquiler.ANULADA) continue;
      if (Number(deuda.montoPagado) > 0) {
        this.logger.warn(
          `DeudaAlquiler ${deuda.id} (empleado ${deuda.empleadoId}) de la venta anulada ${ventaId} ` +
            `ya tenía RD$${deuda.montoPagado} abonado — requiere revisión manual del dueño.`,
        );
      }
      await tx.deudaAlquiler.update({
        where: { id: deuda.id },
        data: { estado: EstadoDeudaAlquiler.ANULADA, saldo: 0 },
      });
    }
  }

  /**
   * Confirma que `empleadoId` es un empleado real DE ESTA EMPRESA antes de
   * dejarlo entrar a una línea de venta (Parte B de la auditoría de
   * aislamiento, 2026-09-11). Antes de esto, un empleadoId de otra empresa
   * no rechazaba nada — `calcComision`/`calcComisionProducto` simplemente
   * no encontraban configuración de comisión para él (por estar `.db.*`
   * ya aislado) y devolvían comisión 0, pero el `empleadoId` ajeno igual
   * quedaba escrito en `DetalleVenta.empleadoId` — una referencia cruzada
   * entre empresas que después aparecía como "N/D" en reportes, o peor,
   * arrastraba deuda de alquiler a un empleado que no es de esta empresa
   * (`generarDeudaAlquilerSiAplica`).
   */
  private async validarEmpleadoId(empleadoId: string): Promise<void> {
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id: empleadoId },
      select: { id: true },
    });
    if (!empleado) throw new BadRequestException('Empleado no válido');
  }

  /** Comisión de un servicio: SUELDO_FIJO → 0; override por servicio → base → 0. */
  private async calcComision(
    empleadoId: string,
    servicioId: string,
    base: number,
  ): Promise<{ comisionPct: number; comisionMonto: number }> {
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id: empleadoId },
      select: { modeloPago: true },
    });
    // SUELDO_FIJO no comisiona (ya). ALQUILER tampoco: el ingreso completo
    // es del inquilino — no hay comisión, hay una cuota que le debe al
    // salón (Fase B2, Pieza 2 se encarga de generarla; aquí solo evitamos
    // que se le calcule comisión por error).
    if (
      empleado?.modeloPago === ModeloPago.SUELDO_FIJO ||
      empleado?.modeloPago === ModeloPago.ALQUILER
    ) {
      return { comisionPct: 0, comisionMonto: 0 };
    }

    const configs = await this.prisma.db.comisionConfig.findMany({
      where: { empleadoId, base: ComisionBase.SERVICIO, activo: true, deletedAt: null },
    });
    const especifica = configs.find((c) => c.servicioId === servicioId);
    const general    = configs.find((c) => !c.servicioId);
    const cfg = especifica ?? general;
    if (!cfg?.porcentaje) return { comisionPct: 0, comisionMonto: 0 };

    const pct = Number(cfg.porcentaje);
    return { comisionPct: pct, comisionMonto: this.round(base * (pct / 100)) };
  }

  private async calcComisionProducto(
    empleadoId: string,
    base: number,
  ): Promise<{ comisionPct: number; comisionMonto: number }> {
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id: empleadoId },
      select: { modeloPago: true },
    });
    // SUELDO_FIJO no comisiona (ya). ALQUILER tampoco: el ingreso completo
    // es del inquilino — no hay comisión, hay una cuota que le debe al
    // salón (Fase B2, Pieza 2 se encarga de generarla; aquí solo evitamos
    // que se le calcule comisión por error).
    if (
      empleado?.modeloPago === ModeloPago.SUELDO_FIJO ||
      empleado?.modeloPago === ModeloPago.ALQUILER
    ) {
      return { comisionPct: 0, comisionMonto: 0 };
    }

    const cfg = await this.prisma.db.comisionConfig.findFirst({
      where: { empleadoId, base: ComisionBase.PRODUCTO, activo: true, deletedAt: null },
    });
    if (!cfg?.porcentaje) return { comisionPct: 0, comisionMonto: 0 };
    const pct = Number(cfg.porcentaje);
    return { comisionPct: pct, comisionMonto: this.round(base * (pct / 100)) };
  }

  /** Valida reglas de fiao contra el balance del cliente. */
  private async validarFiao(
    clienteId: string | undefined,
    saldo: number,
    permitir?: boolean,
  ) {
    if (!permitir) {
      throw new BadRequestException(
        'El pago no cubre el total. Marque permitirFiao o complete el pago.',
      );
    }
    if (!clienteId) {
      throw new BadRequestException('El fiao requiere un cliente registrado');
    }
    const cliente = await this.prisma.db.cliente.findFirst({
      where: { id: clienteId },
      select: { permiteFiao: true, limiteCredito: true },
    });
    if (!cliente) throw new BadRequestException('Cliente no válido');
    if (!cliente.permiteFiao) {
      throw new BadRequestException('El cliente no tiene fiao habilitado');
    }

    // deuda actual + nuevo saldo no debe exceder el límite
    const agg = await this.prisma.db.venta.aggregate({
      where: {
        clienteId,
        estado: { in: [VentaStatus.PENDIENTE, VentaStatus.ABONO_PARCIAL] },
      },
      _sum: { saldo: true },
    });
    const deudaActual = Number(agg._sum.saldo ?? 0);
    const limite = Number(cliente.limiteCredito);

    if (deudaActual + saldo > limite + 0.01) {
      throw new BadRequestException(
        `Excede el límite de crédito. Deuda actual: ${deudaActual}, límite: ${limite}, disponible: ${Math.max(0, limite - deudaActual)}`,
      );
    }
  }

  private resolverEstado(
    total: number,
    pagado: number,
    saldo: number,
  ): VentaStatus {
    if (saldo <= 0.01) return VentaStatus.PAGADA;
    if (pagado <= 0.01) return VentaStatus.PENDIENTE;
    return VentaStatus.ABONO_PARCIAL;
  }

  private async descontarInventario(
    tx: TxClient,
    empresaId: string,
    lineas: LineaCalculada[],
    ventaId: string,
    usuarioId: string,
  ) {
    for (const l of lineas) {
      if (l.productoId && l.tipo !== LineaTipo.SERVICIO) {
        await tx.producto.update({
          where: { id: l.productoId },
          data: { existencia: { decrement: l.cantidad } },
        });
        await tx.movimientoInventario.create({
          data: {
            empresaId,
            productoId: l.productoId,
            tipo: MovimientoInventarioTipo.SALIDA,
            cantidad: l.cantidad,
            motivo: 'VENTA',
            referenciaTipo: 'VENTA',
            referenciaId: ventaId,
            createdBy: usuarioId,
          },
        });
      }
    }
  }

  /** Recalcula y cachea la deuda del cliente. */
  private async actualizarDeudaCliente(
    tx: TxClient,
    clienteId: string,
  ) {
    const agg = await tx.venta.aggregate({
      where: {
        clienteId,
        estado: { in: [VentaStatus.PENDIENTE, VentaStatus.ABONO_PARCIAL] },
      },
      _sum: { saldo: true },
    });
    await tx.cliente.update({
      where: { id: clienteId },
      data: { deudaActual: Number(agg._sum.saldo ?? 0) },
    });
  }

  /** Siguiente número correlativo de factura por empresa. */
  private async nextNumero(
    tx: TxClient,
    empresaId: string,
  ): Promise<number> {
    const last = await tx.venta.findFirst({
      where: { empresaId },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });
    return (last?.numero ?? 0) + 1;
  }

  private async resolveEmpleadoRegistra(usuarioId: string) {
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { usuarioId },
      select: { id: true, sucursalId: true },
    });
    if (empleado) return empleado;
    // Fallback: primer empleado activo de la empresa
    const any = await this.prisma.db.empleado.findFirst({
      where: { activo: true },
      select: { id: true, sucursalId: true },
    });
    if (any) return any;

    // Empresa nueva sin ningún empleado registrado todavía: el OWNER debe
    // poder cobrar desde el primer día sin depender de haber cargado
    // cajeros/recepcionistas antes. `Venta.empleadoId` es una FK real a
    // `Empleado` (no puede apuntar a `Usuario` directo), así que se le crea
    // acá, una sola vez, un `Empleado` propio ligado a su usuario — el
    // `findFirst` de arriba lo va a encontrar y reusar en cobros futuros.
    // Solo para OWNER: cualquier otro rol sin empleado propio ni empleados
    // activos en la empresa sigue viendo el error de siempre (caso ya
    // cubierto hoy por el flujo normal de Equipo, que crea el Empleado
    // antes que el Usuario).
    const user = getCurrentUser();
    if (user.rol === RoleKey.OWNER) {
      const usuario = await this.prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { nombre: true },
      });
      return this.prisma.db.empleado.create({
        data: {
          usuarioId,
          nombre: usuario?.nombre ?? 'Dueño',
          activo: true,
        } as any,
        select: { id: true, sucursalId: true },
      });
    }

    throw new BadRequestException(
      'No hay empleados registrados para asociar la venta',
    );
  }

  // ============ CANDADO DE PIN (Parte B) — rate limit simple ============
  // No hay throttling reutilizable en el proyecto (revisado antes de
  // construir esto), así que es un lockout mínimo en memoria por empresa:
  // 5 PIN incorrectos seguidos → 5 minutos bloqueado. Se resetea si el
  // proceso reinicia y no se comparte entre instancias — suficiente para
  // el despliegue actual (una sola instancia); si se escala horizontalmente
  // esto debería moverse a Redis o similar.
  private readonly PIN_MAX_INTENTOS = 5;
  private readonly PIN_LOCKOUT_MS = 5 * 60 * 1000;
  private pinIntentos = new Map<string, { fallos: number; bloqueadoHasta: number }>();

  private checkPinLockout(empresaId: string) {
    const st = this.pinIntentos.get(empresaId);
    if (st && st.bloqueadoHasta > Date.now()) {
      const minutos = Math.ceil((st.bloqueadoHasta - Date.now()) / 60000);
      throw new ForbiddenException(
        `Demasiados intentos de PIN incorrectos. Intenta de nuevo en ${minutos} minuto(s).`,
      );
    }
  }

  private registrarPinFallo(empresaId: string) {
    const st = this.pinIntentos.get(empresaId) ?? { fallos: 0, bloqueadoHasta: 0 };
    st.fallos += 1;
    if (st.fallos >= this.PIN_MAX_INTENTOS) {
      st.bloqueadoHasta = Date.now() + this.PIN_LOCKOUT_MS;
      st.fallos = 0;
    }
    this.pinIntentos.set(empresaId, st);
  }

  private registrarPinExito(empresaId: string) {
    this.pinIntentos.delete(empresaId);
  }

  private round(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private toResponse(v: any) {
    return {
      id: v.id,
      factura: `F${String(v.numero).padStart(7, '0')}`,
      origen: v.origen,
      citaId: v.citaId ?? null,
      estado: VENTA_ESTADO_ES[v.estado as VentaStatus],
      motivoAnulacion: v.motivoAnulacion ?? null,
      anuladaAt: v.anuladaAt ?? null,
      cliente: v.cliente
        ? { id: v.cliente.id, nombre: v.cliente.nombre, telefono: v.cliente.telefono }
        : null,
      lineas: v.detalles.map((d: any) => ({
        tipo: d.tipo,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        precio: Number(d.precioUnit),
        descuento: Number(d.descuento),
        subtotal: Number(d.subtotal),
        comisionMonto: Number(d.comisionMonto),
      })),
      subtotal: Number(v.subtotal),
      descuento: Number(v.descuento),
      itbis: Number(v.itbis),
      propina: Number(v.propina),
      total: Number(v.total),
      saldo: Number(v.saldo),
      pagos: v.pagos.map((p: any) => ({
        id: p.id,
        metodo: p.metodoPago?.nombre,
        monto: Number(p.monto),
        referencia: p.referencia,
        esAbonoDeuda: p.esAbonoDeuda,
        fecha: p.createdAt,
      })),
      fecha: v.createdAt,
    };
  }
}
