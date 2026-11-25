import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { CabinetType, useKitchenStore } from '../store/kitchenStore';
import { generateKitchenPartsList } from './kitchenManufacturing';
import { calculateCncMachiningForPart, CncMachinedPart } from './kitchenCncMachining';
import { renderArquifyPdfLogo } from './pdfLogo';
import { getFriendlyColorName } from './colorNames';
import { resolveAssemblyPartKey } from './assemblyPartMapper';
import { saveAssemblySnapshot, buildAssemblyViewerUrl } from './assemblySnapshotService';

export async function exportKitchenLabelsPDF(
  cabinets: CabinetType[],
  state: any,
  filename = 'etiquetas_produccion_cnc_cocina.pdf'
): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const dateStr = new Date().toLocaleDateString('es-CL');

  const realCabinets = cabinets.filter(c => c.type !== 'decoration' && !c.variant?.startsWith('deco_'));
  const allParts = generateKitchenPartsList(cabinets);
  const hardwareBrand = (state.drawerHardware === 'Hafele' ? 'Hafele' : 'Provelcar') as 'Hafele' | 'Provelcar';
  const assemblyType = (state.assemblyType === 'minifix' ? 'minifix' : 'spax') as 'minifix' | 'spax';
  const golaSystem = (state.golaSystem || 'none') as 'none' | 'aluminum' | 'black';

  // Desglosar partes individuales (respetando cantidad) junto a su identificador 3D de armado
  const individualMachinedParts: Array<CncMachinedPart & { moduleId: string; assemblyPartKey: string }> = [];

  allParts.forEach((part) => {
    const cab = realCabinets.find(c => c.id === part.moduleId);
    const cncPart = calculateCncMachiningForPart(part, cab, hardwareBrand, assemblyType, golaSystem, state.handleConfig);

    for (let q = 1; q <= part.qty; q++) {
      const partCopy = {
        ...cncPart,
        partCode: part.qty > 1 ? `${cncPart.partCode}#${q}` : cncPart.partCode,
        material: getFriendlyColorName(part.material, state.customTextures),
        moduleId: part.moduleId || '',
        assemblyPartKey: resolveAssemblyPartKey(part, q),
      };
      individualMachinedParts.push(partCopy);
    }
  });

  if (individualMachinedParts.length === 0) {
    alert('No hay piezas de producción disponibles en el proyecto.');
    return;
  }

  // Guardar snapshot de solo lectura para el visor 3D de armado (escaneable desde celular)
  const kitchenState = useKitchenStore.getState();
  const snapshotInfo = await saveAssemblySnapshot(kitchenState, state);

  // Pre-generar ambos códigos QR en paralelo:
  // 1) QR CNC (mismo payload JSON intacto para máquina CNC)
  // 2) QR 3D ARMADO (URL de solo lectura con el proyecto en Rayos X y esta pieza destacada)
  const qrPromises = individualMachinedParts.map(async (part) => {
    const payload = JSON.stringify({
      c: part.partCode,
      n: part.partName,
      m: part.moduleName,
      d: `${part.length}x${part.width}x${part.thickness}`,
      mat: part.material,
      e: `L1:${part.edgeThicknessL1},L2:${part.edgeThicknessL2},W1:${part.edgeThicknessW1},W2:${part.edgeThicknessW2}`,
      hw: hardwareBrand
    });
    const assemblyUrl = buildAssemblyViewerUrl(
      snapshotInfo.baseUrl,
      snapshotInfo.id,
      part.moduleId,
      part.assemblyPartKey,
      part.partCode
    );
    try {
      const [cncQr, assemblyQr] = await Promise.all([
        QRCode.toDataURL(payload, {
          width: 140,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' }
        }),
        QRCode.toDataURL(assemblyUrl, {
          width: 140,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#0f172a', light: '#ffffff' }
        })
      ]);
      return { cncQr, assemblyQr };
    } catch {
      return { cncQr: null, assemblyQr: null };
    }
  });

  const qrDataUrls = await Promise.all(qrPromises);

  // Layout en lámina A4 (2 columnas x 4 filas = 8 etiquetas por página)
  // Dimensiones de hoja A4: 210 x 297 mm
  const marginX = 10;
  const marginY = 10;
  const colWidth = 92;
  const rowHeight = 65;
  const gapX = 6;
  const gapY = 5;
  const labelsPerPage = 8;

  const totalPages = Math.ceil(individualMachinedParts.length / labelsPerPage);

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) {
      doc.addPage();
    }

    const startIndex = page * labelsPerPage;
    const pageParts = individualMachinedParts.slice(startIndex, startIndex + labelsPerPage);

    pageParts.forEach((part, indexInPage) => {
      const globalIndex = startIndex + indexInPage;
      const col = indexInPage % 2;
      const row = Math.floor(indexInPage / 2);

      const x = marginX + col * (colWidth + gapX);
      const y = marginY + row * (rowHeight + gapY);

      // Marco de la Etiqueta Adhesiva
      doc.setDrawColor(203, 213, 225); // slate-300
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y, colWidth, rowHeight, 2.5, 2.5, 'FD');

      // Franja superior de encabezado
      doc.setFillColor(248, 250, 252); // slate-50
      doc.roundedRect(x, y, colWidth, 12, 2.5, 2.5, 'F');
      doc.rect(x, y + 9.5, colWidth, 2.5, 'F'); // tapar redondeo inferior
      doc.setDrawColor(226, 232, 240);
      doc.line(x, y + 12, x + colWidth, y + 12);

      // Logo arquify
      renderArquifyPdfLogo(doc, x + 3, y + 7.5, 11);

      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('TALLER CNC / INDUSTRIA 4.0', x + 25, y + 7.5);

      // Tag de Identificación en pastilla destacada
      doc.setFillColor(15, 23, 42); // slate-900
      doc.roundedRect(x + colWidth - 28, y + 2, 25, 7.5, 1.5, 1.5, 'F');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(part.partCode, x + colWidth - 15.5, y + 7, { align: 'center' });

      // Nombre de la Pieza
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      const truncatedName = part.partName.length > 26 ? part.partName.substring(0, 24) + '...' : part.partName;
      doc.text(truncatedName, x + 3.5, y + 16.5);

      // Módulo Padre
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const truncatedModule = part.moduleName.length > 30 ? part.moduleName.substring(0, 28) + '...' : part.moduleName;
      doc.text(`Módulo: ${truncatedModule}`, x + 3.5, y + 20.2);

      // Dimensiones de Corte (Largo x Ancho x Espesor) en recuadro destacado
      doc.setFillColor(254, 243, 199); // amber-100
      doc.setDrawColor(245, 158, 11); // amber-500
      doc.roundedRect(x + 3.5, y + 22.2, 45.5, 10.5, 1.5, 1.5, 'FD');

      doc.setFontSize(7.6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 83, 9);
      doc.text(`${part.length} × ${part.width} × ${part.thickness} mm`, x + 5.5, y + 26.8);

      // Sentido de Veta
      doc.setFontSize(5.8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 53, 15);
      doc.text(part.grainDirection === 'vertical' ? '↕ Veta Vertical' : '↔ Veta Horizontal', x + 5.5, y + 31);

      // Material y Color
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text(`Material: ${part.material.substring(0, 23)}`, x + 3.5, y + 36.5);

      // Herrajes & Mecanizado
      doc.setFontSize(5.8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const hwLabel = hardwareBrand === 'Hafele' ? 'Häfele Matrix S32' : 'Provelcar S32';
      doc.text(`Herrajes: ${hwLabel} • ${assemblyType === 'minifix' ? 'Minifix' : 'Spax'}`, x + 3.5, y + 40.2);

      // DIAGRAMA 2D DE TAPACANTOS (Mini esquema interactivo del panel)
      const diagX = x + 4;
      const diagY = y + 45;
      const diagW = 32;
      const diagH = 15;

      // Base del panel
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(148, 163, 184);
      doc.rect(diagX, diagY, diagW, diagH, 'FD');

      // Borde Superior W1
      if (part.edgeW1) {
        doc.setDrawColor(part.edgeThicknessW1 >= 1.5 ? 225 : 249, part.edgeThicknessW1 >= 1.5 ? 29 : 115, part.edgeThicknessW1 >= 1.5 ? 72 : 22);
        doc.setLineWidth(1.2);
        doc.line(diagX, diagY, diagX + diagW, diagY);
      } else {
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);
        doc.line(diagX, diagY, diagX + diagW, diagY);
      }

      // Borde Inferior W2
      if (part.edgeW2) {
        doc.setDrawColor(part.edgeThicknessW2 >= 1.5 ? 225 : 249, part.edgeThicknessW2 >= 1.5 ? 29 : 115, part.edgeThicknessW2 >= 1.5 ? 72 : 22);
        doc.setLineWidth(1.2);
        doc.line(diagX, diagY + diagH, diagX + diagW, diagY + diagH);
      } else {
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);
        doc.line(diagX, diagY + diagH, diagX + diagW, diagY + diagH);
      }

      // Borde Izquierdo L1
      if (part.edgeL1) {
        doc.setDrawColor(part.edgeThicknessL1 >= 1.5 ? 225 : 249, part.edgeThicknessL1 >= 1.5 ? 29 : 115, part.edgeThicknessL1 >= 1.5 ? 72 : 22);
        doc.setLineWidth(1.2);
        doc.line(diagX, diagY, diagX, diagY + diagH);
      } else {
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);
        doc.line(diagX, diagY, diagX, diagY + diagH);
      }

      // Borde Derecho L2
      if (part.edgeL2) {
        doc.setDrawColor(part.edgeThicknessL2 >= 1.5 ? 225 : 249, part.edgeThicknessL2 >= 1.5 ? 29 : 115, part.edgeThicknessL2 >= 1.5 ? 72 : 22);
        doc.setLineWidth(1.2);
        doc.line(diagX + diagW, diagY, diagX + diagW, diagY + diagH);
      } else {
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);
        doc.line(diagX + diagW, diagY, diagX + diagW, diagY + diagH);
      }

      doc.setLineWidth(0.2); // reset

      // Texto de Cantos
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`L1: ${part.edgeL1 ? `${part.edgeThicknessL1}mm` : '-'} | L2: ${part.edgeL2 ? `${part.edgeThicknessL2}mm` : '-'}`, diagX + 35, diagY + 4.5);
      doc.text(`W1: ${part.edgeW1 ? `${part.edgeThicknessW1}mm` : '-'} | W2: ${part.edgeW2 ? `${part.edgeThicknessW2}mm` : '-'}`, diagX + 35, diagY + 8.8);
      doc.text(`Mecanizados: ${part.drills.length} perf. | ${part.grooves.length} ran.`, diagX + 35, diagY + 13.2);

      // DOBLE CÓDIGO QR: (1) CNC / CORTE y (2) VISOR 3D ARMADO (Rayos X)
      const qrPair = qrDataUrls[globalIndex];
      const qrSize = 17.5;
      const qrBoxW = 19;
      const qrBoxH = 24.5;
      const qrBoxY = y + 14;

      if (qrPair?.cncQr) {
        const qr1BoxX = x + 50.5;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(203, 213, 225); // slate-300
        doc.setLineWidth(0.3);
        doc.roundedRect(qr1BoxX, qrBoxY, qrBoxW, qrBoxH, 1.5, 1.5, 'FD');

        doc.addImage(qrPair.cncQr, 'PNG', qr1BoxX + (qrBoxW - qrSize) / 2, qrBoxY + 1, qrSize, qrSize);

        // Etiqueta inferior CNC
        doc.setFillColor(15, 23, 42); // slate-900
        doc.roundedRect(qr1BoxX + 1, qrBoxY + qrSize + 1.8, qrBoxW - 2, 4, 0.8, 0.8, 'F');
        doc.setFontSize(4.7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('CNC / CORTE', qr1BoxX + qrBoxW / 2, qrBoxY + qrSize + 4.6, { align: 'center' });
      }

      if (qrPair?.assemblyQr) {
        const qr2BoxX = x + 70.8;
        doc.setFillColor(255, 247, 237); // orange-50
        doc.setDrawColor(249, 115, 22); // orange-500 (marca Arquify)
        doc.setLineWidth(0.45);
        doc.roundedRect(qr2BoxX, qrBoxY, qrBoxW, qrBoxH, 1.5, 1.5, 'FD');
        doc.setLineWidth(0.2);

        doc.addImage(qrPair.assemblyQr, 'PNG', qr2BoxX + (qrBoxW - qrSize) / 2, qrBoxY + 1, qrSize, qrSize);

        // Etiqueta inferior 3D ARMADO
        doc.setFillColor(234, 88, 12); // orange-600
        doc.roundedRect(qr2BoxX + 1, qrBoxY + qrSize + 1.8, qrBoxW - 2, 4, 0.8, 0.8, 'F');
        doc.setFontSize(4.7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('3D ARMADO', qr2BoxX + qrBoxW / 2, qrBoxY + qrSize + 4.6, { align: 'center' });
      }

      // Pie de Etiqueta
      doc.setFontSize(5.2);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(`OT-${dateStr.replace(/\//g, '')} • Pieza ${globalIndex + 1}/${individualMachinedParts.length}`, x + 3.5, y + rowHeight - 2);
    });

    // Pie de página general de la hoja
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`ARQUIFY CAD/CAM 4.0 • ETIQUETAS DE CORTE Y MECANIZADO CNC • HOJA ${page + 1} DE ${totalPages}`, marginX, 290);
  }

  doc.save(filename);
}
