import { CabinetType, getCabinetLabel } from '../store/kitchenStore';
import { getFriendlyColorName } from './colorNames';
import { FINISH_LABELS, HandleFinish } from '../types/handle';
import { QSTONE_SINKS, FDV_COOKTOPS, QstoneProductItem } from '../types/countertop';

export interface DetailedCabinetItem {
  index: number;
  id: string;
  category: 'base' | 'wall' | 'tall' | 'island' | 'decoration' | 'closet';
  categoryLabel: string;
  label: string;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  positionCm: { x: number; y: number; z: number };
  rotationDeg: number;
  frontType: 'doors' | 'drawers' | 'open_niche' | 'appliance' | 'special';
  doorsCount: number;
  doorStyle: string;
  drawersCount: number;
  drawerStyle: string;
  shelvesCount: number;
  isOpenNiche: boolean;
  nicheDescription?: string;
  frontColorName: string;
  frontColorHex: string;
  structureColorName: string;
  handleStyle: string;
  leftCoverPanel: boolean;
  rightCoverPanel: boolean;
  hingeOrientation?: string;
  summarySentence: string;
}

export interface DetailedBimManifest {
  totalModulesCount: number;
  breakdown: {
    baseCount: number;
    wallCount: number;
    tallCount: number;
    islandCount: number;
    decoCount: number;
    closetCount: number;
  };
  hasIsland: boolean;
  islandDirectives: {
    allowed: boolean;
    description: string;
  };
  countertop: {
    materialName: string;
    productName: string;
    finish: string;
    colorHex: string;
    thicknessMm: number;
    regruesoCm: number;
    backsplashHeightCm: number;
    hasWaterfallLeft: boolean;
    hasWaterfallRight: boolean;
    sink: {
      hasSink: boolean;
      name: string;
      bowls: number;
      installation: string;
    };
    cooktop: {
      hasCooktop: boolean;
      name: string;
      burners: number;
      fuelType: string;
    };
    description: string;
  };
  socle: {
    hasClosedSocle: boolean;
    heightCm: number;
    finishName: string;
    directive: string;
  };
  hardwareSummary: string;
  finishSummary: {
    primaryFrontColor: string;
    primaryFrontHex: string;
    woodToneDetails: string;
    wallColor: string;
    floorDescription: string;
  };
  cabinetsList: DetailedCabinetItem[];
  architecturalElements: Array<{
    type: string;
    name: string;
    widthCm: number;
    heightCm: number;
    positionCm: { x: number; y: number; z: number };
  }>;
  strictNegativeDirectives: string[];
  rawTextPromptSpec: string;
  // Campos de compatibilidad con versiones previas
  cabinetFronts: string;
  islandFronts: string | null;
  woodToneDetails: string;
  moduleArchitecture: string;
  hardware: string;
  flooring: string;
  wallFinish: string;
  socleDirective: string;
}

/**
 * Inspecciona exhaustivamente el estado de la cocina en kitchenStore
 * y construye un manifiesto BIM de fidelidad milimétrica para NanoBanana.
 */
export function extractDetailedKitchenBimManifest(kitchenState: any): DetailedBimManifest | null {
  if (!kitchenState || !kitchenState.cabinets || kitchenState.cabinets.length === 0) {
    return null;
  }

  const {
    cabinets = [],
    countertopConfig,
    qstoneCatalog = [],
    handleConfig,
    floorType,
    wallColor,
    showSocle,
    socleFinish,
    socleHeight = 10,
    golaSystem = 'none',
    architecturalElements = [],
  } = kitchenState;

  // 1. Detección de acabados generales
  const wallOrBaseCab = cabinets.find((c: CabinetType) => c.type !== 'island') || cabinets[0];
  const primaryFrontHex = wallOrBaseCab?.doorColor || wallOrBaseCab?.drawerFrontColor || wallOrBaseCab?.color || '#D4A373';
  const primaryFrontColor = getFriendlyColorName(primaryFrontHex);

  const isLightWood =
    primaryFrontHex.includes('light-wood-grain') ||
    primaryFrontHex.toLowerCase().includes('roble') ||
    primaryFrontColor.toLowerCase().includes('roble') ||
    primaryFrontHex === '#D4A373' ||
    primaryFrontHex === '#dfc7a5' ||
    primaryFrontHex === '#d6ba94';

  const woodToneDetails = isLightWood
    ? 'Roble Nórdico Claro / Rubio Escandinavo (#dfc7a5 / #d6ba94). Tono arena cálido muy claro y luminoso, veta lineal sutil, CERO nudos negros, PROHIBIDO nogal oscuro o castaño rústico.'
    : `${primaryFrontColor} (${primaryFrontHex})`;

  // 2. Hardware / Tiradores / Gola
  const rawFinish = handleConfig?.finish as HandleFinish | undefined;
  const finishLabel = rawFinish && FINISH_LABELS[rawFinish] ? FINISH_LABELS[rawFinish] : 'Negro Mate';
  const isGola = handleConfig?.model === 'none' || golaSystem !== 'none';
  const hardwareSummary = isGola
    ? `Sistema Riel Gola integrado ${golaSystem === 'black' ? 'Negro Mate' : 'Aluminio Natural'} (frentes continuos sin tiradores superficiales)`
    : `Tiradores metálicos tipo perfil/asa en acabado ${finishLabel}`;

  // 3. Soporte inferior / Zócalo
  const socleColorName =
    socleFinish === 'black' ? 'NEGRO MATE' : socleFinish === 'grey_satin' ? 'ALUMINIO GRIS SATINADO' : 'Aluminio gris satinado';
  const socleDirective = showSocle
    ? `ZÓCALO CONTINUO CERRADO HERMÉTICO de ${socleHeight} cm en acabado ${socleColorName} que sella completamente la base de los muebles contra el suelo. ESTRICTAMENTE PROHIBIDO DIBUJAR PATAS NEGRAS, POSTES O SALIENTES METÁLICAS DEBAJO O POR FUERA DEL ZÓCALO. Toda la base es un zócalo sólido continuo sellado al piso.`
    : 'MUEBLES MONTADOS SOBRE PATAS CILÍNDRICAS INDIVIDUALES NEGRAS con espacio abierto/luz libre hacia el suelo. NO colocar zócalo cerrado ni bajar paneles laterales al suelo.';

  // 4. Cubiertas / Countertop
  const currentCountertopItem: QstoneProductItem | undefined = qstoneCatalog.find(
    (item: QstoneProductItem) => item.id === countertopConfig?.selectedProductId
  );
  const stoneName = currentCountertopItem ? currentCountertopItem.name : 'Piedra Sinterizada Qstone Gris';
  const stoneFinish = currentCountertopItem ? currentCountertopItem.finish : 'Pulido Satinado';
  const stoneHex = currentCountertopItem ? currentCountertopItem.colorHex : '#8D99AE';
  const thicknessMm = currentCountertopItem?.thicknessMm || (countertopConfig?.stoneThicknessCm ? countertopConfig.stoneThicknessCm * 10 : 20);
  const regruesoCm = countertopConfig?.regruesoCm || 4;
  const backsplashHeightCm = countertopConfig?.backsplashHeight || 0;
  const hasWaterfallLeft = Boolean(countertopConfig?.waterfallLeft);
  const hasWaterfallRight = Boolean(countertopConfig?.waterfallRight);

  // Fregadero / Sink
  const sinkKey = countertopConfig?.selectedSinkModel || 'none';
  const sinkSpec = QSTONE_SINKS[sinkKey] || null;
  const sinkData = {
    hasSink: Boolean(sinkSpec),
    name: sinkSpec ? `${sinkSpec.name} (${sinkSpec.bowls} cubeta/s, ${sinkSpec.material})` : 'Sin fregadero empotrado',
    bowls: sinkSpec ? sinkSpec.bowls : 0,
    installation: sinkSpec?.installation || 'bajocubierta',
  };

  // Encimera / Cooktop
  const cooktopKey = countertopConfig?.selectedCooktopModel || 'none';
  const cooktopSpec = FDV_COOKTOPS[cooktopKey] || null;
  const cooktopData = {
    hasCooktop: Boolean(cooktopSpec),
    name: cooktopSpec ? `${cooktopSpec.name} (${cooktopSpec.burners} quemadores/platos, ${cooktopSpec.material})` : 'Sin encimera empotrada',
    burners: cooktopSpec ? cooktopSpec.burners : 0,
    fuelType: cooktopSpec?.gasType || '',
  };

  let countertopDesc = `Cubierta en ${stoneName} (${stoneFinish}, tonalidad ${stoneHex}), espesor base ${thicknessMm}mm con regrueso frontal ingletado de ${regruesoCm}cm.`;
  if (backsplashHeightCm > 0) {
    countertopDesc += ` Respaldo/salpicadero de muro en la misma piedra de ${backsplashHeightCm}cm de altura.`;
  }
  if (hasWaterfallLeft && hasWaterfallRight) {
    countertopDesc += ' Doble caída en cascada a piso (Waterfall) en ambos laterales izquierdo y derecho.';
  } else if (hasWaterfallLeft) {
    countertopDesc += ' Caída en cascada a piso (Waterfall) en lateral izquierdo.';
  } else if (hasWaterfallRight) {
    countertopDesc += ' Caída en cascada a piso (Waterfall) en lateral derecho.';
  } else {
    countertopDesc += ' Extremos con remate recto estándar sobre el mueble (sin cascada a piso).';
  }
  if (sinkData.hasSink) countertopDesc += ` Incluye calado para ${sinkData.name} instalado bajo cubierta.`;
  if (cooktopData.hasCooktop) countertopDesc += ` Incluye calado para ${cooktopData.name}.`;

  // 5. Suelo y Muros
  let floorDesc = 'Baldosas cerámicas blancas en cuadrícula cuadrada regular con fragüe gris';
  if (floorType && floorType.includes('parquet')) {
    floorDesc = 'Piso flotante / parquet de madera clara natural';
  } else if (floorType && floorType.includes('concreto')) {
    floorDesc = 'Piso de microcemento / concreto pulido gris neutro';
  }
  const wallFinishDesc = `Pintura lisa mate color ${wallColor || '#f3f4f6'}`;

  // 6. Ordenamiento espacial y clasificación exhaustiva de muebles
  // Ordenamos de izquierda a derecha según posición X para dar una secuencia inequívoca
  const sortedCabinets: CabinetType[] = [...cabinets].sort((a, b) => {
    if (a.type !== b.type) {
      const typeOrder: Record<string, number> = { tall: 1, base: 2, wall: 3, island: 4, decoration: 5, closet: 6 };
      return (typeOrder[a.type] || 9) - (typeOrder[b.type] || 9);
    }
    return (a.position?.[0] || 0) - (b.position?.[0] || 0);
  });

  const detailedList: DetailedCabinetItem[] = [];
  const breakdown = {
    baseCount: 0,
    wallCount: 0,
    tallCount: 0,
    islandCount: 0,
    decoCount: 0,
    closetCount: 0,
  };

  sortedCabinets.forEach((cab: CabinetType, idx: number) => {
    const cat = cab.type || 'base';
    if (cat === 'base') breakdown.baseCount++;
    else if (cat === 'wall') breakdown.wallCount++;
    else if (cat === 'tall') breakdown.tallCount++;
    else if (cat === 'island') breakdown.islandCount++;
    else if (cat === 'decoration') breakdown.decoCount++;
    else if (cat === 'closet') breakdown.closetCount++;

    const categoryLabels: Record<string, string> = {
      base: 'Mueble Bajo (Bajo Mesón)',
      wall: 'Mueble Aéreo Superior',
      tall: 'Torre Despensa Alta',
      island: 'Módulo de Isla Central',
      decoration: 'Electrodoméstico / Artefacto',
      closet: 'Módulo de Clóset',
    };

    const label = getCabinetLabel(cab, idx);
    const widthCm = Math.round(cab.width);
    const heightCm = Math.round(cab.height);
    const depthCm = Math.round(cab.depth);
    const posX = Number((cab.position?.[0] || 0).toFixed(1));
    const posY = Number((cab.position?.[1] || 0).toFixed(1));
    const posZ = Number((cab.position?.[2] || 0).toFixed(1));
    const rotDeg = Math.round(((cab.rotation || 0) * 180) / Math.PI);

    const fHex = cab.doorColor || cab.drawerFrontColor || cab.color || primaryFrontHex;
    const fColor = getFriendlyColorName(fHex);
    const sHex = cab.structureColor || cab.color || '#FFFFFF';
    const sColor = getFriendlyColorName(sHex);

    // Tipología de frente
    let frontType: DetailedCabinetItem['frontType'] = 'doors';
    let doorsCount = 0;
    let doorStyle = '';
    let drawersCount = cab.drawersCount || 0;
    let drawerStyle = '';
    let shelvesCount = cab.shelvesCount || 0;
    let isOpenNiche = false;
    let nicheDescription: string | undefined;

    const variant = (cab.variant || '').toLowerCase();

    if (cat === 'decoration') {
      frontType = 'appliance';
      if (variant.includes('stove')) {
        nicheDescription = 'Cocina independiente de pie de 90cm en acero inox con quemadores superiores y horno vidriado';
      } else if (variant.includes('fridge')) {
        nicheDescription = 'Refrigerador Side-by-Side en acabado acero inoxidable';
      } else if (variant.includes('hood')) {
        nicheDescription = 'Campana decorativa de aspiración en acero inoxidable suspendida sobre mesón';
      } else if (variant.includes('dishwasher')) {
        nicheDescription = 'Lavavajillas empotrado con panel frontal de acero inoxidable';
      } else if (variant.includes('plant')) {
        nicheDescription = 'Planta decorativa interior en maceta de diseño';
      }
    } else if (variant.includes('4_drawers') || drawersCount === 4) {
      frontType = 'drawers';
      drawersCount = 4;
      drawerStyle = '4 cajones horizontales de altura uniforme con frentes de melamina';
    } else if (variant.includes('2_pot') || variant.includes('oll') || drawersCount === 2) {
      frontType = 'drawers';
      drawersCount = 2;
      drawerStyle = '2 gavetas olleras altas de gran capacidad con frentes de melamina';
    } else if (variant.includes('2_drawers_1_pot') || drawersCount === 3) {
      frontType = 'drawers';
      drawersCount = 3;
      drawerStyle = '3 cajones horizontales (2 cajones medianos + 1 gaveta ollera inferior)';
    } else if (variant.includes('1_door_1_drawer')) {
      frontType = 'special';
      drawersCount = 1;
      doorsCount = 1;
      drawerStyle = '1 cajón superior cubiertero';
      doorStyle = '1 puerta batiente inferior cerrada';
    } else if (variant.includes('sink_u_drawer')) {
      frontType = 'special';
      drawersCount = 1;
      doorsCount = 1;
      drawerStyle = 'Frente superior fijo o cajón en U bajo fregadero';
      doorStyle = 'Gaveta/puerta inferior para despensa de fregadero';
    } else if (variant.includes('spice')) {
      frontType = 'special';
      doorsCount = 1;
      doorStyle = 'Frente extraíble angosto para especiero vertical';
    } else if (variant.includes('wine_rack')) {
      frontType = 'open_niche';
      isOpenNiche = true;
      nicheDescription = 'Botellero con divisiones cruzadas abiertas para botellas de vino (sin puertas)';
    } else if (variant.includes('open') || variant.includes('shelves') || variant.includes('terminal')) {
      frontType = 'open_niche';
      isOpenNiche = true;
      nicheDescription = `Repisas abiertas vistas (${shelvesCount || 2} repisas) SIN PUERTAS`;
    } else if (variant.includes('micro') && cat === 'wall') {
      frontType = 'special';
      isOpenNiche = true;
      doorsCount = 1;
      nicheDescription = 'Nicho abierto inferior para microondas con puerta superior abatible';
    } else if (variant.includes('oven') || variant.includes('micro')) {
      frontType = 'special';
      doorsCount = 2;
      nicheDescription = 'Torre con nicho empotrado para horno eléctrico y microondas (acero inox y vidrio negro)';
      doorStyle = 'Puertas superior e inferior cerradas de despensa';
    } else if (variant.includes('lift_up_double')) {
      frontType = 'doors';
      doorsCount = 2;
      doorStyle = 'Puerta abatible plegable de doble apertura vertical hacia arriba';
    } else if (variant.includes('lift_up')) {
      frontType = 'doors';
      doorsCount = 1;
      doorStyle = 'Puerta abatible basculante de elevación vertical';
    } else if (variant.includes('2_doors') || (cab.hasDoors && !variant.includes('1_door'))) {
      frontType = 'doors';
      doorsCount = 2;
      doorStyle = '2 puertas batientes lisas, completamente cerradas y opacas';
    } else {
      frontType = 'doors';
      doorsCount = 1;
      const hinge = cab.hingeSide === 'left' ? 'apertura hacia la izquierda' : cab.hingeSide === 'right' ? 'apertura hacia la derecha' : '';
      doorStyle = `1 puerta batiente lisa, completamente cerrada y opaca ${hinge ? `(${hinge})` : ''}`.trim();
    }

    const handleStyle = isGola ? 'Perfil Gola (sin tirador superficial)' : `Tirador ${finishLabel}`;

    // Frase descriptiva inequívoca
    let sentence = `[Módulo #${idx + 1}] ${label}: Dimensión exacta ${widthCm}cm ancho × ${heightCm}cm alto × ${depthCm}cm fondo. Coordenadas 3D: [X: ${posX}cm, Y: ${posY}cm, Z: ${posZ}cm]. Acabado frente: ${fColor}.`;
    if (frontType === 'drawers') {
      sentence += ` Configuración: ${drawerStyle}. ESTRICTAMENTE CONSERVANDO LAS LÍNEAS HORIZONTALES DE LOS ${drawersCount} CAJONES.`;
    } else if (frontType === 'doors') {
      sentence += ` Configuración: ${doorStyle}. ESTRICTAMENTE CERRADO Y OPACO, PROHIBIDO ABRIR O PONER VIDRIO.`;
    } else if (frontType === 'open_niche') {
      sentence += ` Configuración: ${nicheDescription}.`;
    } else if (frontType === 'appliance') {
      sentence += ` Electrodoméstico: ${nicheDescription}.`;
    } else if (frontType === 'special') {
      sentence += ` Configuración combinada: ${drawerStyle || ''} ${doorStyle || ''} ${nicheDescription || ''}.`.trim();
    }
    if (cab.leftCoverPanel?.enabled) sentence += ' Lleva panel lateral de ajuste izquierdo.';
    if (cab.rightCoverPanel?.enabled) sentence += ' Lleva panel lateral de ajuste derecho.';

    detailedList.push({
      index: idx + 1,
      id: cab.id,
      category: cat,
      categoryLabel: categoryLabels[cat] || 'Mueble',
      label,
      widthCm,
      heightCm,
      depthCm,
      positionCm: { x: posX, y: posY, z: posZ },
      rotationDeg: rotDeg,
      frontType,
      doorsCount,
      doorStyle,
      drawersCount,
      drawerStyle,
      shelvesCount,
      isOpenNiche,
      nicheDescription,
      frontColorName: fColor,
      frontColorHex: fHex,
      structureColorName: sColor,
      handleStyle,
      leftCoverPanel: Boolean(cab.leftCoverPanel?.enabled),
      rightCoverPanel: Boolean(cab.rightCoverPanel?.enabled),
      hingeOrientation: cab.hingeSide,
      summarySentence: sentence,
    });
  });

  const hasIsland = breakdown.islandCount > 0;
  const islandDirectives = hasIsland
    ? {
        allowed: true,
        description: `ISLA CENTRAL PRESENTE (${breakdown.islandCount} módulo/s de isla): Representar la isla rectangular en su posición exacta con cajones/puertas lisas y mesón superior en voladizo simétrico.${showSocle ? ' Lleva zócalo cerrado sellado al piso sin patas negras visibles.' : ' Montada sobre patas individuales.'}`,
      }
    : {
        allowed: false,
        description:
          'PROHIBICIÓN ESTRICTA Y ABSOLUTA DE ISLA O PENÍNSULA: Este proyecto tiene EXACTAMENTE CERO (0) ISLAS Y CERO (0) PENÍNSULAS. El piso del área central y primer plano es un espacio abierto 100% despejado y vacío. ESTRICTAMENTE PROHIBIDO DIBUJAR O AGREGAR CUALQUIER ISLA, PENÍNSULA, BARRA, MESA O MÓDULO FLOTANTE EN EL SUELO.',
      };

  // Elementos arquitectónicos
  const archList = (architecturalElements || []).map((el: any) => ({
    type: el.type,
    name: el.name || el.type,
    widthCm: Math.round(el.width || 0),
    heightCm: Math.round(el.height || 0),
    positionCm: {
      x: Number((el.position?.[0] || 0).toFixed(1)),
      y: Number((el.position?.[1] || 0).toFixed(1)),
      z: Number((el.position?.[2] || 0).toFixed(1)),
    },
  }));

  // Directivas negativas mandatorias
  const strictNegativeDirectives = [
    `CERO MUEBLES INVENTADOS: El proyecto consta ÚNICA Y EXCLUSIVAMENTE de los ${detailedList.length} muebles enumerados en el inventario. Prohibido agregar repisas flotantes, módulos aéreos adicionales o muebles auxiliares.`,
    'INMUTABILIDAD DE PUERTAS CERRADAS: Todo módulo catalogado con puertas batientes u opacas debe permanecer cerrado. Queda terminantemente prohibido convertir puertas de melamina en nichos abiertos, estantes vacíos o puertas vidriadas tipo vitrina.',
    'FIDELIDAD EN CAJONES: Cada cajonera debe mostrar exactamente la cantidad de divisiones horizontales y frentes de cajón especificados en su ficha técnica.',
    islandDirectives.description,
    'INMUTABILIDAD DE MEDIDAS: Las proporciones, anchos y alturas de cada módulo deben corresponder con exactitud a sus medidas en centímetros listadas.',
    socleDirective,
    'PROHIBIDO OSCURECER LA MELAMINA: Mantener la tonalidad clara y luminosa estipulada, evitando maderas oscuras tipo nogal, castaño rústico o nudos prominentes.',
  ];

  // Construcción de la especificación técnica en texto para el prompt
  const rawTextPromptSpec = `
INVENTARIO TÉCNICO INMUTABLE Y LEVANTAMIENTO BIM:
TOTAL DE MÓDULOS EN ESCENA: ${detailedList.length}
- Muebles Bajos (Bajo Mesón): ${breakdown.baseCount}
- Muebles Aéreos Superiores: ${breakdown.wallCount}
- Torres Despensa Altas: ${breakdown.tallCount}
- Módulos de Isla Central: ${breakdown.islandCount} ${hasIsland ? '(Activa)' : '(ESTRICTAMENTE PROHIBIDA / CERO)'}
- Artefactos / Electrodomésticos: ${breakdown.decoCount}
- Clósets: ${breakdown.closetCount}

DETALLE PIEZA POR PIEZA (SECUENCIA EXACTA):
${detailedList.map((item) => `${item.index}. ${item.summarySentence}`).join('\n')}

CUBIERTA Y MESÓN DE TRABAJO:
- ${countertopDesc}

SOPORTE DE BASE:
- ${socleDirective}

HERRAJES Y SISTEMA DE APERTURA:
- ${hardwareSummary}

MATERIALIDAD GENERAL:
- Melamina principal frentes: ${woodToneDetails}
- Acabado muros: ${wallFinishDesc}
- Pavimento / Suelo: ${floorDesc}
`.trim();

  // Compatibilidad hacia atrás
  const islandCabinets = cabinets.filter((c: CabinetType) => c.type === 'island');
  const islandCab = islandCabinets[0];
  const islandRawColor = islandCab?.drawerFrontColor || islandCab?.doorColor || islandCab?.color || primaryFrontHex;
  const islandColorName = getFriendlyColorName(islandRawColor);

  return {
    totalModulesCount: detailedList.length,
    breakdown,
    hasIsland,
    islandDirectives,
    countertop: {
      materialName: stoneName,
      productName: currentCountertopItem?.name || stoneName,
      finish: stoneFinish,
      colorHex: stoneHex,
      thicknessMm,
      regruesoCm,
      backsplashHeightCm,
      hasWaterfallLeft,
      hasWaterfallRight,
      sink: sinkData,
      cooktop: cooktopData,
      description: countertopDesc,
    },
    socle: {
      hasClosedSocle: Boolean(showSocle),
      heightCm: Number(socleHeight),
      finishName: socleColorName,
      directive: socleDirective,
    },
    hardwareSummary,
    finishSummary: {
      primaryFrontColor,
      primaryFrontHex,
      woodToneDetails,
      wallColor: wallFinishDesc,
      floorDescription: floorDesc,
    },
    cabinetsList: detailedList,
    architecturalElements: archList,
    strictNegativeDirectives,
    rawTextPromptSpec,
    // Campos legados para garantizar compatibilidad con consumidores anteriores
    cabinetFronts: primaryFrontColor,
    islandFronts: hasIsland ? islandColorName : null,
    woodToneDetails,
    moduleArchitecture: detailedList.map((d) => d.summarySentence).join(' | '),
    hardware: hardwareSummary,
    flooring: floorDesc,
    wallFinish: wallFinishDesc,
    socleDirective,
  };
}
