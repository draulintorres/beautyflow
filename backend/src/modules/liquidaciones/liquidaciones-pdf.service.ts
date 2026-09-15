import { Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../core/prisma/prisma.service';
import { getEmpresaId } from '../../core/tenant/tenant-context';

const C_DARK    = '#0a0a0b';
const C_GOLD    = '#C9A24B';
const C_MUTED   = '#9a988f';
const C_TEXT    = '#1a1a1d';
const C_SEP     = '#e5e3da';
const C_ROW_ALT = '#f7f6f1';
const C_TOT_BG  = '#fdf6e3';
const C_AMB     = '#aaa9a1';

const M  = 28;
const PW = 419.53;
const PH = 595.28;
const CW = PW - M * 2;

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmtM(n: number): string {
  return `RD$ ${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: Date): string {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
}
function fmtPeriodo(ini: Date, fin: Date): string {
  const a = new Date(ini), b = new Date(fin);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${String(a.getDate()).padStart(2,'0')} – ${String(b.getDate()).padStart(2,'0')} de ${MESES[a.getMonth()]} ${a.getFullYear()}`;
  }
  return `${fmtDate(ini)} – ${fmtDate(fin)}`;
}
function fmt12h(d: Date): string {
  const dt = new Date(d);
  let h = dt.getHours(), min = dt.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')} ${ampm}`;
}

@Injectable()
export class LiquidacionesPdfService {
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

  async generateComprobante(id: string): Promise<Buffer> {
    const empresaId = getEmpresaId();

    const [liq, empresa] = await Promise.all([
      this.prisma.liquidacionComision.findFirst({
        where: { id, empresaId },
        include: {
          empleado: { select: { nombre: true } },
          creador: { select: { nombre: true } },
          lineas: {
            include: {
              servicio: { select: { nombre: true } },
              venta: { select: { numero: true, createdAt: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { nombre: true, telefono: true, direccion: true, rnc: true },
      }),
    ]);

    if (!liq) throw new NotFoundException('Liquidación no encontrada');
    return this.buildPdf(liq, empresa);
  }

  private async buildPdf(liq: any, empresa: any): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;

    return new Promise<Buffer>((resolve) => {
      const doc = new PDFDocument({
        margin: M,
        size: [PW, PH],
        bufferPages: false,
        info: { Title: `Comprobante de Comisión`, Author: 'Estixa Business' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      let y = M;
      y = this.drawHeader(doc, y, empresa);
      y += 12;

      // Title
      doc.fontSize(13).fillColor(C_TEXT).font('Helvetica-Bold')
        .text('COMPROBANTE DE LIQUIDACIÓN DE COMISIONES', M, y, { width: CW, align: 'center', lineBreak: false });
      y += 22;

      // Cabecera
      this.hRule(doc, y); y += 8;

      const infoRows: [string, string][] = [
        ['Empleado', liq.empleado?.nombre ?? '—'],
        ['Período', fmtPeriodo(liq.periodoIni, liq.periodoFin)],
        ['Fecha de emisión', `${fmtDate(liq.createdAt)}  ${fmt12h(liq.createdAt)}`],
      ];
      if (liq.creador?.nombre) infoRows.push(['Elaborado por', liq.creador.nombre]);
      if (liq.nota) infoRows.push(['Nota', liq.nota]);

      for (const [label, val] of infoRows) {
        doc.fontSize(8).fillColor(C_MUTED).font('Helvetica')
          .text(label + ':', M, y, { width: 110, lineBreak: false });
        doc.fontSize(8).fillColor(C_TEXT).font('Helvetica-Bold')
          .text(val, M + 115, y, { width: CW - 115, lineBreak: false });
        y += 13;
      }

      y += 4;
      this.hRule(doc, y); y += 10;

      // Lines table
      if (liq.lineas && liq.lineas.length > 0) {
        const wFecha = 50, wFact = 54, wDesc = 110, wBase = 60, wPct = 30;
        const wCom = CW - wFecha - wFact - wDesc - wBase - wPct;
        const xFecha = M, xFact = xFecha + wFecha, xDesc = xFact + wFact;
        const xBase = xDesc + wDesc, xPct = xBase + wBase, xCom = xPct + wPct;

        // Header
        doc.rect(M, y, CW, 16).fill('#f0ede4');
        doc.fontSize(7).fillColor('#6b500f').font('Helvetica-Bold');
        doc.text('FECHA',    xFecha + 2, y + 4, { width: wFecha - 4, lineBreak: false });
        doc.text('FACTURA',  xFact + 2,  y + 4, { width: wFact - 4,  lineBreak: false });
        doc.text('SERVICIO', xDesc + 2,  y + 4, { width: wDesc - 4,  lineBreak: false });
        doc.text('BASE',     xBase,      y + 4, { width: wBase - 4, align: 'right', lineBreak: false });
        doc.text('%',        xPct,       y + 4, { width: wPct - 2,  align: 'right', lineBreak: false });
        doc.text('COMISIÓN', xCom,       y + 4, { width: wCom - 4,  align: 'right', lineBreak: false });
        y += 16;

        for (let i = 0; i < liq.lineas.length; i++) {
          const l = liq.lineas[i];
          const rh = 14;
          if (i % 2 === 1) doc.rect(M, y, CW, rh).fill(C_ROW_ALT);

          const fechaStr = fmtDate(l.venta?.createdAt ?? l.createdAt);
          const factStr  = l.venta?.numero != null ? `F${String(l.venta.numero).padStart(7,'0')}` : '—';
          const descStr  = l.servicio?.nombre ?? l.descripcion ?? '—';

          doc.fontSize(7.5).fillColor(C_TEXT).font('Helvetica');
          doc.text(fechaStr, xFecha + 2, y + 3,  { width: wFecha - 4, lineBreak: false });
          doc.text(factStr,  xFact + 2,  y + 3,  { width: wFact - 4,  lineBreak: false });
          doc.text(descStr,  xDesc + 2,  y + 3,  { width: wDesc - 4,  lineBreak: false, ellipsis: true });
          doc.text(fmtM(Number(l.subtotal)),     xBase, y + 3, { width: wBase - 4, align: 'right', lineBreak: false });
          doc.text(`${Number(l.comisionPct)}%`,  xPct,  y + 3, { width: wPct - 2,  align: 'right', lineBreak: false });
          doc.text(fmtM(Number(l.comisionMonto)), xCom, y + 3, { width: wCom - 4,  align: 'right', lineBreak: false });
          y += rh;
        }

        y += 6;
        this.hRule(doc, y, C_SEP); y += 8;
      }

      // Totals
      const tLabelW = 140, tValW = 90;
      const tLX = M + CW - tLabelW - tValW;

      const totRow = (label: string, val: string, bold = false) => {
        doc.fontSize(bold ? 9 : 8).fillColor(C_MUTED).font('Helvetica')
          .text(label, tLX, y, { width: tLabelW, align: 'right', lineBreak: false });
        doc.fontSize(bold ? 9 : 8).fillColor(C_TEXT)
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(val, tLX + tLabelW, y, { width: tValW, align: 'right', lineBreak: false });
        y += bold ? 14 : 12;
      };

      if (Number(liq.totalServicios) > 0) totRow('Total servicios', fmtM(Number(liq.totalServicios)));
      if (Number(liq.totalProductos) > 0) totRow('Total productos', fmtM(Number(liq.totalProductos)));

      y += 2;
      doc.moveTo(tLX, y).lineTo(M + CW, y).strokeColor(C_GOLD).lineWidth(0.7).stroke();
      y += 4;

      // TOTAL highlight box
      doc.rect(M, y, CW, 32).fill(C_TOT_BG);
      doc.rect(M, y, 3, 32).fill(C_GOLD);
      doc.fontSize(8).fillColor(C_MUTED).font('Helvetica')
        .text('TOTAL A PAGAR', M + 10, y + 6, { lineBreak: false });
      doc.fontSize(16).fillColor('#7a4e0c').font('Helvetica-Bold')
        .text(fmtM(Number(liq.totalPagar)), M + 10, y + 14, { width: CW - 20, align: 'right', lineBreak: false });
      y += 38;

      y += 8;
      this.hRule(doc, y, C_SEP); y += 10;

      // Estado
      const esAnulada = !!liq.anuladaAt;
      const esPagada  = liq.pagada && !esAnulada;
      let estadoStr = 'PENDIENTE DE PAGO';
      let estadoColor = '#b45309';
      if (esAnulada) { estadoStr = 'ANULADA'; estadoColor = '#7f1d1d'; }
      else if (esPagada) {
        estadoStr = `PAGADA el ${fmtDate(liq.pagadaAt)}`;
        estadoColor = '#166534';
      }

      doc.rect(M, y, CW, 20).fill(esPagada ? '#f0fdf4' : esAnulada ? '#fff1f2' : '#fffbeb');
      doc.fontSize(9).fillColor(estadoColor).font('Helvetica-Bold')
        .text(`Estado: ${estadoStr}`, M + 10, y + 5, { lineBreak: false });
      y += 26;

      y += 10;
      this.hRule(doc, y); y += 14;

      // Firma
      doc.fontSize(8).fillColor(C_TEXT).font('Helvetica-Bold')
        .text('Recibí conforme:', M, y, { lineBreak: false });
      y += 18;

      const sigLineW = CW * 0.45;
      doc.moveTo(M, y).lineTo(M + sigLineW, y).strokeColor(C_SEP).lineWidth(0.7).stroke();
      doc.moveTo(M + CW - sigLineW, y).lineTo(M + CW, y).strokeColor(C_SEP).lineWidth(0.7).stroke();
      y += 6;

      doc.fontSize(7.5).fillColor(C_MUTED).font('Helvetica')
        .text(liq.empleado?.nombre ?? 'Empleado', M, y, { width: sigLineW, align: 'center', lineBreak: false });
      doc.fontSize(7.5).fillColor(C_MUTED).font('Helvetica')
        .text('Fecha', M + CW - sigLineW, y, { width: sigLineW, align: 'center', lineBreak: false });
      y += 20;

      this.hRule(doc, y); y += 10;

      doc.fontSize(7).fillColor(C_MUTED).font('Helvetica')
        .text('Este documento es un comprobante interno sin valor fiscal.', M, y, { width: CW, align: 'center', lineBreak: false });

      doc.end();
    });
  }

  private drawHeader(doc: any, y: number, empresa: any): number {
    const HDR_H = 72;
    doc.rect(M, y, CW, HDR_H).fill(C_DARK);
    doc.rect(M, y + HDR_H - 1.5, CW, 1.5).fill(C_GOLD);

    let lx = M + 12;
    if (this.logoBuffer) {
      try {
        doc.image(this.logoBuffer, lx, y + (HDR_H - 44) / 2, { width: 44, height: 44 });
        lx += 56;
      } catch { /* ignore */ }
    }

    doc.fontSize(11).fillColor(C_GOLD).font('Helvetica-Bold')
      .text(empresa?.nombre ?? 'Estixa Business', lx, y + 10, { lineBreak: false });

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

  private hRule(doc: any, y: number, color = C_GOLD) {
    doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(color).lineWidth(0.5).stroke();
  }
}