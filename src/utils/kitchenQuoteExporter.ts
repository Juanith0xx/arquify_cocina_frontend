import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx-js-style';
import { DualQuoteCalculation } from './kitchenB2BPricing';

export interface QuoteExportMetadata {
  clientName: string;
  projectAddress: string;
  projectName: string;
  designerName: string;
  designerEmail: string;
  designerPhone: string;
  validityDays: number;
}

export function exportClientQuotePdf(
  quote: DualQuoteCalculation,
  metadata: QuoteExportMetadata
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const dateStr = new Date().toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // 1. Cabecera Corporativa y Elegante
  doc.setFillColor(24, 24, 27); // Zinc 900
  doc.rect(0, 0, pageWidth, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('COTIZACIÓN COMERCIAL DE MOBILIARIO', 14, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(212, 212, 216);
  doc.text(`PROYECTO: ${metadata.projectName.toUpperCase()}`, 14, 26);
  doc.text(`FECHA DE EMISIÓN: ${dateStr.toUpperCase()}  |  VALIDEZ: ${metadata.validityDays} DÍAS`, 14, 32);

  // Datos del Diseñador / Estudio (Derecha)
  doc.setFontSize(8);
  doc.setTextColor(245, 158, 11); // Amber
  doc.text('ESTUDIO DE DISEÑO & ARQUITECTURA', pageWidth - 14, 16, { align: 'right' });
  doc.setTextColor(255, 255, 255);
  doc.text(metadata.designerName || 'Estudio Profesional B2B', pageWidth - 14, 22, { align: 'right' });
  doc.setTextColor(161, 161, 170);
  if (metadata.designerEmail) doc.text(metadata.designerEmail, pageWidth - 14, 27, { align: 'right' });
  if (metadata.designerPhone) doc.text(metadata.designerPhone, pageWidth - 14, 32, { align: 'right' });

  // 2. Ficha del Cliente y Obra
  let y = 50;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, pageWidth - 28, 24, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text('INFORMACIÓN DEL MANDANTE / CLIENTE', 18, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Cliente: ${metadata.clientName || 'Cliente Particular'}`, 18, y + 14);
  doc.text(`Ubicación / Obra: ${metadata.projectAddress || 'Región Metropolitana, Chile'}`, 18, y + 19);

  doc.text(`Módulos Proyectados: ${quote.cabinetsCount} muebles`, pageWidth / 2 + 10, y + 14);
  doc.text(`Área de Panelería: ${quote.netPanelsAreaM2.toFixed(1)} m² de paneles`, pageWidth / 2 + 10, y + 19);

  // 3. Tabla de Partidas Comerciales (PVP)
  y += 32;

  const tableData = quote.clientItems.map((item, idx) => [
    `0${idx + 1}`,
    item.title,
    item.description,
    `$${item.totalClp.toLocaleString('es-CL')} CLP`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['ITEM', 'PARTIDA', 'ESPECIFICACIÓN TÉCNICA', 'TOTAL NETO']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [39, 39, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
      cellPadding: 4,
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 48, fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  // 4. Resumen de Totales
  const finalY = (doc as any).lastAutoTable.finalY + 8;

  const summaryX = pageWidth - 90;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(summaryX, finalY, 76, 36, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('SUBTOTAL NETO:', summaryX + 6, finalY + 9);
  doc.text(`$${quote.totalPvpNetoClp.toLocaleString('es-CL')}`, pageWidth - 18, finalY + 9, { align: 'right' });

  doc.text('I.V.A. (19%):', summaryX + 6, finalY + 17);
  doc.text(`$${quote.ivaPvpClp.toLocaleString('es-CL')}`, pageWidth - 18, finalY + 17, { align: 'right' });

  doc.setDrawColor(226, 232, 240);
  doc.line(summaryX + 6, finalY + 22, pageWidth - 18, finalY + 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(234, 88, 12); // Orange
  doc.text('TOTAL PRESUPUESTO:', summaryX + 6, finalY + 30);
  doc.text(`$${quote.totalPvpBrutoClp.toLocaleString('es-CL')} CLP`, pageWidth - 18, finalY + 30, { align: 'right' });

  // 5. Condiciones Comerciales
  const termsY = finalY + 44;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('CONDICIONES COMERCIALES & FORMA DE PAGO:', 14, termsY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const terms = [
    '• Anticipo del 50% al momento de la firma y aprobación de planos definitivos de fabricación.',
    '• 40% contra aviso de despacho de mobiliario pre-ensamblado en fábrica.',
    '• 10% saldo restante contra entrega final e instalación conforme en obra.',
    '• Plazo estimado de fabricación: 15 a 20 días hábiles a partir de la confirmación técnica.',
  ];

  terms.forEach((t, i) => {
    doc.text(t, 14, termsY + 6 + (i * 4.5));
  });

  // Pie de Página
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Generado a través de MuebleStudio B2B Architecture Platform', 14, pageHeight - 10);
  doc.text(`Página 1 de 1`, pageWidth - 14, pageHeight - 10, { align: 'right' });

  doc.save(`Cotizacion_${metadata.projectName.replace(/\s+/g, '_')}_PVP.pdf`);
}

function applyB2BQuoteStyles(ws: any, sheetType: 'b2b' | 'pvp') {
  if (!ws || !ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  const totalCols = range.e.c;
  const totalRows = range.e.r;

  const colWidths = sheetType === 'b2b' ? [20, 38, 42, 12, 14, 18, 20] : [10, 32, 58, 22];
  ws['!cols'] = colWidths.map((w) => ({ wch: w }));

  const thinBorder = {
    top: { style: 'thin', color: { rgb: 'E2E8F0' } },
    bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
    left: { style: 'thin', color: { rgb: 'E2E8F0' } },
    right: { style: 'thin', color: { rgb: 'E2E8F0' } },
  };

  for (let R = 0; R <= totalRows; ++R) {
    for (let C = 0; C <= totalCols; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ c: C, r: R });
      if (!ws[cellAddress]) {
        ws[cellAddress] = { v: '', t: 's' };
      }
      const cell = ws[cellAddress];
      const valStr = String(cell.v ?? '');

      if (R === 0) {
        cell.s = {
          fill: { patternType: 'solid', fgColor: { rgb: sheetType === 'b2b' ? '1E293B' : '065F46' } },
          font: { name: 'Calibri', bold: true, size: 12, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'left', vertical: 'center' },
        };
      } else if (sheetType === 'b2b') {
        if (R === 6 || R === 13) {
          cell.s = {
            fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
            font: { name: 'Calibri', bold: true, size: 10.5, color: { rgb: '0F172A' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: {
              top: { style: 'medium', color: { rgb: 'CBD5E1' } },
              bottom: { style: 'medium', color: { rgb: 'CBD5E1' } },
            },
          };
        } else if (R >= 1 && R <= 4) {
          if (C === 0) {
            cell.s = {
              fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } },
              font: { name: 'Calibri', bold: true, size: 10, color: { rgb: '475569' } },
              alignment: { horizontal: 'left', vertical: 'center' },
              border: thinBorder,
            };
          } else if (C === 1) {
            cell.s = {
              fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
              font: { name: 'Calibri', bold: true, size: 10, color: { rgb: '0F172A' } },
              alignment: { horizontal: 'left', vertical: 'center' },
              border: thinBorder,
            };
          }
        } else if (R >= 7 && R <= 11) {
          if (C === 0) {
            cell.s = {
              fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } },
              font: { name: 'Calibri', bold: true, size: 9.5, color: { rgb: '334155' } },
              alignment: { horizontal: 'left', vertical: 'center' },
              border: thinBorder,
            };
          } else if (C === 1) {
            cell.s = {
              fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
              font: { name: 'Calibri', bold: true, size: 9.5, color: { rgb: '0F172A' } },
              alignment: { horizontal: 'left', vertical: 'center' },
              border: thinBorder,
            };
          }
        } else if (R === 14) {
          cell.s = {
            fill: { patternType: 'solid', fgColor: { rgb: 'F97316' } },
            font: { name: 'Calibri', bold: true, size: 10, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
              top: { style: 'medium', color: { rgb: 'EA580C' } },
              bottom: { style: 'medium', color: { rgb: 'EA580C' } },
              left: { style: 'thin', color: { rgb: 'FDBA74' } },
              right: { style: 'thin', color: { rgb: 'FDBA74' } },
            },
          };
        } else if (valStr.includes('SUBTOTAL B2B NETO') || valStr.includes('I.V.A.') || valStr.includes('TOTAL COSTO B2B')) {
          const isTotal = valStr.includes('TOTAL COSTO B2B');
          cell.s = {
            fill: { patternType: 'solid', fgColor: { rgb: isTotal ? 'FEF3C7' : 'F8FAFC' } },
            font: { name: 'Calibri', bold: true, size: isTotal ? 11 : 10, color: { rgb: isTotal ? 'B45309' : '1E293B' } },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: {
              top: { style: isTotal ? 'medium' : 'thin', color: { rgb: 'F59E0B' } },
              bottom: { style: isTotal ? 'double' : 'thin', color: { rgb: 'B45309' } },
              left: { style: 'thin', color: { rgb: 'E2E8F0' } },
              right: { style: 'thin', color: { rgb: 'E2E8F0' } },
            },
          };
        } else if (R > 14) {
          const isNum = typeof cell.v === 'number';
          const align = C === 0 || C === 3 || C === 4 ? 'center' : (C >= 5 || isNum ? 'right' : 'left');
          cell.s = {
            fill: { patternType: 'solid', fgColor: { rgb: R % 2 === 0 ? 'FAFAFA' : 'FFFFFF' } },
            font: { name: 'Calibri', size: 9.5, color: { rgb: '0F172A' }, bold: C === 6 },
            alignment: { horizontal: align, vertical: 'center' },
            border: thinBorder,
          };
          if (typeof cell.v === 'number' && C >= 5) {
            cell.z = '$#,##0';
          }
        }
      } else if (sheetType === 'pvp') {
        if (R >= 1 && R <= 5) {
          if (C === 0) {
            cell.s = {
              fill: { patternType: 'solid', fgColor: { rgb: 'ECFDF5' } },
              font: { name: 'Calibri', bold: true, size: 10, color: { rgb: '047857' } },
              alignment: { horizontal: 'left', vertical: 'center' },
              border: thinBorder,
            };
          } else {
            cell.s = {
              fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
              font: { name: 'Calibri', bold: true, size: 10, color: { rgb: '0F172A' } },
              alignment: { horizontal: 'left', vertical: 'center' },
              border: thinBorder,
            };
          }
        } else if (R === 7) {
          cell.s = {
            fill: { patternType: 'solid', fgColor: { rgb: '10B981' } },
            font: { name: 'Calibri', bold: true, size: 10, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
              top: { style: 'medium', color: { rgb: '047857' } },
              bottom: { style: 'medium', color: { rgb: '047857' } },
            },
          };
        } else if (valStr.includes('SUBTOTAL NETO') || valStr.includes('I.V.A.') || valStr.includes('TOTAL PRESUPUESTO') || valStr.includes('UTILIDAD BRUTA')) {
          const isTotal = valStr.includes('TOTAL PRESUPUESTO');
          const isProfit = valStr.includes('UTILIDAD BRUTA');
          cell.s = {
            fill: { patternType: 'solid', fgColor: { rgb: isTotal ? 'D1FAE5' : (isProfit ? 'FEF3C7' : 'F8FAFC') } },
            font: { name: 'Calibri', bold: true, size: isTotal ? 11 : 10, color: { rgb: isTotal ? '047857' : (isProfit ? 'B45309' : '1E293B') } },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: {
              top: { style: isTotal ? 'medium' : 'thin', color: { rgb: '10B981' } },
              bottom: { style: isTotal ? 'double' : 'thin', color: { rgb: '047857' } },
              left: { style: 'thin', color: { rgb: 'E2E8F0' } },
              right: { style: 'thin', color: { rgb: 'E2E8F0' } },
            },
          };
        } else if (R > 7) {
          const isNum = typeof cell.v === 'number';
          const align = C === 0 ? 'center' : (C === 3 || isNum ? 'right' : 'left');
          cell.s = {
            fill: { patternType: 'solid', fgColor: { rgb: R % 2 === 0 ? 'F8FAFC' : 'FFFFFF' } },
            font: { name: 'Calibri', size: 9.5, color: { rgb: '0F172A' }, bold: C === 3 },
            alignment: { horizontal: align, vertical: 'center' },
            border: thinBorder,
          };
          if (typeof cell.v === 'number' && C === 3) {
            cell.z = '$#,##0';
          }
        }
      }
    }
  }
}

export function exportB2BQuoteExcel(
  quote: DualQuoteCalculation,
  metadata: QuoteExportMetadata
) {
  const wb = XLSX.utils.book_new();

  // Hoja 1: Pedido B2B a Fábrica
  const dataB2B: any[] = [
    ['ORDEN DE COMPRA & COTIZACIÓN B2B - FÁBRICA DE MOBILIARIO'],
    ['PROYECTO:', metadata.projectName],
    ['PROFESIONAL / ARQUITECTO:', metadata.designerName],
    ['EMAIL:', metadata.designerEmail],
    ['FECHA:', new Date().toLocaleDateString('es-CL')],
    [],
    ['MÉTRICAS INDUSTRIALES:'],
    ['Módulos Totales:', quote.cabinetsCount],
    ['Piezas de Producción:', quote.partsCount],
    ['Paneles Netos a Procesar (sin mermas):', `${quote.netPanelsAreaM2.toFixed(2)} m²`],
    ['Tarifa de Manufactura:', `$${quote.manufacturingRatePerM2.toLocaleString('es-CL')} CLP / m²`],
    ['Metros Totales de Canto:', `${quote.edgeBandingTotalMeters} m`],
    [],
    ['DESGLOSE DETALLADO DE COSTOS B2B (CONFIDENCIAL FÁBRICA):'],
    ['Categoría', 'Concepto', 'Detalle Técnico', 'Cantidad', 'Unidad', 'Costo Unit. CLP', 'Subtotal CLP'],
  ];

  quote.b2bItems.forEach((item) => {
    dataB2B.push([
      item.category.toUpperCase(),
      item.name,
      item.detail,
      item.qty,
      item.unit,
      item.unitCostClp,
      item.totalCostClp,
    ]);
  });

  dataB2B.push(
    [],
    ['', '', '', '', '', 'SUBTOTAL B2B NETO:', quote.totalB2BNetoClp],
    ['', '', '', '', '', 'I.V.A. (19%):', quote.ivaB2BClp],
    ['', '', '', '', '', 'TOTAL COSTO B2B CLP:', quote.totalB2BBrutoClp]
  );

  const wsB2B = XLSX.utils.aoa_to_sheet(dataB2B);
  applyB2BQuoteStyles(wsB2B, 'b2b');
  XLSX.utils.book_append_sheet(wb, wsB2B, 'Pedido B2B Fábrica');

  // Hoja 2: Cotización Cliente Final (PVP)
  const dataPVP: any[] = [
    ['PRESUPUESTO CLIENTE FINAL (PVP)'],
    ['CLIENTE:', metadata.clientName],
    ['OBRA / DIRECCIÓN:', metadata.projectAddress],
    ['PROYECTO:', metadata.projectName],
    ['ARQUITECTO / DISEÑADOR:', metadata.designerName],
    ['MARGEN COMERCIAL APLICADO:', `${quote.designerMarginPercent}%`],
    [],
    ['Ítem', 'Partida Comercial', 'Descripción', 'Total Neto CLP'],
  ];

  quote.clientItems.forEach((it, idx) => {
    dataPVP.push([
      idx + 1,
      it.title,
      it.description,
      it.totalClp,
    ]);
  });

  dataPVP.push(
    [],
    ['', '', 'SUBTOTAL NETO:', quote.totalPvpNetoClp],
    ['', '', 'I.V.A. (19%):', quote.ivaPvpClp],
    ['', '', 'TOTAL PRESUPUESTO CLP:', quote.totalPvpBrutoClp],
    [],
    ['', '', 'UTILIDAD BRUTA PROFESIONAL:', quote.designerProfitClp]
  );

  const wsPVP = XLSX.utils.aoa_to_sheet(dataPVP);
  applyB2BQuoteStyles(wsPVP, 'pvp');
  XLSX.utils.book_append_sheet(wb, wsPVP, 'Cotización Cliente (PVP)');

  XLSX.writeFile(wb, `Cotizacion_Dual_${metadata.projectName.replace(/\s+/g, '_')}.xlsx`);
}
