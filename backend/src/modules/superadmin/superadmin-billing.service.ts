import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RegistrarPagoSaaSDto } from './dto/superadmin.dto';
import {
  EmpresaStatus,
  SubStatus,
  FacturaSaaSStatus,
} from '@prisma/client';

@Injectable()
export class SuperAdminBillingService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ FACTURAS ============
  async listarFacturas(filtro?: { status?: FacturaSaaSStatus }) {
    return this.prisma.facturaSaaS.findMany({
      where: { ...(filtro?.status && { status: filtro.status }) },
      include: {
        subscription: {
          include: { empresa: { select: { nombre: true, slug: true } } },
        },
      },
      orderBy: { fechaVencimiento: 'desc' },
    });
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
    const subs = await this.prisma.subscription.findMany({
      where: { status: { in: [SubStatus.ACTIVE, SubStatus.PAST_DUE] } },
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

    const vencidas = await this.prisma.facturaSaaS.findMany({
      where: {
        status: FacturaSaaSStatus.PENDIENTE,
        fechaVencimiento: { lt: hoy },
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
