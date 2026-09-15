import { Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../core/prisma/prisma.service';
import { getEmpresaId } from '../../core/tenant/tenant-context';

// Brand constants (same as ExportService)
const C_DARK    = '#0a0a0b';
const C_GOLD    = '#C9A24B';
const C_MUTED   = '#9a988f';
const C_TEXT    = '#1a1a1d';
const C_SEP     = '#e5e3da';
const C_ROW_ALT = '#f7f6f1';
const C_TOT_BG  = '#fdf6e3';
const C_AMB     = '#aaa9a1';

// A5 portrait dimensions (pt)
const M  = 28;
const PW = 419.53;
const PH = 595.28;
const CW = PW - M * 2; // ≈ 363.53

@Injectable()
export class FacturaReciboService {
  private readonly logoBuffer: Buffer | undefined = (() => {
    const candidates = [
      join(__dirname, '..', 'reportes', 'assets', 'logo.png'),
      join(process.cwd(), 'src', 'modules', 'reportes', 'assets', 'logo.png'),
    ];
    for (const p of candidates) {
      try { return readFileSync(p); } catch { /* try next */ }
    }
    return undefined;
  })();

  constructor(private readonly prisma: PrismaService) {}

  async generateVentaRecibo(ventaId: string): Promise<Buffer> {
    const empresaId = getEmpresaId();
    const [venta, empresa] = await Promise.all([
      this.prisma.db.venta.findFirst({
        where: { id: ventaId },
        include: {
          cliente: { select: { id: true, nombre: true, telefono: true } },
          detalles: { include: { empleado: { select: { nombre: true } } } },
          pagos: {
            include: { metodoPago: { select: { nombre: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { nombre: true, telefono: true, direccion: true, rnc: true },
      }),
    ]);
    if (!venta) throw new NotFoundException('Venta no encontrada');
    return this.buildVentaPdf(venta, empresa);
  }

  async generateAbonoRecibo(ventaId: string, pagoId: string): Promise<Buffer> {
    const empresaId = getEmpresaId();
    const [venta, empresa] = await Promise.all([
      this.prisma.db.venta.findFirst({
        where: { id: ventaId },
        include: {
          cliente: { select: { id: true, nombre: true, telefono: true } },
          pagos: {
            where: { id: pagoId },
            include: { metodoPago: { select: { nombre: true } } },
          },
        },
      }),
      this.prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { nombre: true, telefono: true, direccion: true, rnc: true },
      }),
    ]);
    if (!venta) throw new NotFoundException('Venta no encontrada');
    const pago = venta.pagos[0];
    if (!pago) throw new NotFoundException('Pago no encontrado');
    return this.buildAbonoPdf(venta, pago, empresa);
  }

  // ─── RECIBO DE VENTA ─────────────────────────────────────────────────────

  private async buildVentaPdf(venta: any, empresa: any): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;
    const logo = this.logoBuffer;
    const fmtM = (n: number) =>
      `RD$ ${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDate = (d: Date) =>
      new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return new Promise<Buffer>((resolve) => {
      const doc = new PDFDocument({
        margin: M,
        size: [PW, PH],
        bufferPages: false,
        info: { Title: `Recibo F${String(venta.numero).padStart(7, '0')}`, Author: 'Estixa Business' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      let y = M;
      y = this.drawHeader(doc, y, logo, empresa);
      y += 12;

      // ── Title ──
      doc.fontSize(14).fillColor(C_TEXT).font('Helvetica-Bold')
        .text('RECIBO DE VENTA', M, y, { width: CW, align: 'center', lineBreak: false });
      y += 22;

      // ── Factura / Fecha ──
      doc.fontSize(8).fillColor(C_TEXT).font('Helvetica')
        .text(`Factura: F${String(venta.numero).padStart(7, '0')}`, M, y, { lineBreak: false });
      doc.fontSize(8).fillColor(C_TEXT).font('Helvetica')
        .text(`Fecha: ${fmtDate(venta.createdAt)}`, M, y, { width: CW, align: 'right', lineBreak: false });
      y += 13;

      // ── Cliente ──
      const clienteNombre = venta.cliente?.nombre ?? 'Walk-in';
      doc.fontSize(8).fillColor(C_TEXT).font('Helvetica')
        .text(`Cliente: ${clienteNombre}`, M, y, { lineBreak: false });
      if (venta.cliente?.telefono) {
        doc.fontSize(8).fillColor(C_TEXT).font('Helvetica')
          .text(`Tel: ${venta.cliente.telefono}`, M, y, { width: CW, align: 'right', lineBreak: false });
      }
      y += 13;

      y += 4;
      this.hRule(doc, y); y += 8;

      // ── Línea items table ──
      const wDesc = 190, wQty = 32, wUnit = 62;
      const wTot = CW - wDesc - wQty - wUnit;
      const xDesc = M, xQty = xDesc + wDesc, xUnit = xQty + wQty, xTot = xUnit + wUnit;

      doc.rect(M, y, CW, 16).fill('#f0ede4');
      doc.fontSize(7.5).fillColor('#6b500f').font('Helvetica-Bold');
      doc.text('DESCRIPCIÓN', xDesc + 4, y + 4, { width: wDesc - 8, lineBreak: false });
      doc.text('CANT', xQty, y + 4, { width: wQty, align: 'center', lineBreak: false });
      doc.text('PRECIO', xUnit, y + 4, { width: wUnit, align: 'right', lineBreak: false });
      doc.text('TOTAL', xTot, y + 4, { width: wTot - 4, align: 'right', lineBreak: false });
      y += 16;

      for (let i = 0; i < venta.detalles.length; i++) {
        const d = venta.detalles[i];
        const rh = 14;
        if (i % 2 === 1) doc.rect(M, y, CW, rh).fill(C_ROW_ALT);
        doc.fontSize(8).fillColor(C_TEXT).font('Helvetica');
        doc.text(d.descripcion ?? '', xDesc + 4, y + 3, { width: wDesc - 8, lineBreak: false, ellipsis: true });
        doc.text(String(d.cantidad), xQty, y + 3, { width: wQty, align: 'center', lineBreak: false });
        doc.text(fmtM(Number(d.precioUnit)), xUnit, y + 3, { width: wUnit, align: 'right', lineBreak: false });
        doc.text(fmtM(Number(d.subtotal)), xTot, y + 3, { width: wTot - 4, align: 'right', lineBreak: false });
        y += rh;
      }

      y += 6;
      this.hRule(doc, y, C_SEP); y += 8;

      // ── Totals ──
      const tValW = 95, tLabelW = 140;
      const tLX = M + CW - tLabelW - tValW;

      const totRow = (label: string, val: string, bold = false, gold = false) => {
        doc.fontSize(bold ? 9 : 8).fillColor(C_MUTED).font('Helvetica')
          .text(label, tLX, y, { width: tLabelW, align: 'right', lineBreak: false });
        doc.fontSize(bold ? 9 : 8).fillColor(gold ? '#7a4e0c' : C_TEXT)
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(val, tLX + tLabelW, y, { width: tValW, align: 'right', lineBreak: false });
        y += bold ? 14 : 12;
      };

      if (Number(venta.descuento) > 0) {
        totRow('Subtotal', fmtM(Number(venta.subtotal)));
        totRow('Descuento', `- ${fmtM(Number(venta.descuento))}`);
      } else {
        totRow('Subtotal', fmtM(Number(venta.subtotal)));
      }
      if (Number(venta.itbis) > 0) {
        // % mostrado se calcula del propio monto guardado en la venta (no
        // del itbisPct actual de la empresa) — así una venta vieja sigue
        // mostrando la tasa que de verdad se le cobró aunque la empresa
        // haya cambiado su % después.
        const baseImponible = Number(venta.subtotal) - Number(venta.descuento);
        const pct = baseImponible > 0 ? Math.round((Number(venta.itbis) / baseImponible) * 100) : 0;
        totRow(`ITBIS (${pct}%)`, fmtM(Number(venta.itbis)));
      }
      if (Number(venta.propina) > 0) totRow('Propina', fmtM(Number(venta.propina)));

      y += 2;
      doc.moveTo(tLX, y).lineTo(M + CW, y).strokeColor(C_GOLD).lineWidth(0.7).stroke();
      y += 4;
      totRow('TOTAL', fmtM(Number(venta.total)), true, true);

      y += 6;
      this.hRule(doc, y, C_SEP); y += 8;

      // ── Pagos ──
      doc.fontSize(7.5).fillColor('#7a4e0c').font('Helvetica-Bold')
        .text('FORMA DE PAGO', M, y); y += 12;

      for (const p of venta.pagos) {
        const lbl = p.esAbonoDeuda
          ? `${p.metodoPago?.nombre ?? '—'} (abono)`
          : (p.metodoPago?.nombre ?? '—');
        doc.fontSize(8).fillColor(C_TEXT).font('Helvetica')
          .text(lbl, M, y, { lineBreak: false });
        doc.fontSize(8).fillColor(C_TEXT).font('Helvetica')
          .text(fmtM(Number(p.monto)), M, y, { width: CW, align: 'right', lineBreak: false });
        y += 12;
        if (p.referencia) {
          doc.fontSize(7).fillColor(C_MUTED).font('Helvetica')
            .text(`Ref: ${p.referencia}`, M + 4, y, { lineBreak: false });
          y += 10;
        }
      }

      if (Number(venta.saldo) > 0) {
        y += 4;
        doc.rect(M, y, CW, 20).fill(C_TOT_BG);
        doc.rect(M, y, 3, 20).fill(C_GOLD);
        doc.fontSize(8.5).fillColor('#7a4e0c').font('Helvetica-Bold')
          .text('Saldo pendiente:', M + 8, y + 5, { lineBreak: false });
        doc.fontSize(8.5).fillColor('#7a4e0c').font('Helvetica-Bold')
          .text(fmtM(Number(venta.saldo)), M + 8, y + 5, { width: CW - 16, align: 'right', lineBreak: false });
        y += 26;
      }

      y += 8;
      this.hRule(doc, y); y += 10;

      doc.fontSize(7).fillColor(C_MUTED).font('Helvetica')
        .text('Este documento es un comprobante de venta sin valor fiscal.',
          M, y, { width: CW, align: 'center', lineBreak: false });

      if (venta.estado === 'ANULADA') this.drawAnuladaWatermark(doc);

      doc.end();
    });
  }

  // ─── RECIBO DE PAGO / ABONO ──────────────────────────────────────────────

  private async buildAbonoPdf(venta: any, pago: any, empresa: any): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;
    const logo = this.logoBuffer;
    const fmtM = (n: number) =>
      `RD$ ${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDate = (d: Date) =>
      new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return new Promise<Buffer>((resolve) => {
      const doc = new PDFDocument({
        margin: M,
        size: [PW, PH],
        bufferPages: false,
        info: { Title: 'Recibo de Pago', Author: 'Estixa Business' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      let y = M;
      y = this.drawHeader(doc, y, logo, empresa);
      y += 12;

      // ── Title ──
      doc.fontSize(14).fillColor(C_TEXT).font('Helvetica-Bold')
        .text('RECIBO DE PAGO', M, y, { width: CW, align: 'center', lineBreak: false });
      y += 22;

      // ── Info ──
      doc.fontSize(8).fillColor(C_TEXT).font('Helvetica')
        .text(`Factura: F${String(venta.numero).padStart(7, '0')}`, M, y, { lineBreak: false });
      doc.fontSize(8).fillColor(C_TEXT).font('Helvetica')
        .text(`Fecha de pago: ${fmtDate(pago.createdAt)}`, M, y, { width: CW, align: 'right', lineBreak: false });
      y += 13;

      if (venta.cliente?.nombre) {
        doc.fontSize(8).fillColor(C_TEXT).font('Helvetica')
          .text(`Cliente: ${venta.cliente.nombre}`, M, y, { lineBreak: false });
        y += 13;
      }

      y += 4;
      this.hRule(doc, y); y += 12;

      // ── Monto highlight ──
      doc.rect(M, y, CW, 58).fill(C_TOT_BG);
      doc.rect(M, y, 3, 58).fill(C_GOLD);
      doc.fontSize(8).fillColor(C_MUTED).font('Helvetica')
        .text('Monto pagado', M + 12, y + 8, { lineBreak: false });
      doc.fontSize(18).fillColor('#7a4e0c').font('Helvetica-Bold')
        .text(fmtM(Number(pago.monto)), M + 12, y + 22, { width: CW - 24, align: 'right', lineBreak: false });
      y += 66;

      // ── Método / referencia ──
      doc.fontSize(8).fillColor(C_MUTED).font('Helvetica')
        .text('Método de pago:', M, y, { lineBreak: false });
      doc.fontSize(8).fillColor(C_TEXT).font('Helvetica-Bold')
        .text(pago.metodoPago?.nombre ?? '—', M, y, { width: CW, align: 'right', lineBreak: false });
      y += 13;

      if (pago.referencia) {
        doc.fontSize(8).fillColor(C_MUTED).font('Helvetica')
          .text('Referencia:', M, y, { lineBreak: false });
        doc.fontSize(8).fillColor(C_TEXT).font('Helvetica')
          .text(pago.referencia, M, y, { width: CW, align: 'right', lineBreak: false });
        y += 13;
      }

      y += 6;
      this.hRule(doc, y, C_SEP); y += 10;

      // ── Saldo restante ──
      const saldo = Number(venta.saldo);
      doc.fontSize(8).fillColor(C_MUTED).font('Helvetica')
        .text('Saldo restante de la factura:', M, y, { lineBreak: false });
      doc.fontSize(8).fillColor(saldo > 0 ? '#b45309' : '#166534').font('Helvetica-Bold')
        .text(saldo > 0 ? fmtM(saldo) : 'PAGADA ✓', M, y, { width: CW, align: 'right', lineBreak: false });
      y += 16;

      y += 6;
      this.hRule(doc, y); y += 10;

      doc.fontSize(7).fillColor(C_MUTED).font('Helvetica')
        .text('Este documento es un comprobante de pago sin valor fiscal.',
          M, y, { width: CW, align: 'center', lineBreak: false });

      // Si la venta se anuló después de este pago, el recibo del abono
      // también debe advertirlo — nunca debe poder confundirse con un
      // comprobante de una venta vigente.
      if (venta.estado === 'ANULADA') this.drawAnuladaWatermark(doc);

      doc.end();
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /** Marca de agua diagonal "ANULADA" sobre todo el recibo — para que
   *  reimprimir/compartir el comprobante de una venta anulada nunca se
   *  confunda con uno válido. */
  private drawAnuladaWatermark(doc: any) {
    doc.save();
    doc.opacity(0.45);
    doc.fillColor('#D8503A');
    doc.font('Helvetica-Bold').fontSize(52);
    doc.rotate(-32, { origin: [PW / 2, PH / 2] });
    doc.text('ANULADA', 0, PH / 2 - 30, { width: PW, align: 'center', lineBreak: false });
    doc.restore();
    doc.opacity(1);
  }

  private drawHeader(doc: any, y: number, logo: Buffer | undefined, empresa: any): number {
    const HDR_H = 72;
    doc.rect(M, y, CW, HDR_H).fill(C_DARK);
    doc.rect(M, y + HDR_H - 1.5, CW, 1.5).fill(C_GOLD);

    let lx = M + 12;
    if (logo) {
      try {
        doc.image(logo, lx, y + (HDR_H - 44) / 2, { width: 44, height: 44 });
        lx += 56;
      } catch { /* ignore */ }
    }

    // Empresa name
    doc.fontSize(11).fillColor(C_GOLD).font('Helvetica-Bold')
      .text(empresa?.nombre ?? 'Estixa Business', lx, y + 10, { lineBreak: false });

    // Info lines stacked: RNC · Tel · Dirección
    const infoLines: string[] = [];
    if (empresa?.rnc)       infoLines.push(`RNC: ${empresa.rnc}`);
    if (empresa?.telefono)  infoLines.push(`Tel: ${empresa.telefono}`);
    if (empresa?.direccion) infoLines.push(empresa.direccion);

    let iy = y + 25;
    for (const line of infoLines) {
      doc.fontSize(7.5).fillColor(C_AMB).font('Helvetica')
        .text(line, lx, iy, { lineBreak: false });
      iy += 11;
    }

    return y + HDR_H;
  }

  private hRule(doc: any, y: number, color = C_GOLD, alpha = 0.55) {
    doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(color).lineWidth(0.5).stroke();
  }
}
