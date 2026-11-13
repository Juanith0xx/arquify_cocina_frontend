import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calculateKitchenDualQuote, DualQuoteCalculation } from './kitchenB2BPricing';
import { renderArquifyPdfLogo } from './pdfLogo';
import { CabinetType } from '../store/kitchenStore';

export interface B2BPricingPdfOptions {
  projectName?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  projectType?: string;
  cabinets?: CabinetType[];
  screenshotUrl?: string;
  customMarginPercent?: number;
  customAdditionalFee?: number;
}

export function exportKitchenB2BPricingPdf(options: B2BPricingPdfOptions) {
  const {
    projectName = 'Proyecto Mueblería Arquify',
    clientName = 'Cliente Particular',
    clientEmail = '',
    clientPhone = '',
    projectType = 'cocina',
    cabinets,
    screenshotUrl,
    customMarginPercent,
    customAdditionalFee,
  } = options;

  // 1. Calcular cotización dual (B2B Industrial + PVP Cliente + Métricas de Producción)
  const quote: DualQuoteCalculation = calculateKitchenDualQuote(
    customMarginPercent,
    customAdditionalFee,
    cabinets
  );

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

  const formatCLP = (val: number) => `$ ${Math.round(val).toLocaleString('es-CL')}`;

  // ----------------------------------------------------
  // CABECERA SUPERADMIN Y ARQUIFY LOGO
  // ----------------------------------------------------
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 40, 'F');

  renderArquifyPdfLogo(doc, 14, 12, 22);

  doc.setTextColor(248, 250, 252);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('ANÁLISIS DE COSTOS, MARGEN Y COTIZACIÓN INDUSTRIAL B2B', 14, 22);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`PROYECTO: ${projectName.toUpperCase()}`, 14, 28);
  doc.text(`EMISIÓN: ${dateStr.toUpperCase()}  |  REPORTE EXCLUSIVO SUPERADMIN`, 14, 34);

  // Etiqueta Derecha
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(249, 115, 22); // Orange-500
  doc.text('CONFIDENCIAL - ARQUIFY BACKOFFICE', pageWidth - 14, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`TIPO: ${projectType.toUpperCase()}`, pageWidth - 14, 24, { align: 'right' });
  if (clientName) {
    doc.text(`CLIENTE: ${clientName.toUpperCase()}`, pageWidth - 14, 30, { align: 'right' });
  }

  let yPos = 46;

  // ----------------------------------------------------
  // FICHA METADATOS Y CAPTURA 3D (SI EXISTE)
  // ----------------------------------------------------
  if (screenshotUrl) {
    try {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, yPos, pageWidth - 28, 45, 2, 2, 'FD');

      doc.addImage(screenshotUrl, 'PNG', 16, yPos + 3, 62, 39);

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('RESUMEN DE ESPECIFICACIONES TÉCNICAS', 82, yPos + 8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);

      const infoLines = [
        `• Cliente / Mandante: ${clientName}`,
        clientPhone ? `• Teléfono: ${clientPhone}` : null,
        clientEmail ? `• Email: ${clientEmail}` : null,
        `• Módulos a fabricar: ${quote.cabinetsCount} unidades`,
        `• Piezas totales a cortar: ${quote.partsCount} piezas`,
        `• Superficie neta manufacturada: ${quote.netPanelsAreaM2.toFixed(2)} m²`,
        `• Tapacantos totales: ${quote.edgeBandingTotalMeters} metros lineales`,
      ].filter(Boolean) as string[];

      let lineY = yPos + 14;
      infoLines.forEach((line) => {
        doc.text(line, 82, lineY);
        lineY += 4.5;
      });

      yPos += 50;
    } catch (e) {
      console.warn('Error al incluir imagen en PDF de cotización:', e);
    }
  } else {
    // Ficha simple sin imagen
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, yPos, pageWidth - 28, 22, 2, 2, 'FD');

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('DATOS DEL PROYECTO & PARÁMETROS DE PRODUCCIÓN', 18, yPos + 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Cliente: ${clientName} ${clientPhone ? `| Tel: ${clientPhone}` : ''} ${clientEmail ? `| Email: ${clientEmail}` : ''}`, 18, yPos + 13);
    doc.text(`Módulos: ${quote.cabinetsCount} u | Piezas: ${quote.partsCount} u | Área neta: ${quote.netPanelsAreaM2.toFixed(2)} m² | Tapacantos: ${quote.edgeBandingTotalMeters} m`, 18, yPos + 18);

    yPos += 27;
  }

  // ----------------------------------------------------
  // TARJETA DE UTILIDAD Y FINANZAS (COSTO vs VENTA vs MARGEN)
  // ----------------------------------------------------
  doc.setFillColor(238, 242, 255); // indigo-50
  doc.setDrawColor(199, 210, 254); // indigo-200
  doc.roundedRect(14, yPos, pageWidth - 28, 26, 3, 3, 'FD');

  doc.setTextColor(30, 27, 75); // indigo-950
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('RESUMEN FINANCIERO & MARGEN DE UTILIDAD (ARQUIFY B2B vs PVP VENTA)', 18, yPos + 7);

  const colW = (pageWidth - 36) / 3;

  // Col 1: Costo Arquify
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('COSTO DIRECTO ARQUIFY (NETO):', 18, yPos + 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(225, 29, 72); // rose-600
  doc.text(formatCLP(quote.totalB2BNetoClp), 18, yPos + 21);

  // Col 2: Valor Venta PVP
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('VALOR VENTA CLIENTE (NETO PVP):', 18 + colW, yPos + 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(3, 105, 161); // sky-700
  doc.text(formatCLP(quote.totalPvpNetoClp), 18 + colW, yPos + 21);

  // Col 3: Margen de Utilidad
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`MARGEN DE UTILIDAD (${quote.designerMarginPercent}%):`, 18 + colW * 2, yPos + 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(16, 185, 129); // emerald-500
  doc.text(`+${formatCLP(quote.designerProfitClp)}`, 18 + colW * 2, yPos + 21);

  yPos += 32;

  // ----------------------------------------------------
  // TABLA 1: DESGLOSE DETALLADO DE MATERIALES, MANUFACTURA Y HERRAJES
  // ----------------------------------------------------
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('1. DESGLOSE DETALLADO DE COSTOS INDUSTRIALES B2B', 14, yPos);
  yPos += 3;

  const tableRows = quote.b2bItems.map((item) => [
    item.category.toUpperCase(),
    item.name,
    item.detail,
    `${item.qty} ${item.unit}`,
    formatCLP(item.unitCostClp),
    formatCLP(item.totalCostClp),
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Categoría', 'Descripción del Ítem', 'Detalle Técnico / Especificación', 'Cantidad', 'Valor Unit. (CLP)', 'Subtotal (CLP)']],
    body: tableRows,
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 24, fontStyle: 'bold' },
      1: { cellWidth: 45 },
      2: { cellWidth: 50 },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  // Actualizar yPos tras la tabla
  yPos = (doc as any).lastAutoTable.finalY + 8;

  // Verificar si cabe en la página o requiere salto
  if (yPos + 50 > pageHeight) {
    doc.addPage();
    yPos = 18;
  }

  // ----------------------------------------------------
  // SECCIÓN 2: PUNTOS ESPECÍFICOS EXIGIDOS (PLACAS, HERRAJES, PROCESAMIENTO, MÓDULOS, TAPACANTOS)
  // ----------------------------------------------------
  doc.setFillColor(241, 245, 249); // slate-100
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, yPos, pageWidth - 28, 42, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('2. RESUMEN EJECUTIVO DE ÍTEMS CRÍTICOS DE FABRICACIÓN', 18, yPos + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  const summaryItems = [
    {
      label: '• Cantidad de Placas / Tableros (1.83x2.50m):',
      val: `${quote.boardCountEstimated} plancha(s)  —  Total: ${formatCLP(quote.subtotalMaterialsClp)}`,
    },
    {
      label: '• Listado y Subtotal de Quincallería y Herrajes:',
      val: `${quote.b2bItems.filter(i => i.category === 'herrajes').reduce((a, b) => a + b.qty, 0)} unidades  —  Total: ${formatCLP(quote.subtotalHardwareClp)}`,
    },
    {
      label: '• Procesamiento CNC de Material (Área Neta):',
      val: `${quote.netPanelsAreaM2.toFixed(2)} m² a ${formatCLP(quote.manufacturingRatePerM2)}/m²  —  Total: ${formatCLP(quote.subtotalManufacturingClp)}`,
    },
    {
      label: '• Cantidad de Módulos Armados en Taller:',
      val: `${quote.cabinetsCount} módulo(s) ${quote.enablePreAssembly ? `a ${formatCLP(quote.preAssemblyRatePerCabinet)}/u` : '(Sin armado predeterminado)'}  —  Total: ${formatCLP(quote.subtotalPreAssemblyClp)}`,
    },
    {
      label: '• Metros Lineales de Tapacantos PVC:',
      val: `${quote.edgeBandingTotalMeters} metros aplicados con Adhesivo  —  Total: ${formatCLP(quote.subtotalEdgeBandingClp)}`,
    },
  ];

  let sumY = yPos + 13;
  summaryItems.forEach((item) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(item.label, 18, sumY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(item.val, 95, sumY);
    sumY += 5.5;
  });

  yPos += 50;

  if (yPos + 40 > pageHeight) {
    doc.addPage();
    yPos = 18;
  }

  // ----------------------------------------------------
  // TOTALES GENERALES Y PIE DE PÁGINA
  // ----------------------------------------------------
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(14, yPos, pageWidth - 28, 22, 2, 2, 'F');

  doc.setTextColor(248, 250, 252);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);

  doc.text('COSTO TOTAL INDUSTRIAL ARQUIFY (NETO):', 18, yPos + 7);
  doc.text(formatCLP(quote.totalB2BNetoClp), 90, yPos + 7);

  doc.text('IVA 19% COSTO INDUSTRIAL:', 18, yPos + 12);
  doc.text(formatCLP(quote.ivaB2BClp), 90, yPos + 12);

  doc.setTextColor(249, 115, 22);
  doc.setFontSize(10);
  doc.text('COSTO BRUTO TOTAL B2B:', 18, yPos + 18);
  doc.text(formatCLP(quote.totalB2BBrutoClp), 90, yPos + 18);

  // Venta a la derecha
  doc.setTextColor(248, 250, 252);
  doc.setFontSize(8.5);
  doc.text('PRECIO VENTA CLIENTE (NETO PVP):', 130, yPos + 7);
  doc.text(formatCLP(quote.totalPvpNetoClp), 180, yPos + 7, { align: 'right' });

  doc.text('MARGEN UTILIDAD ESTIMADO:', 130, yPos + 12);
  doc.setTextColor(52, 211, 153);
  doc.text(`${formatCLP(quote.designerProfitClp)} (${quote.designerMarginPercent}%)`, 180, yPos + 12, { align: 'right' });

  doc.setTextColor(248, 250, 252);
  doc.text('TOTAL BRUTO PVP CLIENTE:', 130, yPos + 18);
  doc.text(formatCLP(quote.totalPvpBrutoClp), 180, yPos + 18, { align: 'right' });

  // Pie de página en todas las páginas
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Arquify Backoffice Cloud Platform  |  Página ${i} de ${pageCount}  |  Calculado automáticamente según tarifa industrial vigente`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  // Guardar / Descargar PDF
  const cleanName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  doc.save(`cotizacion_b2b_detalle_${cleanName}.pdf`);
}
