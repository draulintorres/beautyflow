import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ReporteTabular } from './dto/reporte.dto';

export interface ArchivoExportado {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

interface KpiItem {
  label: string;
  value: string;
  isGold?: boolean;
}

// ── Layout constants (A4 landscape: 841.89 × 595.28 pt) ──
const MARGIN  = 36;
const HDR_H   = 84;   // dark header band height
const KPI_H   = 72;   // KPI cards row height
const COL_H   = 22;   // column header row height
const ROW_H   = 16;   // data row height
const FTR_H   = 28;   // space reserved at page bottom for footer

// ── Brand colors ──
const C_DARK     = '#0a0a0b';
const C_SURF     = '#1a1a1d';
const C_GOLD     = '#C9A24B';
const C_GOLD_S   = '#E4CB8A';
const C_MUTED    = '#9a988f';
const C_WHITE    = '#FFFFFF';
const C_TEXT     = '#1a1a1d';
const C_ROW_ALT  = '#f7f6f1';
const C_TOT_BG   = '#fdf6e3';
const C_SEP      = '#e5e3da';
const C_CARD_BG  = '#f5f4ef';

/**
 * Convierte un ReporteTabular al formato solicitado.
 * CSV es nativo. Excel usa exceljs. PDF usa pdfkit — ambos con import dinámico.
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger('Export');

  // Carga el logo una vez al iniciar el servicio
  private readonly logoBuffer: Buffer | undefined = (() => {
    const candidates = [
      join(__dirname, 'assets', 'logo.png'),
      join(process.cwd(), 'src', 'modules', 'reportes', 'assets', 'logo.png'),
    ];
    for (const p of candidates) {
      try { return readFileSync(p); } catch { /* try next */ }
    }
    return undefined;
  })();

  // ── CSV (sin cambios) ──────────────────────────────────────────────────────
  toCsv(rep: ReporteTabular): ArchivoExportado {
    const headers = rep.columnas.map((c) => this.escapeCsv(c.label)).join(',');
    const rows = rep.filas.map((fila) =>
      rep.columnas.map((c) => this.escapeCsv(this.cell(fila[c.key]))).join(','),
    );

    let contenido = `${rep.titulo}\n`;
    if (rep.subtitulo) contenido += `${rep.subtitulo}\n`;
    contenido += '\n' + headers + '\n' + rows.join('\n');

    if (rep.totales) {
      const totalRow = rep.columnas
        .map((c) => this.escapeCsv(this.cell(rep.totales?.[c.key] ?? '')))
        .join(',');
      contenido += '\n' + totalRow;
    }

    return {
      buffer: Buffer.from('﻿' + contenido, 'utf8'),
      contentType: 'text/csv; charset=utf-8',
      filename: this.filename(rep.titulo, 'csv'),
    };
  }

  // ── Excel (sin cambios) ────────────────────────────────────────────────────
  async toExcel(rep: ReporteTabular): Promise<ArchivoExportado> {
    let ExcelJS: any;
    try {
      ExcelJS = await import('exceljs');
    } catch {
      this.logger.warn('exceljs no instalado; usa "npm install exceljs"');
      const csv = this.toCsv(rep);
      return { ...csv, filename: this.filename(rep.titulo, 'csv') };
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Estixa';
    const ws = wb.addWorksheet('Reporte');

    ws.addRow([rep.titulo]);
    ws.getRow(1).font = { bold: true, size: 14 };
    if (rep.subtitulo) ws.addRow([rep.subtitulo]);
    ws.addRow([]);

    const headerRow = ws.addRow(rep.columnas.map((c) => c.label));
    headerRow.font = { bold: true };
    headerRow.eachCell((cell: any) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
      cell.font = { bold: true, color: { argb: 'FFC9A24B' } };
    });

    for (const fila of rep.filas) {
      ws.addRow(
        rep.columnas.map((c) => {
          const val = fila[c.key];
          return c.tipo === 'dinero' || c.tipo === 'numero' ? Number(val ?? 0) : val ?? '';
        }),
      );
    }

    if (rep.totales) {
      const totalRow = ws.addRow(
        rep.columnas.map((c) => {
          const val = rep.totales?.[c.key];
          if (val === undefined) return '';
          return c.tipo === 'dinero' || c.tipo === 'numero' ? Number(val) : val;
        }),
      );
      totalRow.font = { bold: true };
    }

    rep.columnas.forEach((c, i) => {
      if (c.tipo === 'dinero') ws.getColumn(i + 1).numFmt = '#,##0.00';
      ws.getColumn(i + 1).width = Math.max(12, c.label.length + 4);
    });

    const buffer = await wb.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(buffer),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: this.filename(rep.titulo, 'xlsx'),
    };
  }

  // ── PDF (rediseñado) ───────────────────────────────────────────────────────
  async toPdf(rep: ReporteTabular): Promise<ArchivoExportado> {
    let PDFDocument: any;
    try {
      PDFDocument = (await import('pdfkit')).default;
    } catch {
      this.logger.warn('pdfkit no instalado; usa "npm install pdfkit"');
      const csv = this.toCsv(rep);
      return { ...csv, filename: this.filename(rep.titulo, 'csv') };
    }

    const logo = this.logoBuffer;
    const kpis = this.computeKpis(rep);
    const hasKpis = kpis.length > 0;

    return new Promise((resolve) => {
      const doc = new PDFDocument({
        margin: MARGIN,
        size: 'A4',
        layout: 'landscape',
        bufferPages: true,
        autoFirstPage: true,
        info: { Title: rep.titulo, Author: 'Estixa Business' },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () =>
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: 'application/pdf',
          filename: this.filename(rep.titulo, 'pdf'),
        }),
      );

      const PW = doc.page.width;
      const PH = doc.page.height;
      const CW = PW - 2 * MARGIN;
      const PAD_CELL = 8;
      const isNum = (tipo?: string) => tipo === 'dinero' || tipo === 'numero';
      // For reports with ≤ 3 columns, center everything so amounts appear mid-column
      // rather than pinned to the far right edge of the page.
      const colAlign = (tipo?: string): 'right' | 'center' =>
        rep.columnas.length > 3 && isNum(tipo) ? 'right' : 'center';

      // ── Dynamic column widths (two-pass: proportional + label-minimum floor) ──
      const colWeight = (col: { key: string; tipo?: string }): number => {
        if (col.tipo === 'dinero') return 1.0;
        if (col.tipo === 'numero') return 1.0;
        if (col.tipo === 'fecha')  return 1.0;
        const k = col.key.toLowerCase();
        if (/nombre|producto|cliente|servicio|descripcion|concepto|empleado|categoria|marca/.test(k)) return 2.5;
        return 1.2;
      };
      const rawWeights = rep.columnas.map((c) => colWeight(c));
      const totalRaw = rawWeights.reduce((s, w) => s + w, 0);
      const initWidths = rawWeights.map((w) => (w / totalRaw) * CW);
      // Boost any column whose label header wouldn't fit (Helvetica-Bold 7.5pt ≈ 4.4pt/char)
      const finalWeights = rawWeights.map((w, i) => {
        const minW = rep.columnas[i].label.length * 4.4 + PAD_CELL * 2 + 4;
        return initWidths[i] < minW ? w * (minW / initWidths[i]) : w;
      });
      const totalFinal = finalWeights.reduce((s, w) => s + w, 0);
      const colWidths = finalWeights.map((w) => (w / totalFinal) * CW);
      const colX: number[] = [];
      { let xAcc = MARGIN; for (const w of colWidths) { colX.push(xAcc); xAcc += w; } }

      // ── computedTotales: fills missing dinero AND numero columns by summing rows ──
      const computedTotales: Record<string, any> | undefined = (() => {
        if (!rep.totales) return undefined;
        const t: Record<string, any> = { ...rep.totales };
        for (const col of rep.columnas) {
          if ((col.tipo === 'dinero' || col.tipo === 'numero') && t[col.key] === undefined) {
            const sum = rep.filas.reduce((acc, f) => acc + Number(f[col.key] ?? 0), 0);
            if (sum !== 0) t[col.key] = sum;
          }
        }
        return t;
      })();

      // ── helpers ──

      // Format SCREAMING_SNAKE_CASE words in any string (used for subtítulo + cell values)
      const formatSnake = (s: string): string =>
        s.replace(/\b[A-Z][A-Z_]{3,}\b/g, (m) =>
          m.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
        );

      const pdfCell = (val: any, tipo?: string, key?: string): string => {
        if (val === null || val === undefined) return '';
        if (tipo === 'dinero') {
          return `RD$ ${Number(val).toLocaleString('es-DO', {
            minimumFractionDigits: 2, maximumFractionDigits: 2,
          })}`;
        }
        const s = String(val);
        // Hour columns: "HH:MM" → "H:MM AM/PM"
        if ((key ?? '').toLowerCase().includes('hora') && /^\d{1,2}:\d{2}/.test(s)) {
          const [h, m] = s.split(':').map(Number);
          const period = h >= 12 ? 'PM' : 'AM';
          return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`;
        }
        // SCREAMING_SNAKE_CASE status values → "Title case with spaces"
        if (/^[A-Z][A-Z_]{3,}$/.test(s)) {
          return s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
        }
        return s;
      };

      // Compute actual row height needed, allowing up to 2 lines for text columns.
      const computeRowH = (fila: Record<string, any>): number => {
        let max = ROW_H;
        try {
          doc.font('Helvetica').fontSize(8);
          rep.columnas.forEach((col, i) => {
            if (isNum(col.tipo) || col.tipo === 'fecha') return;
            const val = pdfCell(fila[col.key], col.tipo, col.key);
            if (!val) return;
            const h = doc.heightOfString(val, { width: colWidths[i] - PAD_CELL * 2 });
            max = Math.max(max, Math.min(h + 8, ROW_H * 2));
          });
        } catch { /* fallback to default ROW_H */ }
        return max;
      };

      const drawColHeaders = (atY: number): number => {
        doc.rect(MARGIN, atY, CW, COL_H).fill(C_SURF);
        doc.rect(MARGIN, atY + COL_H - 1, CW, 1).fill(C_GOLD);
        rep.columnas.forEach((col, i) => {
          doc
            .fontSize(7.5)
            .fillColor(C_GOLD)
            .font('Helvetica-Bold')
            .text(col.label.toUpperCase(), colX[i] + PAD_CELL, atY + 7, {
              width: colWidths[i] - PAD_CELL * 2,
              align: colAlign(col.tipo),
              lineBreak: false,
              ellipsis: true,
            });
        });
        for (let ci = 1; ci < rep.columnas.length; ci++) {
          doc
            .moveTo(colX[ci], atY + 4)
            .lineTo(colX[ci], atY + COL_H - 4)
            .strokeColor(C_GOLD)
            .lineWidth(0.3)
            .stroke();
        }
        return atY + COL_H;
      };

      const drawDataRow = (fila: Record<string, any>, idx: number, atY: number, rowH: number) => {
        if (idx % 2 === 0) {
          doc.rect(MARGIN, atY, CW, rowH).fill(C_ROW_ALT);
        }
        rep.columnas.forEach((col, i) => {
          const val = pdfCell(fila[col.key], col.tipo, col.key);
          const monetary = isNum(col.tipo);
          doc
            .fontSize(8)
            .fillColor(C_TEXT)
            .font('Helvetica')
            .text(val, colX[i] + PAD_CELL, atY + 4, {
              width: colWidths[i] - PAD_CELL * 2,
              align: colAlign(col.tipo),
              lineBreak: !monetary,
              height: rowH - 8,
              ellipsis: true,
            });
        });
        for (let ci = 1; ci < rep.columnas.length; ci++) {
          doc
            .moveTo(colX[ci], atY + 3)
            .lineTo(colX[ci], atY + rowH - 3)
            .strokeColor(C_SEP)
            .lineWidth(0.5)
            .stroke();
        }
        doc
          .moveTo(MARGIN, atY + rowH)
          .lineTo(MARGIN + CW, atY + rowH)
          .strokeColor(C_SEP)
          .lineWidth(0.3)
          .stroke();
      };

      const drawTotalsRow = (atY: number) => {
        if (!computedTotales) return;
        doc.rect(MARGIN, atY, CW, ROW_H + 2).fill(C_TOT_BG);
        doc.rect(MARGIN, atY, 3, ROW_H + 2).fill(C_GOLD);
        rep.columnas.forEach((col, i) => {
          const val = computedTotales[col.key];
          const display =
            val !== undefined ? pdfCell(val, col.tipo) : i === 0 ? 'TOTAL' : '';
          doc
            .fontSize(8.5)
            .fillColor('#6b500f')
            .font('Helvetica-Bold')
            .text(display, colX[i] + PAD_CELL, atY + 4, {
              width: colWidths[i] - PAD_CELL * 2,
              align: colAlign(col.tipo),
              lineBreak: false,
              ellipsis: true,
            });
        });
      };

      // ── FIRST PAGE: HEADER BAND ──────────────────────────────────────────
      doc.rect(MARGIN, MARGIN, CW, HDR_H).fill(C_DARK);
      doc.rect(MARGIN, MARGIN + HDR_H - 2, CW, 2).fill(C_GOLD);

      let contentX = MARGIN + 14;
      if (logo) {
        const LOGO_SZ = 52;
        try {
          doc.image(logo, contentX, MARGIN + (HDR_H - LOGO_SZ) / 2, {
            width: LOGO_SZ,
            height: LOGO_SZ,
          });
        } catch { /* logo render failed silently */ }
        contentX += LOGO_SZ + 12;
      }

      doc
        .fontSize(13)
        .fillColor(C_GOLD)
        .font('Helvetica-Bold')
        .text('Estixa Business', contentX, MARGIN + 14, { lineBreak: false });
      if (rep.empresa?.nombre) {
        doc
          .fontSize(9.5)
          .fillColor('#cccccc')
          .font('Helvetica')
          .text(rep.empresa.nombre, contentX, MARGIN + 30, { lineBreak: false });
      }
      if (rep.empresa?.sucursal) {
        doc
          .fontSize(8.5)
          .fillColor(C_MUTED)
          .font('Helvetica')
          .text(rep.empresa.sucursal, contentX, MARGIN + 44, { lineBreak: false });
      }

      const infoLines: string[] = [];
      if (rep.empresa?.telefono) infoLines.push(`Tel: ${rep.empresa.telefono}`);
      if (rep.empresa?.direccion) infoLines.push(rep.empresa.direccion);
      if (rep.empresa?.rnc)      infoLines.push(`RNC: ${rep.empresa.rnc}`);
      if (rep.subtitulo)         infoLines.push(`Período: ${rep.subtitulo.split('·')[0].trim()}`);

      const now = new Date();
      const fechaGen = now.toLocaleDateString('es-DO', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      const horaGen = now.toLocaleTimeString('es-DO', {
        hour: '2-digit', minute: '2-digit',
      });
      infoLines.push(`Generado: ${fechaGen}  ${horaGen}`);
      if (rep.generadoPor) infoLines.push(`Generado por: ${rep.generadoPor}`);

      const INFO_W = 220;
      const INFO_RIGHT_PAD = 14;
      let infoY = MARGIN + 10;
      doc.fontSize(8).fillColor('#b0afa8').font('Helvetica');
      for (const line of infoLines) {
        doc.text(line, PW - MARGIN - INFO_W - INFO_RIGHT_PAD, infoY, {
          width: INFO_W,
          align: 'right',
          lineBreak: false,
          ellipsis: true,
        });
        infoY += 11;
      }

      // ── TITLE ────────────────────────────────────────────────────────────
      let y = MARGIN + HDR_H + 12;

      doc
        .fontSize(18)
        .fillColor(C_TEXT)
        .font('Helvetica-Bold')
        .text(rep.titulo, MARGIN, y, { width: CW, align: 'center', lineBreak: false });
      y += 26;

      if (rep.subtitulo) {
        doc
          .fontSize(9.5)
          .fillColor(C_TEXT)
          .font('Helvetica')
          .text(formatSnake(rep.subtitulo), MARGIN, y, { width: CW, align: 'center', lineBreak: false });
        y += 15;
      }
      y += 8;

      // ── KPI CARDS ────────────────────────────────────────────────────────
      if (hasKpis && rep.filas.length > 0) {
        const GAP     = 10;
        const cardCnt = kpis.length;
        const cardW   = (CW - GAP * (cardCnt - 1)) / cardCnt;
        const cardH   = 56;

        kpis.forEach((kpi, i) => {
          const cx = MARGIN + i * (cardW + GAP);
          doc.roundedRect(cx, y, cardW, cardH, 4).fill(C_CARD_BG);
          doc.rect(cx, y, 3, cardH).fill(C_GOLD);
          doc
            .fontSize(9)
            .fillColor(C_TEXT)
            .font('Helvetica-Bold')
            .text(kpi.label, cx + 10, y + 8, {
              width: cardW - 14,
              lineBreak: false,
              ellipsis: true,
            });
          doc
            .fontSize(kpi.isGold ? 12 : 11)
            .fillColor(kpi.isGold ? '#7a4e0c' : C_TEXT)
            .font('Helvetica-Bold')
            .text(kpi.value, cx + 10, y + 23, {
              width: cardW - 14,
              lineBreak: false,
              ellipsis: true,
            });
        });

        y += KPI_H;
      }

      // ── TABLE ────────────────────────────────────────────────────────────
      y = drawColHeaders(y);

      for (let ri = 0; ri < rep.filas.length; ri++) {
        const rh = computeRowH(rep.filas[ri]);
        if (y + rh > PH - MARGIN - FTR_H) {
          doc.addPage();
          y = MARGIN;
          y = drawColHeaders(y);
        }
        drawDataRow(rep.filas[ri], ri, y, rh);
        y += rh;
      }

      // Totals row
      if (computedTotales) {
        if (y + ROW_H + 8 > PH - MARGIN - FTR_H) {
          doc.addPage();
          y = MARGIN;
        }
        y += 4;
        drawTotalsRow(y);
      }

      // ── FOOTERS — second pass with bufferPages ────────────────────────────
      const range = doc.bufferedPageRange();
      const totalPages = range.count;

      for (let pi = 0; pi < totalPages; pi++) {
        doc.switchToPage(range.start + pi);

        const fy = PH - MARGIN - 14;
        doc
          .moveTo(MARGIN, fy - 7)
          .lineTo(MARGIN + CW, fy - 7)
          .strokeColor(C_GOLD)
          .lineWidth(0.4)
          .stroke();
        doc
          .fontSize(7.5)
          .fillColor(C_MUTED)
          .font('Helvetica')
          .text('Estixa Business', MARGIN, fy, {
            width: CW / 2,
            align: 'left',
            lineBreak: false,
          });
        doc
          .fontSize(7.5)
          .fillColor(C_MUTED)
          .font('Helvetica')
          .text(`Página ${pi + 1} de ${totalPages}`, MARGIN, fy, {
            width: CW,
            align: 'right',
            lineBreak: false,
          });
      }

      doc.flushPages();
      doc.end();
    });
  }

  // ── KPI computation ────────────────────────────────────────────────────────
  private computeKpis(rep: ReporteTabular): KpiItem[] {
    const fmtM = (n: number) =>
      `RD$ ${Number(n).toLocaleString('es-DO', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    const t     = rep.totales ?? {};
    const count = rep.filas.length;
    const tl    = rep.titulo.toLowerCase();

    if (tl.includes('ventas')) {
      const total  = Number(t['total']  ?? 0);
      const itbis  = Number(t['itbis']  ?? 0);
      const ticket = count > 0 ? total / count : 0;
      return [
        { label: 'Ventas Totales',  value: fmtM(total),  isGold: true },
        { label: 'Facturas',        value: String(count) },
        { label: 'ITBIS',            value: fmtM(itbis) },
        { label: 'Ticket Promedio', value: fmtM(ticket) },
      ];
    }

    if (tl.includes('citas') || tl.includes('agenda')) {
      const completadas = rep.filas.filter((f) =>
        /finaliz|complet/i.test(String(f['estado'] ?? '')),
      ).length;
      const pendientes = rep.filas.filter((f) =>
        /pendient/i.test(String(f['estado'] ?? '')),
      ).length;
      return [
        { label: 'Total Citas',  value: String(count) },
        { label: 'Completadas', value: String(completadas) },
        { label: 'Pendientes',  value: String(pendientes) },
      ];
    }

    if (tl.includes('comis')) {
      const total = Number(t['comision'] ?? 0);
      return [
        { label: 'Total Comisiones', value: fmtM(total), isGold: true },
        { label: 'Empleados',        value: String(count) },
      ];
    }

    if (tl.includes('inventario')) {
      const total = Number(t['valorInventario'] ?? 0);
      return [
        { label: 'Valor Inventario', value: fmtM(total), isGold: true },
        { label: 'Productos',        value: String(count) },
      ];
    }

    if (tl.includes('kardex')) {
      return [{ label: 'Movimientos', value: String(count) }];
    }

    if (tl.includes('cobrar')) {
      const total = Number(t['saldo'] ?? 0);
      return [
        { label: 'Total por Cobrar', value: fmtM(total), isGold: true },
        { label: 'Facturas',         value: String(count) },
      ];
    }

    if (tl.includes('caja')) {
      const total = Number(t['entradas'] ?? 0);
      return [
        { label: 'Total Entradas', value: fmtM(total), isGold: true },
        { label: 'Días',           value: String(count) },
      ];
    }

    return [];
  }

  // ── private helpers ────────────────────────────────────────────────────────
  private cell(val: any, tipo?: string): string {
    if (val === null || val === undefined) return '';
    if (tipo === 'dinero') {
      return Number(val).toLocaleString('es-DO', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return String(val);
  }

  private escapeCsv(val: string): string {
    if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
    return val;
  }

  private filename(titulo: string, ext: string): string {
    const slug = titulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const fecha = new Date().toISOString().slice(0, 10);
    return `${slug}_${fecha}.${ext}`;
  }
}
