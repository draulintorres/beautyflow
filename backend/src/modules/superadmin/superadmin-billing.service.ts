import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EmailService } from '../../core/email/email.service';
import { RegistrarPagoSaaSDto } from './dto/superadmin.dto';
import {
  EmpresaStatus,
  SubStatus,
  FacturaSaaSStatus,
  RoleKey,
} from '@prisma/client';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

@Injectable()
export class SuperAdminBillingService {
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {
    // Sin barra final (mismo fix que auth.service.ts / superadmin.service.ts).
    this.frontendUrl = this.config.getOrThrow('FRONTEND_URL').replace(/\/+$/, '');
  }

  // ============ FACTURAS ============
  async listarFacturas(filtro?: { status?: FacturaSaaSStatus }) {
    return this.prisma.facturaSaaS.findMany({
      where: {
        ...(filtro?.status && { status: filtro.status }),
        // Una factura PAGADA de una empresa que después se eliminó sigue
        // siendo historial real de cobro -- se muestra igual. Pero
        // PENDIENTE/VENCIDA/ANULADA de una empresa ya eliminada no es
        // nada cobrable (nunca lo será) y solo ensucia "Pendiente de
        // cobro": eliminarEmpresa() nunca cancela la Subscription, así
        // que sin este filtro esas facturas fantasma se acumulan para
        // siempre (confirmado: ~20 empresas de prueba inflando el total).
        OR: [
          { subscription: { empresa: { deletedAt: null } } },
          { status: FacturaSaaSStatus.PAGADA },
        ],
      },
      include: {
        subscription: {
          include: { empresa: { select: { nombre: true, slug: true } } },
        },
      },
      orderBy: { fechaVencimiento: 'desc' },
    });
  }

  /**
   * Correo manual de "te recordamos que tenés un pago pendiente" al dueño
   * de la empresa de una factura PENDIENTE o VENCIDA — disparado a mano
   * desde Facturación SaaS (botón "Enviar recordatorio" por factura), no
   * automático. Mismo EmailService/Resend que el correo de bienvenida, y
   * SÍ se espera (igual que se corrigió en crearEmpresa()) para no perder
   * el envío si el proceso se reinicia justo después de responder.
   */
  async enviarRecordatorio(facturaId: string) {
    const factura = await this.prisma.facturaSaaS.findUnique({
      where: { id: facturaId },
      include: { subscription: { include: { empresa: true } } },
    });
    if (!factura) throw new NotFoundException('Factura no encontrada');
    if (factura.subscription.empresa.deletedAt) {
      throw new ConflictException('La empresa de esta factura ya fue eliminada.');
    }
    if (factura.status === FacturaSaaSStatus.PAGADA || factura.status === FacturaSaaSStatus.ANULADA) {
      throw new ConflictException('Esta factura ya no tiene un pago pendiente.');
    }

    const owner = await this.prisma.usuario.findFirst({
      where: {
        empresaId: factura.empresaId,
        rol: { roleKey: RoleKey.OWNER },
        activo: true,
        deletedAt: null,
      },
      select: { nombre: true, email: true },
    });
    if (!owner) {
      throw new NotFoundException(
        'No se encontró un usuario dueño activo para esta empresa.',
      );
    }

    const empresaNombre = factura.subscription.empresa.nombre;
    const [anio, mes] = factura.periodo.split('-');
    const periodoTexto = `${MESES[Number(mes) - 1] ?? mes} ${anio}`;
    const monto = Number(factura.monto).toLocaleString('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const vencida = factura.status === FacturaSaaSStatus.VENCIDA;
    const vencimientoTexto = factura.fechaVencimiento.toLocaleDateString('es-DO', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const loginUrl = `${this.frontendUrl}/login`;
    // Mismo número de soporte que ya usa el frontend (lib/soporte.ts) —
    // no se puede reusar ese helper acá (es del bundle del frontend), así
    // que se repite el mismo número y formato de link de wa.me.
    const mensajeWa = encodeURIComponent(
      `Hola, tengo una duda sobre el pago pendiente de ${empresaNombre}.`,
    );
    const linkWhatsApp = `https://wa.me/18492606783?text=${mensajeWa}`;

    await this.email.enviar(
      owner.email,
      vencida
        ? `Pago vencido — ${empresaNombre}`
        : `Recordatorio de pago — ${empresaNombre}`,
      `
        <p>¡Hola${owner.nombre ? ` ${owner.nombre}` : ''}!</p>
        <p>
          Te escribimos para recordarte que la suscripción de <b>${empresaNombre}</b> a Estixa
          correspondiente a <b>${periodoTexto}</b> tiene un pago
          ${vencida ? 'vencido' : 'pendiente'}:
        </p>
        <p>
          Monto: <b>RD$ ${monto}</b><br>
          Vencimiento: <b>${vencimientoTexto}</b>
        </p>
        ${vencida
          ? '<p>Al estar vencida, tu acceso a Estixa puede quedar suspendido hasta regularizar el pago.</p>'
          : ''
        }
        <p>
          Si ya lo pagaste, ignorá este correo. Cualquier duda, escribinos por WhatsApp al
          <a href="${linkWhatsApp}">849-260-6783</a>.
        </p>
        <p><a href="${loginUrl}">${loginUrl}</a></p>
      `,
    );

    return { success: true, email: owner.email };
  }

  async registrarPago(dto: RegistrarPagoSaaSDto) {
    const factura = await this.prisma.facturaSaaS.findUnique({
      where: { id: dto.facturaId },
      include: { subscription: true },
    });
    if (!factura) throw new Error('Factura no encontrada');

    await this.prisma.$transaction(async (tx) => {
      await tx.facturaSaaS.update({
        where: { id: dto.facturaId },
        data: {
          status: FacturaSaaSStatus.PAGADA,
          fechaPago: dto.fechaPago ? new Date(dto.fechaPago) : new Date(),
        },
      });

      // Reactivar empresa si estaba suspendida por pago
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await tx.subscription.update({
        where: { id: factura.subscriptionId },
        data: { status: SubStatus.ACTIVE, currentPeriodEnd: periodEnd },
      });
      await tx.empresa.update({
        where: { id: factura.empresaId },
        data: { estado: EmpresaStatus.ACTIVE },
      });
    });

    return { success: true };
  }

  /** Genera la factura del período actual para cada suscripción activa. */
  async generarFacturasDelMes() {
    // `empresa.deletedAt: null` es necesario a propósito: eliminarEmpresa()
    // (soft-delete) nunca cancela la Subscription asociada, así que sin
    // este filtro esto le seguía generando una factura PENDIENTE cada mes,
    // para siempre, a cualquier empresa ya borrada -- confirmado en vivo:
    // generó facturas reales para ~20 empresas de prueba ya eliminadas.
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: { in: [SubStatus.ACTIVE, SubStatus.PAST_DUE] },
        empresa: { deletedAt: null },
      },
      include: { planRef: true },
    });

    const periodo = new Date().toISOString().slice(0, 7); // YYYY-MM
    let generadas = 0;

    for (const sub of subs) {
      const yaExiste = await this.prisma.facturaSaaS.findFirst({
        where: { subscriptionId: sub.id, periodo },
        select: { id: true },
      });
      if (yaExiste) continue;

      const vencimiento = new Date();
      vencimiento.setDate(vencimiento.getDate() + 10); // 10 días para pagar

      await this.prisma.facturaSaaS.create({
        data: {
          subscriptionId: sub.id,
          empresaId: sub.empresaId,
          monto: sub.planRef?.precio ?? 0,
          periodo,
          fechaVencimiento: vencimiento,
          status: FacturaSaaSStatus.PENDIENTE,
        },
      });
      generadas++;
    }
    return { generadas };
  }

  /**
   * Job diario de suspensión automática: marca como VENCIDA las facturas
   * impagas vencidas y suspende la empresa correspondiente.
   */
  async suspenderMorosas() {
    const hoy = new Date();

    // Mismo filtro que generarFacturasDelMes(): sin él, esto le pisaba el
    // estado CANCELED a una empresa ya eliminada, devolviéndola a
    // SUSPENDED -- un dato incorrecto sobre algo que ya no debería
    // tocarse en absoluto.
    const vencidas = await this.prisma.facturaSaaS.findMany({
      where: {
        status: FacturaSaaSStatus.PENDIENTE,
        fechaVencimiento: { lt: hoy },
        subscription: { empresa: { deletedAt: null } },
      },
      include: { subscription: true },
    });

    let suspendidas = 0;
    for (const f of vencidas) {
      await this.prisma.$transaction([
        this.prisma.facturaSaaS.update({
          where: { id: f.id },
          data: { status: FacturaSaaSStatus.VENCIDA },
        }),
        this.prisma.subscription.update({
          where: { id: f.subscriptionId },
          data: { status: SubStatus.SUSPENDED },
        }),
        this.prisma.empresa.update({
          where: { id: f.empresaId },
          data: { estado: EmpresaStatus.SUSPENDED },
        }),
      ]);
      suspendidas++;
    }
    return { suspendidas, motivo: 'Factura vencida' };
  }

  // ============ DASHBOARD SAAS ============
  async dashboard() {
    const [
      empresasActivas,
      empresasSuspendidas,
      nuevasEsteMes,
      ingresosMes,
      facturasVencidas,
      porPlan,
    ] = await Promise.all([
      this.prisma.empresa.count({
        where: { estado: EmpresaStatus.ACTIVE, deletedAt: null },
      }),
      this.prisma.empresa.count({
        where: { estado: EmpresaStatus.SUSPENDED, deletedAt: null },
      }),
      this.prisma.empresa.count({
        where: {
          deletedAt: null,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      this.prisma.facturaSaaS.aggregate({
        where: {
          status: FacturaSaaSStatus.PAGADA,
          fechaPago: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: { monto: true },
      }),
      this.prisma.facturaSaaS.count({
        where: { status: FacturaSaaSStatus.VENCIDA },
      }),
      this.prisma.subscription.groupBy({
        by: ['plan'],
        _count: true,
      }),
    ]);

    return {
      empresasActivas,
      empresasSuspendidas,
      nuevasEsteMes,
      ingresosMensualesSaaS: Number(ingresosMes._sum.monto ?? 0),
      facturasVencidas,
      planesMasVendidos: porPlan.map((p) => ({
        plan: p.plan,
        empresas: p._count,
      })),
    };
  }
}
