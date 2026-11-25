import { CabinetType, getCabinetLabel, ArchitecturalElement, SpaceDecorationConfig } from '../store/kitchenStore';
import { getFriendlyColorName } from './colorNames';
import { FINISH_LABELS, HANDLE_CATALOG, HandleFinish, KitchenHandleConfig } from '../types/handle';
import {
  QSTONE_SINKS,
  FDV_COOKTOPS,
  QstoneProductItem,
  DEFAULT_QSTONE_CATALOG,
  CountertopConfig,
  IslandBackConfig,
} from '../types/countertop';
import { FLOOR_TYPE_OPTIONS, WALL_COLOR_OPTIONS } from './kitchenMaterials';
import { detectContinuousCabinetRuns } from './countertopNesting';
import { useAdminStore } from '../store/adminStore';

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
  frontMaterial?: string;
  grainDirection?: 'vertical' | 'horizontal';
  handleStyle: string;
  leftCoverPanel: boolean;
  rightCoverPanel: boolean;
  hingeOrientation?: string;
  isOpenInViewport?: boolean;
  hostsSink?: boolean;
  hostsCooktop?: boolean;
  summarySentence: string;
}

export interface DetailedBimManifest {
  projectType?: 'kitchen' | 'closet';
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
  islandBack?: {
    enabled: boolean;
    description: string;
  };
  countertop: {
    enabled?: boolean;
    materialName: string;
    productName: string;
    finish: string;
    colorHex: string;
    thicknessMm: number;
    regruesoCm: number;
    backsplashMode?: string;
    backsplashHeightCm: number;
    hasWaterfallLeft: boolean;
    hasWaterfallRight: boolean;
    sink: {
      hasSink: boolean;
      name: string;
      bowls: number;
      installation: string;
      cabinetLabel?: string;
    };
    cooktop: {
      hasCooktop: boolean;
      name: string;
      burners: number;
      fuelType: string;
      cabinetLabel?: string;
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
  hardwareFinishName?: string;
  isHandleless?: boolean;
  finishSummary: {
    primaryFrontColor: string;
    primaryFrontHex: string;
    woodToneDetails: string;
    allFrontFinishes?: string[];
    wallColor: string;
    floorDescription: string;
    spaceDecorationSummary?: string;
  };
  cabinetsList: DetailedCabinetItem[];
  architecturalElements: Array<{
    type: string;
    name: string;
    widthCm: number;
    heightCm: number;
    elevationCm?: number;
    rotationDeg?: number;
    isOpen?: boolean;
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

function describeHandleConfig(
  handleConfig: KitchenHandleConfig | undefined,
  golaSystem: string
): { summary: string; finishName: string; isHandleless: boolean } {
  if (golaSystem && golaSystem !== 'none') {
    const golaLabel = golaSystem === 'black' ? 'Negro Mate' : 'Aluminio Natural Anodizado';
    return {
      summary: `Sistema Riel Gola integrado en acabado ${golaLabel} (frentes continuos sin tiradores superficiales sobresalientes)`,
      finishName: golaLabel,
      isHandleless: true,
    };
  }

  const modelId = handleConfig?.model || 'forza';
  if (modelId === 'none') {
    return {
      summary: 'Sistema sin tiradores exteriores visibles (apertura Push-to-Open, frentes completamente lisos)',
      finishName: 'Sin tirador',
      isHandleless: true,
    };
  }

  const catalogItem = HANDLE_CATALOG.find((h) => h.id === modelId);
  const rawFinish = handleConfig?.finish as HandleFinish | undefined;
  const finishLabel = rawFinish && FINISH_LABELS[rawFinish] ? FINISH_LABELS[rawFinish] : 'Negro Mate';
  const lengthMm = handleConfig?.lengthMm || catalogItem?.lengths?.[0] || 128;
  const orientation =
    handleConfig?.orientation && handleConfig.orientation !== 'auto'
      ? `, orientación ${handleConfig.orientation}`
      : '';

  const modelLabel = catalogItem
    ? `${catalogItem.name} (${catalogItem.category} en ${catalogItem.material}, largo ${lengthMm}mm${orientation})`
    : `Tirador metálico (${lengthMm}mm)`;

  return {
    summary: `${modelLabel} en acabado ${finishLabel}`,
    finishName: finishLabel,
    isHandleless: false,
  };
}

function isLightWoodFinish(hexOrUrl: string, friendlyName: string): boolean {
  const lowerVal = (hexOrUrl || '').toLowerCase();
  const lowerName = (friendlyName || '').toLowerCase();
  return (
    lowerVal.includes('light-wood-grain') ||
    lowerVal === '#d4a373' ||
    lowerVal === '#dfc7a5' ||
    lowerVal === '#d6ba94' ||
    lowerName.includes('roble natural') ||
    lowerName.includes('roble claro') ||
    lowerName.includes('roble nórdico') ||
    lowerName.includes('fresno') ||
    lowerName.includes('haya')
  );
}

function resolveFloorDescription(floorType?: string): string {
  if (floorType) {
    const exact = FLOOR_TYPE_OPTIONS.find((f) => f.id === floorType);
    if (exact) {
      return `${exact.name} (${exact.category}: ${exact.description}, tono base ${exact.primaryColor})`;
    }
    const lower = floorType.toLowerCase();
    if (lower.includes('wood') || lower.includes('parquet') || lower.includes('madera')) {
      return 'Piso de madera / parquet natural';
    }
    if (lower.includes('microcement') || lower.includes('concreto') || lower.includes('cement')) {
      return 'Piso continuo de microcemento / cemento pulido';
    }
    if (lower.includes('marble') || lower.includes('marmol')) {
      return 'Piso de mármol con vetas naturales';
    }
  }
  const fallback = FLOOR_TYPE_OPTIONS[0];
  return `${fallback.name} (${fallback.description})`;
}

function resolveWallDescription(wallColor?: string): string {
  const hex = wallColor || '#f3f4f6';
  const exact = WALL_COLOR_OPTIONS.find((w) => w.hex.toLowerCase() === hex.toLowerCase());
  if (exact) {
    return `Pintura lisa mate ${exact.name} (${exact.hex} - ${exact.description})`;
  }
  return `Pintura lisa mate color ${getFriendlyColorName(hex)} (${hex})`;
}

function resolveSpaceDecorationSummary(spaceDecoration?: SpaceDecorationConfig): string {
  if (!spaceDecoration) return '';
  const notes: string[] = [];

  let supplies: any[] = [];
  try {
    supplies = useAdminStore.getState().supplies || [];
  } catch {
    supplies = [];
  }
  const findSupplyName = (id?: string) => {
    if (!id) return null;
    const found = supplies.find((s) => s.id === id);
    return found?.name || null;
  };

  if (spaceDecoration.wallDecorations) {
    Object.values(spaceDecoration.wallDecorations).forEach((wd) => {
      if (wd && (wd.supplyName || wd.finishType || wd.notes)) {
        const label = wd.supplyName || findSupplyName(wd.supplyId) || wd.finishType || 'revestimiento';
        notes.push(`Muro ${wd.wallId}: ${wd.finishType || 'acabado'} ${label}${wd.notes ? ` (${wd.notes})` : ''}`);
      }
    });
  }

  if (Array.isArray(spaceDecoration.floorZones)) {
    spaceDecoration.floorZones.forEach((fz) => {
      const name = fz.supplyName || findSupplyName(fz.supplyId);
      if (name) {
        notes.push(`Zona de piso "${fz.name}" (${fz.areaPercentage}%): ${name}`);
      }
    });
  }

  const extras: Array<[string, string | undefined, number | undefined]> = [
    ['Cortinas', spaceDecoration.cortinasSupplyId, spaceDecoration.cortinasCount],
    ['Ventanas', spaceDecoration.ventanasSupplyId, spaceDecoration.ventanasCount],
    ['Puertas', spaceDecoration.puertasSupplyId, spaceDecoration.puertasCount],
    ['Focos', spaceDecoration.focosSupplyId, spaceDecoration.focosCount],
    ['Rodones', spaceDecoration.rodonesSupplyId, undefined],
    ['Marquetería', spaceDecoration.marqueteriaSupplyId, undefined],
  ];
  extras.forEach(([label, id, count]) => {
    const supplyName = findSupplyName(id);
    if (supplyName) {
      notes.push(`${label}${count ? ` (${count})` : ''}: ${supplyName}`);
    }
  });

  return notes.join('; ');
}

function classifyCabinetFront(
  cab: CabinetType
): {
  frontType: DetailedCabinetItem['frontType'];
  doorsCount: number;
  doorStyle: string;
  drawersCount: number;
  drawerStyle: string;
  shelvesCount: number;
  isOpenNiche: boolean;
  nicheDescription?: string;
} {
  const cat = cab.type || 'base';
  const variant = (cab.variant || '').toLowerCase();
  const widthCm = Math.round(cab.width || 60);
  const heightCm = Math.round(cab.height || 70);
  const shelvesCount = cab.shelvesCount || 0;
  let drawersCount = cab.drawersCount || 0;

  // 1. Decorativos y electrodomésticos independientes
  if (cat === 'decoration' || variant.startsWith('deco_')) {
    let nicheDescription = `Elemento decorativo / artefacto modelado (${widthCm}cm ancho × ${heightCm}cm alto)`;
    if (variant.includes('stove')) {
      nicheDescription = `Cocina independiente de pie de ${widthCm}cm en acero inoxidable con quemadores superiores y horno vidriado`;
    } else if (variant.includes('fridge')) {
      nicheDescription = `Refrigerador Side-by-Side de ${widthCm}cm × ${heightCm}cm en acabado acero inoxidable`;
    } else if (variant.includes('hood')) {
      nicheDescription = `Campana decorativa de aspiración de ${widthCm}cm en acero inoxidable suspendida sobre zona de cocción`;
    } else if (variant.includes('dishwasher')) {
      nicheDescription = `Lavavajillas de ${widthCm}cm con frente en acero inoxidable`;
    } else if (variant.includes('plant')) {
      nicheDescription = `Planta decorativa interior en maceta modelada en escena (${widthCm}cm × ${heightCm}cm)`;
    }
    return {
      frontType: 'appliance',
      doorsCount: 0,
      doorStyle: '',
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount: 0,
      isOpenNiche: false,
      nicheDescription,
    };
  }

  // 2. Variantes de Clóset
  if (cat === 'closet' || variant.startsWith('closet_')) {
    const hasDoors = cab.hasDoors !== false && !variant.includes('walkin');
    if (variant.includes('walkin')) {
      return {
        frontType: 'open_niche',
        doorsCount: 0,
        doorStyle: '',
        drawersCount,
        drawerStyle: drawersCount > 0 ? `${drawersCount} cajones interiores a la vista` : '',
        shelvesCount: shelvesCount || 3,
        isOpenNiche: true,
        nicheDescription: `Módulo clóset abierto tipo walk-in sin puertas (${shelvesCount || 3} repisas${cab.hasHanger ? ' y barra colgador' : ''}${drawersCount > 0 ? `, ${drawersCount} cajones` : ''})`,
      };
    }
    if (variant.includes('drawers') && !variant.includes('inner')) {
      const count = drawersCount || 4;
      return {
        frontType: hasDoors ? 'special' : 'drawers',
        doorsCount: hasDoors ? 2 : 0,
        doorStyle: hasDoors ? '2 puertas batientes superiores cerradas' : '',
        drawersCount: count,
        drawerStyle: `${count} cajones frontales horizontales`,
        shelvesCount,
        isOpenNiche: false,
      };
    }
    if (!hasDoors) {
      return {
        frontType: 'open_niche',
        doorsCount: 0,
        doorStyle: '',
        drawersCount,
        drawerStyle: '',
        shelvesCount: shelvesCount || 4,
        isOpenNiche: true,
        nicheDescription: `Módulo clóset abierto sin puertas con ${shelvesCount || 4} repisas${cab.hasHanger ? ' y barra colgador' : ''}`,
      };
    }
    return {
      frontType: 'doors',
      doorsCount: widthCm >= 75 || variant.includes('2_doors') ? 2 : 1,
      doorStyle: `${widthCm >= 75 || variant.includes('2_doors') ? '2 puertas' : '1 puerta'} batiente lisa cerrada opaca de clóset`,
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: false,
    };
  }

  // 3. Variantes especiales de muebles aéreos (Wall)
  if (variant === 'wall_hood_new_flow') {
    return {
      frontType: 'special',
      doorsCount: 1,
      doorStyle: 'Frente superior cerrado que oculta ducto',
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: false,
      nicheDescription: 'Módulo aéreo con campana retráctil integrada inferior (New Flow)',
    };
  }
  if (variant === 'wall_door_shelf') {
    return {
      frontType: 'special',
      doorsCount: 1,
      doorStyle: '1 puerta superior batiente cerrada',
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount: shelvesCount || 1,
      isOpenNiche: true,
      nicheDescription: 'Repisa inferior abierta integrada bajo la puerta',
    };
  }
  if (variant.includes('wall_corner_blind')) {
    return {
      frontType: 'doors',
      doorsCount: 1,
      doorStyle: `Módulo aéreo esquinero ciego con 1 puerta batiente cerrada y panel frontal ciego (${cab.blindWidth || 35}cm)`,
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: false,
    };
  }
  if (variant.includes('micro') && cat === 'wall') {
    return {
      frontType: 'special',
      doorsCount: 1,
      doorStyle: '1 puerta superior abatible cerrada',
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: true,
      nicheDescription: 'Nicho abierto inferior para microondas',
    };
  }

  // 4. Variantes especiales de torres altas (Tall)
  if (variant === 'tall_oven_micro' || variant === 'tall_oven_vent') {
    const lowerIsDrawers = cab.towerLowerType === 'drawers';
    return {
      frontType: 'special',
      doorsCount: lowerIsDrawers ? 1 : 2,
      doorStyle: lowerIsDrawers
        ? 'Puerta superior cerrada de despensa'
        : 'Puertas superior e inferior cerradas de despensa',
      drawersCount: lowerIsDrawers ? 2 : 0,
      drawerStyle: lowerIsDrawers ? '2 gavetas inferiores horizontales bajo el horno' : '',
      shelvesCount,
      isOpenNiche: false,
      nicheDescription:
        variant === 'tall_oven_vent'
          ? 'Torre para horno y microondas empotrados (acero inox y vidrio negro) con ventilación técnica'
          : 'Torre con nicho central empotrado para horno eléctrico y microondas (acero inox y vidrio negro)',
    };
  }
  if (variant === 'tall_microwave_niche') {
    return {
      frontType: 'special',
      doorsCount: 2,
      doorStyle: 'Puertas superior e inferior cerradas de despensa',
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: true,
      nicheDescription: 'Nicho abierto central para microondas',
    };
  }
  if (variant === 'tall_split_2_doors') {
    return {
      frontType: 'doors',
      doorsCount: 2,
      doorStyle: '2 puertas verticales divididas horizontalmente alineadas con la cubierta (superior e inferior, cerradas y opacas)',
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: false,
    };
  }
  if (variant === 'tall_inner_drawers') {
    const dCount = widthCm >= 75 ? 2 : 1;
    return {
      frontType: 'doors',
      doorsCount: dCount,
      doorStyle: `${dCount === 2 ? '2 puertas' : '1 puerta'} batiente exterior lisa y cerrada (los cajones interiores permanecen ocultos tras la puerta cerrada)`,
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: false,
    };
  }

  // 5. Variantes de esquineros base
  if (variant === 'corner_l' || variant === 'base_corner_l') {
    return {
      frontType: 'doors',
      doorsCount: 2,
      doorStyle: 'Módulo base esquinero en L con 2 puertas plegables en ángulo de 90° cerradas y opacas',
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: false,
    };
  }
  if (variant.includes('corner_blind')) {
    return {
      frontType: 'doors',
      doorsCount: 1,
      doorStyle: `Módulo base esquinero ciego con 1 puerta batiente cerrada y zona ciega (${cab.blindWidth || 65}cm)`,
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: false,
    };
  }

  // 6. Variantes de cajones y combinados base/isla
  if (variant.includes('cooktop_3_drawers')) {
    return {
      frontType: 'drawers',
      doorsCount: 0,
      doorStyle: '',
      drawersCount: 3,
      drawerStyle: '3 frentes horizontales de cajón (1° frente superior fijo para encimera + 2 gavetas inferiores)',
      shelvesCount,
      isOpenNiche: false,
    };
  }
  if (variant.includes('3_drawers_veggie')) {
    return {
      frontType: 'drawers',
      doorsCount: 0,
      doorStyle: '',
      drawersCount: 3,
      drawerStyle: '3 cajones horizontales de verdulero con frentes cerrados de melamina',
      shelvesCount,
      isOpenNiche: false,
    };
  }
  if (variant.includes('4_drawers') || drawersCount === 4) {
    return {
      frontType: 'drawers',
      doorsCount: 0,
      doorStyle: '',
      drawersCount: 4,
      drawerStyle: '4 cajones horizontales de altura uniforme con frentes cerrados',
      shelvesCount,
      isOpenNiche: false,
    };
  }
  if (variant.includes('2_pot') || variant.includes('oll') || drawersCount === 2) {
    return {
      frontType: 'drawers',
      doorsCount: 0,
      doorStyle: '',
      drawersCount: 2,
      drawerStyle: '2 gavetas olleras altas horizontales con frentes cerrados',
      shelvesCount,
      isOpenNiche: false,
    };
  }
  if (variant.includes('2_drawers_1_pot') || drawersCount === 3) {
    return {
      frontType: 'drawers',
      doorsCount: 0,
      doorStyle: '',
      drawersCount: 3,
      drawerStyle: '3 cajones horizontales (2 cajones superiores medianos + 1 gaveta ollera inferior alta)',
      shelvesCount,
      isOpenNiche: false,
    };
  }
  if (variant.includes('1_door_1_drawer')) {
    return {
      frontType: 'special',
      doorsCount: 1,
      doorStyle: '1 puerta batiente inferior cerrada',
      drawersCount: 1,
      drawerStyle: '1 cajón superior cubiertero',
      shelvesCount,
      isOpenNiche: false,
    };
  }
  if (variant.includes('sink_u_drawer')) {
    return {
      frontType: 'special',
      doorsCount: 0,
      doorStyle: '',
      drawersCount: 2,
      drawerStyle: '2 frentes horizontales bajo fregadero (cajón superior en U + gaveta inferior)',
      shelvesCount,
      isOpenNiche: false,
    };
  }
  if (variant.includes('sink_2_doors')) {
    return {
      frontType: 'doors',
      doorsCount: 2,
      doorStyle: '2 puertas batientes lisas cerradas bajo lavaplatos',
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: false,
    };
  }
  if (variant.includes('spice')) {
    return {
      frontType: 'special',
      doorsCount: 1,
      doorStyle: 'Frente vertical angosto extraíble de especiero cerrado',
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: false,
    };
  }

  // 7. Módulos abiertos / botelleros
  if (variant.includes('wine_rack')) {
    return {
      frontType: 'open_niche',
      doorsCount: 0,
      doorStyle: '',
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: true,
      nicheDescription: 'Botellero abierto con cuadrícula de divisiones para botellas (sin puertas)',
    };
  }
  if (variant.includes('open') || variant.includes('shelves') || variant.includes('terminal')) {
    return {
      frontType: 'open_niche',
      doorsCount: 0,
      doorStyle: '',
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount: shelvesCount || 2,
      isOpenNiche: true,
      nicheDescription: `Módulo de repisas abiertas a la vista (${shelvesCount || 2} repisas, sin puertas)`,
    };
  }

  // 8. Puertas elevables y batientes estándar
  if (variant.includes('lift_up_double')) {
    return {
      frontType: 'doors',
      doorsCount: 2,
      doorStyle: '2 hojas horizontales abatibles elevables (doble elevación vertical), cerradas y opacas',
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: false,
    };
  }
  if (variant.includes('lift_up')) {
    return {
      frontType: 'doors',
      doorsCount: 1,
      doorStyle: '1 puerta abatible basculante de elevación vertical, cerrada y opaca',
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: false,
    };
  }
  if (variant.includes('2_doors') || (cab.hasDoors && !variant.includes('1_door') && widthCm >= 75)) {
    return {
      frontType: 'doors',
      doorsCount: 2,
      doorStyle: '2 puertas batientes lisas, cerradas y opacas',
      drawersCount: 0,
      drawerStyle: '',
      shelvesCount,
      isOpenNiche: false,
    };
  }

  const hinge =
    cab.hingeSide === 'left'
      ? 'bisagra izquierda'
      : cab.hingeSide === 'right'
      ? 'bisagra derecha'
      : '';
  return {
    frontType: 'doors',
    doorsCount: 1,
    doorStyle: `1 puerta batiente lisa, cerrada y opaca${hinge ? ` (${hinge})` : ''}`,
    drawersCount: 0,
    drawerStyle: '',
    shelvesCount,
    isOpenNiche: false,
  };
}

/**
 * Inspecciona exhaustivamente el estado de la cocina en kitchenStore
 * y construye un manifiesto BIM de fidelidad 1:1 para NanoBanana.
 */
export function extractDetailedKitchenBimManifest(kitchenState: any): DetailedBimManifest | null {
  if (!kitchenState || !kitchenState.cabinets || kitchenState.cabinets.length === 0) {
    return null;
  }

  const {
    cabinets = [],
    countertopConfig,
    islandBackConfig,
    qstoneCatalog = [],
    handleConfig,
    floorType,
    wallColor,
    spaceDecoration,
    showSocle,
    socleFinish,
    socleHeight = 10,
    golaSystem = 'none',
    architecturalElements = [],
    walls = [],
    roomConfig,
  } = kitchenState as {
    cabinets: CabinetType[];
    countertopConfig?: CountertopConfig;
    islandBackConfig?: IslandBackConfig;
    qstoneCatalog?: QstoneProductItem[];
    handleConfig?: KitchenHandleConfig;
    floorType?: string;
    wallColor?: string;
    spaceDecoration?: SpaceDecorationConfig;
    showSocle?: boolean;
    socleFinish?: 'aluminum' | 'black' | string;
    socleHeight?: number;
    golaSystem?: string;
    architecturalElements?: ArchitecturalElement[];
    walls?: any[];
    roomConfig?: any;
  };

  // 1. Detección real de acabados de frentes (sin asumir madera clara si no lo es)
  const furnitureCabs = cabinets.filter((c) => c.type !== 'decoration');
  const wallOrBaseCab = furnitureCabs.find((c) => c.type !== 'island') || furnitureCabs[0] || cabinets[0];
  const primaryFrontHex = wallOrBaseCab?.doorColor || wallOrBaseCab?.drawerFrontColor || wallOrBaseCab?.color || '#FFFFFF';
  const primaryFrontColor = getFriendlyColorName(primaryFrontHex);

  const uniqueFinishSet = new Set<string>();
  furnitureCabs.forEach((c) => {
    const fHex = c.doorColor || c.drawerFrontColor || c.color;
    if (fHex) {
      const fName = getFriendlyColorName(fHex);
      const mat = c.doorMaterial === 'hpl' || c.drawerFrontMaterial === 'hpl' ? 'HPL' : 'Melamina';
      uniqueFinishSet.add(`${fName} (${mat})`);
    }
  });
  const allFrontFinishes = Array.from(uniqueFinishSet);

  const isLightWood = isLightWoodFinish(primaryFrontHex, primaryFrontColor);
  const woodToneDetails = isLightWood
    ? `${primaryFrontColor} (${primaryFrontHex}): tono madera clara luminosa con veta lineal limpia y sutil, conservando exactamente el tono visible en la captura 3D.`
    : allFrontFinishes.length > 1
    ? `Acabados combinados exactos según cada módulo: ${allFrontFinishes.join(' + ')}. Respetar fielmente el color y brillo real de cada frente en la captura 3D.`
    : `${primaryFrontColor} (${primaryFrontHex}): conservar exactamente el color, tono y textura real visible en la captura 3D sin aclarar ni oscurecer.`;

  // 2. Herrajes / Tiradores / Gola reales
  const globalHardware = describeHandleConfig(handleConfig, golaSystem || 'none');

  // 3. Soporte inferior / Zócalo real ('aluminum' | 'black')
  const socleColorName = socleFinish === 'black' ? 'Negro Mate' : 'Aluminio Gris Satinado';
  const socleDirective = showSocle
    ? `Zócalo continuo cerrado de ${socleHeight} cm en acabado ${socleColorName}, sellando uniformemente la base de los muebles bajos e isla contra el suelo exactamente como muestra la captura 3D.`
    : `Muebles apoyados sobre patas cilíndricas individuales de ${socleHeight} cm con espacio libre visible bajo el casco, exactamente como muestra la captura 3D.`;

  // 4. Cubiertas / Countertop (leyendo propiedades reales de CountertopConfig)
  const hasCountertop = Boolean(countertopConfig?.enabled);
  const catalogToUse = qstoneCatalog && qstoneCatalog.length > 0 ? qstoneCatalog : DEFAULT_QSTONE_CATALOG;
  const currentCountertopItem: QstoneProductItem | undefined = catalogToUse.find(
    (item) => item.id === countertopConfig?.selectedProductId
  );

  const stoneName = hasCountertop
    ? currentCountertopItem?.name || 'Piedra Sinterizada Qstone'
    : 'Sin cubierta instalada';
  const stoneFinish = hasCountertop ? currentCountertopItem?.finish || 'Satinado' : 'N/A';
  const stoneHex = hasCountertop ? currentCountertopItem?.colorHex || '#FFFFFF' : 'N/A';
  const thicknessMm = hasCountertop ? currentCountertopItem?.thicknessMm ?? 20 : 0;

  // Corrección crítica: respetar 0 cm (canto simple) en vez de `|| 4`
  const isHplAbet = currentCountertopItem?.materialType === 'hpl_abet';
  const rawRegrueso = typeof countertopConfig?.regruesoCm === 'number' ? countertopConfig.regruesoCm : 0;
  const regruesoCm = hasCountertop && !isHplAbet ? rawRegrueso : 0;

  // Corrección crítica: leer backsplashMode y backsplashHeightCm reales
  const backsplashMode = hasCountertop ? countertopConfig?.backsplashMode || 'none' : 'none';
  const backsplashHeightCm =
    !hasCountertop || backsplashMode === 'none'
      ? 0
      : typeof countertopConfig?.backsplashHeightCm === 'number'
      ? countertopConfig.backsplashHeightCm
      : 5;

  const hasBaseWaterfallLeft = Boolean(countertopConfig?.baseWaterfallLeft ?? countertopConfig?.waterfallLeft);
  const hasBaseWaterfallRight = Boolean(countertopConfig?.baseWaterfallRight ?? countertopConfig?.waterfallRight);
  const hasIslandWaterfallLeft = Boolean(countertopConfig?.islandWaterfallLeft ?? countertopConfig?.waterfallLeft);
  const hasIslandWaterfallRight = Boolean(countertopConfig?.islandWaterfallRight ?? countertopConfig?.waterfallRight);

  const runOverridesValues = Object.values(countertopConfig?.runOverrides || {});
  const hasAnyOverrideWaterfallLeft = runOverridesValues.some((r) => r?.waterfallLeft === true);
  const hasAnyOverrideWaterfallRight = runOverridesValues.some((r) => r?.waterfallRight === true);

  const hasWaterfallLeft = hasCountertop && (hasBaseWaterfallLeft || hasIslandWaterfallLeft || hasAnyOverrideWaterfallLeft);
  const hasWaterfallRight = hasCountertop && (hasBaseWaterfallRight || hasIslandWaterfallRight || hasAnyOverrideWaterfallRight);

  // Corrección crítica: leer sinkModel / sinkCabinetId y cooktopModel / cooktopCabinetId reales
  const sinkKey = hasCountertop ? countertopConfig?.sinkModel || 'none' : 'none';
  const sinkSpec = QSTONE_SINKS[sinkKey] || null;
  const sinkCabinet =
    sinkSpec && countertopConfig?.sinkCabinetId
      ? cabinets.find((c) => c.id === countertopConfig.sinkCabinetId)
      : undefined;
  const sinkCabLabel = sinkCabinet ? getCabinetLabel(sinkCabinet, 0) : undefined;
  const sinkData = {
    hasSink: Boolean(sinkSpec),
    name: sinkSpec
      ? `${sinkSpec.name} (${sinkSpec.bowls} cubeta/s, ${sinkSpec.material}) + grifería monomando cuello alto acero inox`
      : 'Sin lavaplatos empotrado',
    bowls: sinkSpec ? sinkSpec.bowls : 0,
    installation: sinkSpec?.installation || 'bajocubierta',
    cabinetLabel: sinkCabLabel,
  };

  const cooktopKey = hasCountertop ? countertopConfig?.cooktopModel || 'none' : 'none';
  const cooktopSpec = FDV_COOKTOPS[cooktopKey] || null;
  const cooktopCabinet =
    cooktopSpec && countertopConfig?.cooktopCabinetId
      ? cabinets.find((c) => c.id === countertopConfig.cooktopCabinetId)
      : undefined;
  const cooktopCabLabel = cooktopCabinet ? getCabinetLabel(cooktopCabinet, 0) : undefined;
  const cooktopData = {
    hasCooktop: Boolean(cooktopSpec),
    name: cooktopSpec
      ? `${cooktopSpec.name} (${cooktopSpec.burners} quemadores, ${cooktopSpec.material})`
      : 'Sin encimera empotrada',
    burners: cooktopSpec ? cooktopSpec.burners : 0,
    fuelType: cooktopSpec?.gasType || '',
    cabinetLabel: cooktopCabLabel,
  };

  let countertopDesc = '';
  if (!hasCountertop) {
    countertopDesc =
      'SIN CUBIERTA INSTALADA: los muebles base e isla no llevan cubierta de piedra/cuarzo; mantener su remate superior exacto tal como aparece en la captura 3D.';
  } else {
    countertopDesc = `Cubierta en ${stoneName} (${stoneFinish}, tono ${stoneHex}), espesor real ${thicknessMm}mm`;
    if (regruesoCm > 0) {
      countertopDesc += ` con regrueso frontal ingletado de ${regruesoCm}cm`;
    } else {
      countertopDesc += ' con canto simple recto sin regrueso frontal';
    }
    countertopDesc += '.';

    if (backsplashMode === 'full_height') {
      countertopDesc += ' Respaldo/salpicadero de muro en el mismo material a altura completa hasta los muebles aéreos.';
    } else if (backsplashMode === 'standard_5cm' && backsplashHeightCm > 0) {
      countertopDesc += ` Zócalo respaldo/salpicadero en el mismo material de ${backsplashHeightCm}cm de altura sobre la cubierta.`;
    } else {
      countertopDesc += ' Sin respaldo/salpicadero de piedra en muro.';
    }

    // Tramos continuos detectados para describir cascadas y voladizos exactos por tramo
    try {
      const runs = detectContinuousCabinetRuns(cabinets, countertopConfig, walls, architecturalElements, roomConfig);
      if (runs.length > 0) {
        const runSummaries = runs.map((r) => {
          const ov = countertopConfig?.runOverrides?.[r.id];
          const isIsl = r.type === 'island';
          const wfL = ov?.waterfallLeft ?? (isIsl ? hasIslandWaterfallLeft : hasBaseWaterfallLeft);
          const wfR = ov?.waterfallRight ?? (isIsl ? hasIslandWaterfallRight : hasBaseWaterfallRight);
          const reg = ov?.regruesoCm ?? (isIsl ? countertopConfig?.islandRegruesoCm : countertopConfig?.baseRegruesoCm) ?? regruesoCm;
          const lenCm = Math.round(r.totalLengthMm / 10);
          const depCm = Math.round(r.depthMm / 10);
          const parts = [`Tramo ${r.name} (${isIsl ? 'Isla' : 'Base'}: ${lenCm}cm × ${depCm}cm`];
          if (reg > 0 && !isHplAbet) parts.push(`regrueso ${reg}cm`);
          if (wfL && r.canWaterfallLeft) parts.push('cascada izquierda al suelo');
          if (wfR && r.canWaterfallRight) parts.push('cascada derecha al suelo');
          if (isIsl && (r.overhangRearMm || 0) > 0) parts.push(`voladizo barra trasera ${Math.round((r.overhangRearMm || 0) / 10)}cm`);
          return `${parts.join(', ')})`;
        });
        countertopDesc += ` Tramos activos: ${runSummaries.join('; ')}.`;
      }
    } catch {
      // Fallback limpio si falla cálculo de tramos
      if (hasWaterfallLeft && hasWaterfallRight) {
        countertopDesc += ' Caída en cascada al suelo en ambos laterales.';
      } else if (hasWaterfallLeft) {
        countertopDesc += ' Caída en cascada al suelo en lateral izquierdo.';
      } else if (hasWaterfallRight) {
        countertopDesc += ' Caída en cascada al suelo en lateral derecho.';
      } else {
        countertopDesc += ' Remates laterales rectos sobre los muebles (sin cascadas al suelo).';
      }
    }

    if (sinkData.hasSink) {
      countertopDesc += ` Incluye ${sinkData.name} instalado bajocubierta${sinkCabLabel ? ` sobre "${sinkCabLabel}"` : ''}.`;
    }
    if (cooktopData.hasCooktop) {
      countertopDesc += ` Incluye ${cooktopData.name} empotrada${cooktopCabLabel ? ` sobre "${cooktopCabLabel}"` : ''}.`;
    }
  }

  // 5. Suelo, Muros y Decoración de Estancia reales
  const floorDesc = resolveFloorDescription(floorType);
  const wallFinishDesc = resolveWallDescription(wallColor);
  const spaceDecorationSummary = resolveSpaceDecorationSummary(spaceDecoration);

  // 6. Ordenamiento espacial y clasificación exhaustiva pieza por pieza
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

  sortedCabinets.forEach((cab, idx) => {
    const cat = cab.type || 'base';
    if (cat === 'base') breakdown.baseCount++;
    else if (cat === 'wall') breakdown.wallCount++;
    else if (cat === 'tall') breakdown.tallCount++;
    else if (cat === 'island') breakdown.islandCount++;
    else if (cat === 'decoration') breakdown.decoCount++;
    else if (cat === 'closet') breakdown.closetCount++;

    const categoryLabels: Record<string, string> = {
      base: 'Mueble Bajo',
      wall: 'Mueble Aéreo Superior',
      tall: 'Torre Despensa Alta',
      island: 'Módulo de Isla Central',
      decoration: 'Electrodoméstico / Decorativo',
      closet: 'Módulo de Clóset',
    };

    const label = getCabinetLabel(cab, idx);
    const widthCm = Math.round(cab.width);
    const heightCm = Math.round(cab.height);
    const depthCm = Math.round(cab.depth);
    const posX = Number((cab.position?.[0] || 0).toFixed(1));
    const posY = Number((cab.position?.[1] || 0).toFixed(1));
    const posZ = Number((cab.position?.[2] || 0).toFixed(1));
    const rotDeg = Math.round((((cab.rotation || 0) * 180) / Math.PI) % 360);

    const fHex = cab.doorColor || cab.drawerFrontColor || cab.color || primaryFrontHex;
    const fColor = getFriendlyColorName(fHex);
    const sHex = cab.structureColor || cab.color || '#FFFFFF';
    const sColor = getFriendlyColorName(sHex);
    const frontMat =
      cab.doorMaterial === 'hpl' || cab.drawerFrontMaterial === 'hpl' ? 'HPL' : 'Melamina';
    const grainDir = cab.grainDirection;

    const classification = classifyCabinetFront(cab);
    const cabHw = cab.handleConfig
      ? describeHandleConfig(cab.handleConfig, golaSystem || 'none').summary
      : globalHardware.summary;

    const hostsSink = Boolean(sinkSpec && countertopConfig?.sinkCabinetId === cab.id);
    const hostsCooktop = Boolean(cooktopSpec && countertopConfig?.cooktopCabinetId === cab.id);
    const isOpenInViewport = Boolean(
      cab.isOpen || (cab.openElements && Object.values(cab.openElements).some(Boolean))
    );

    const parts: string[] = [
      `[Módulo #${idx + 1}] ${label} (${categoryLabels[cat] || cat}): ${widthCm}cm ancho × ${heightCm}cm alto × ${depthCm}cm fondo, orientación ${rotDeg}°, posición [${posX}, ${posY}, ${posZ}] cm.`,
    ];

    if (classification.frontType === 'appliance') {
      parts.push(`Detalle: ${classification.nicheDescription}.`);
    } else {
      parts.push(
        `Frente: ${fColor} (${frontMat}${grainDir ? `, veta ${grainDir}` : ''}); casco/estructura: ${sColor}.`
      );
      if (classification.frontType === 'drawers') {
        parts.push(`Configuración exacta: ${classification.drawerStyle} (conservar exactamente ${classification.drawersCount} divisiones horizontales).`);
      } else if (classification.frontType === 'doors') {
        parts.push(
          `Configuración exacta: ${classification.doorStyle}${isOpenInViewport ? ' (puerta abierta en captura 3D)' : ' (mantener cerrada y opaca)'}.`
        );
      } else if (classification.frontType === 'open_niche') {
        parts.push(`Configuración exacta: ${classification.nicheDescription}.`);
      } else if (classification.frontType === 'special') {
        const combined = [classification.drawerStyle, classification.doorStyle, classification.nicheDescription]
          .filter(Boolean)
          .join(' + ');
        parts.push(`Configuración combinada exacta: ${combined}.`);
      }
      if (cab.handleConfig) {
        parts.push(`Herraje propio: ${cabHw}.`);
      }
    }

    if (hostsSink && sinkSpec) {
      parts.push(`Aloja lavaplatos bajocubierta ${sinkSpec.name} con grifería monomando arriba.`);
    }
    if (hostsCooktop && cooktopSpec) {
      parts.push(`Aloja encimera empotrada ${cooktopSpec.name} arriba.`);
    }
    if (cab.leftCoverPanel?.enabled) {
      const lCol = getFriendlyColorName(cab.leftCoverPanel.color || fHex);
      parts.push(`Panel costado izquierdo en ${lCol}${cab.leftCoverPanel.extendToFloor ? ' extendido al suelo' : ''}.`);
    }
    if (cab.rightCoverPanel?.enabled) {
      const rCol = getFriendlyColorName(cab.rightCoverPanel.color || fHex);
      parts.push(`Panel costado derecho en ${rCol}${cab.rightCoverPanel.extendToFloor ? ' extendido al suelo' : ''}.`);
    }

    const sentence = parts.join(' ');

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
      frontType: classification.frontType,
      doorsCount: classification.doorsCount,
      doorStyle: classification.doorStyle,
      drawersCount: classification.drawersCount,
      drawerStyle: classification.drawerStyle,
      shelvesCount: classification.shelvesCount,
      isOpenNiche: classification.isOpenNiche,
      nicheDescription: classification.nicheDescription,
      frontColorName: fColor,
      frontColorHex: fHex,
      structureColorName: sColor,
      frontMaterial: frontMat,
      grainDirection: grainDir,
      handleStyle: cabHw,
      leftCoverPanel: Boolean(cab.leftCoverPanel?.enabled),
      rightCoverPanel: Boolean(cab.rightCoverPanel?.enabled),
      hingeOrientation: cab.hingeSide,
      isOpenInViewport,
      hostsSink,
      hostsCooktop,
      summarySentence: sentence,
    });
  });

  // 7. Isla y revestimiento trasero/lateral de isla
  const hasIsland = breakdown.islandCount > 0;
  const islandDirectives = hasIsland
    ? {
        allowed: true,
        description: `Isla central activa (${breakdown.islandCount} módulo/s): mantener exactamente su forma, ubicación, cantidad de frentes y remates tal como muestra la captura 3D.`,
      }
    : {
        allowed: false,
        description:
          'Este proyecto cuenta con 0 módulos de isla: el pavimento central y de primer plano es un área completamente abierta y despejada tal como muestra la captura 3D.',
      };

  let islandBackDesc = '';
  if (hasIsland && islandBackConfig?.enabled) {
    const backMat =
      islandBackConfig.materialType === 'countertop'
        ? `mismo material de cubierta (${stoneName}) bajando hasta el suelo`
        : `${islandBackConfig.decorativeMaterial === 'hpl' ? 'HPL' : 'Melamina'} en ${getFriendlyColorName(islandBackConfig.decorativeColor)} (${islandBackConfig.heightMode === 'to_floor' ? 'hasta el suelo' : 'sobre zócalo'})`;
    islandBackDesc = `Panel trasero decorativo de isla en ${backMat}`;
    if (islandBackConfig.sidesEnabled) {
      const sides = [
        islandBackConfig.sideLeftEnabled !== false ? 'izquierdo' : null,
        islandBackConfig.sideRightEnabled !== false ? 'derecho' : null,
      ].filter(Boolean);
      if (sides.length > 0) {
        islandBackDesc += `, con costados laterales (${sides.join(' y ')}, profundidad ${islandBackConfig.sideDepthCm || 60}cm)`;
      }
    }
    islandBackDesc += '.';
  }

  // 8. Elementos arquitectónicos (puertas, ventanas, pilares) — ahora SÍ incluidos en el prompt
  const archList = (architecturalElements || []).map((el) => ({
    type: el.type,
    name: el.name || (el.type === 'window' ? 'Ventana' : el.type === 'door' ? 'Puerta' : 'Pilar'),
    widthCm: Math.round(el.width || 0),
    heightCm: Math.round(el.height || 0),
    elevationCm: Math.round(el.elevation || 0),
    rotationDeg: Math.round((((el.rotation || 0) * 180) / Math.PI) % 360),
    isOpen: Boolean(el.isOpen),
    positionCm: {
      x: Number((el.position?.[0] || 0).toFixed(1)),
      y: Number((el.position?.[1] || 0).toFixed(1)),
      z: Number((el.position?.[2] || 0).toFixed(1)),
    },
  }));

  const windowsCount = archList.filter((a) => a.type === 'window').length;
  const doorsArchCount = archList.filter((a) => a.type === 'door').length;
  const pillarsCount = archList.filter((a) => a.type === 'pillar').length;

  const archSectionText =
    archList.length > 0
      ? archList
          .map(
            (a, i) =>
              `${i + 1}. ${a.name} (${a.type}): ${a.widthCm}cm ancho × ${a.heightCm}cm alto, elevación ${a.elevationCm}cm desde piso, rotación ${a.rotationDeg}°, posición [${a.positionCm.x}, ${a.positionCm.y}, ${a.positionCm.z}] cm.`
          )
          .join('\n')
      : 'Ningún vano ni pilar adicional (0 ventanas, 0 puertas arquitectónicas, 0 pilares). Mantener los muros completamente cerrados y lisos tal como aparecen en la captura 3D.';

  // 9. Directivas estrictas de fidelidad (alineadas con el proyecto real, sin contradicciones)
  const strictNegativeDirectives = [
    `INVENTARIO CERRADO (${detailedList.length} ELEMENTOS): Reproducir única y exclusivamente los ${detailedList.length} elementos listados en su posición, escala y proporción exacta de la captura 3D.`,
    'FIDELIDAD DE FRENTES: Conservar exactamente el tipo de frente de cada módulo (puertas cerradas opacas, cantidad exacta de cajones horizontales, repisas abiertas solo donde existan).',
    islandDirectives.description,
    `CUBIERTA EXACTA: ${countertopDesc}`,
    `SOPORTE INFERIOR: ${socleDirective}`,
    `ACABADOS Y COLORES REALES: ${woodToneDetails}`,
    windowsCount === 0
      ? 'MUROS SIN VENTANAS INVENTADAS: Existen 0 ventanas modeladas; mantener los muros ciegos exactos de la captura 3D.'
      : `ARQUITECTURA FIJA: Conservar exactamente ${windowsCount} ventana(s), ${doorsArchCount} puerta(s) y ${pillarsCount} pilar(es) en su ubicación y tamaño exactos.`,
  ];

  // 10. Especificación técnica completa pieza por pieza para el prompt
  const rawTextPromptSpec = `
INVENTARIO TÉCNICO INMUTABLE DEL PROYECTO (FUENTE DE VERDAD 1:1):
TOTAL DE ELEMENTOS EN ESCENA: ${detailedList.length}
- Muebles Bajos: ${breakdown.baseCount}
- Muebles Aéreos Superiores: ${breakdown.wallCount}
- Torres Despensa Altas: ${breakdown.tallCount}
- Módulos de Isla: ${breakdown.islandCount}
- Electrodomésticos / Decorativos modelados: ${breakdown.decoCount}
- Módulos de Clóset: ${breakdown.closetCount}

DETALLE PIEZA POR PIEZA:
${detailedList.map((item) => `${item.index}. ${item.summarySentence}`).join('\n')}

CUBIERTA Y MESÓN:
- ${countertopDesc}${islandBackDesc ? `\n- Trasera/Costados de Isla: ${islandBackDesc}` : ''}

SOPORTE DE BASE:
- ${socleDirective}

HERRAJES Y TIRADORES:
- ${globalHardware.summary}

ELEMENTOS ARQUITECTÓNICOS (PUERTAS / VENTANAS / PILARES):
${archSectionText}

MATERIALIDAD DE ESTANCIA:
- Frentes principales: ${woodToneDetails}
- Muros: ${wallFinishDesc}
- Piso / Pavimento: ${floorDesc}${spaceDecorationSummary ? `\n- Decoración/Revestimientos configurados: ${spaceDecorationSummary}` : ''}
`.trim();

  // Campos legados para compatibilidad
  const islandCabinets = cabinets.filter((c) => c.type === 'island');
  const islandCab = islandCabinets[0];
  const islandRawColor = islandCab?.drawerFrontColor || islandCab?.doorColor || islandCab?.color || primaryFrontHex;
  const islandColorName = getFriendlyColorName(islandRawColor);

  return {
    projectType: 'kitchen',
    totalModulesCount: detailedList.length,
    breakdown,
    hasIsland,
    islandDirectives,
    islandBack: {
      enabled: Boolean(hasIsland && islandBackConfig?.enabled),
      description: islandBackDesc,
    },
    countertop: {
      enabled: hasCountertop,
      materialName: stoneName,
      productName: hasCountertop ? currentCountertopItem?.name || stoneName : 'Sin cubierta',
      finish: stoneFinish,
      colorHex: stoneHex,
      thicknessMm,
      regruesoCm,
      backsplashMode,
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
    hardwareSummary: globalHardware.summary,
    hardwareFinishName: globalHardware.finishName,
    isHandleless: globalHardware.isHandleless,
    finishSummary: {
      primaryFrontColor,
      primaryFrontHex,
      woodToneDetails,
      allFrontFinishes,
      wallColor: wallFinishDesc,
      floorDescription: floorDesc,
      spaceDecorationSummary,
    },
    cabinetsList: detailedList,
    architecturalElements: archList,
    strictNegativeDirectives,
    rawTextPromptSpec,
    cabinetFronts: primaryFrontColor,
    islandFronts: hasIsland ? islandColorName : null,
    woodToneDetails,
    moduleArchitecture: detailedList.map((d) => d.summarySentence).join(' | '),
    hardware: globalHardware.summary,
    flooring: floorDesc,
    wallFinish: wallFinishDesc,
    socleDirective,
  };
}

/**
 * Extractor complementario para el configurador modular de Clóset (useStore)
 * cuando NanoBananaRenderModal se invoca fuera de KitchenConfigurator.
 */
export function extractClosetBimManifest(closetState: any): DetailedBimManifest | null {
  if (!closetState || !Array.isArray(closetState.modules) || closetState.modules.length === 0) {
    return null;
  }

  const heightCm = Math.round(closetState.height || 240);
  const depthCm = Math.round(closetState.depth || 60);
  const globalDoorHex = closetState.doorColor || closetState.structureColor || '#FFFFFF';
  const globalStructHex = closetState.structureColor || '#FFFFFF';
  const primaryFrontColor = getFriendlyColorName(globalDoorHex);
  const structColorName = getFriendlyColorName(globalStructHex);

  let cursorX = 0;
  const detailedList: DetailedCabinetItem[] = closetState.modules.map((mod: any, idx: number) => {
    const w = Math.round(mod.width || 60);
    const centerX = Number((cursorX + w / 2).toFixed(1));
    cursorX += w;

    const fHex = mod.overrides?.doorColor || mod.overrides?.drawerFrontColor || globalDoorHex;
    const fName = getFriendlyColorName(fHex);
    const sHex = mod.overrides?.structureColor || globalStructHex;
    const sName = getFriendlyColorName(sHex);
    const hasDoors = Boolean(mod.doors);
    const drawersCount = Number(mod.drawers || 0);
    const shelvesCount = Number(mod.shelves || 0);
    const isOpen = Boolean(mod.overrides?.isOpen);

    const frontType: DetailedCabinetItem['frontType'] = hasDoors
      ? 'doors'
      : drawersCount > 0
      ? 'special'
      : 'open_niche';
    const doorsCount = hasDoors ? (w >= 75 ? 2 : 1) : 0;
    const doorStyle = hasDoors
      ? `${doorsCount === 2 ? '2 puertas' : '1 puerta'} batiente lisa${isOpen ? ' (abierta en captura)' : ' cerrada y opaca'}`
      : '';
    const drawerStyle = drawersCount > 0 ? `${drawersCount} cajones horizontales` : '';
    const nicheDescription = !hasDoors
      ? `Módulo abierto con ${shelvesCount} repisas${mod.hasHanger ? ' y barra colgador' : ''}${drawersCount > 0 ? ` + ${drawersCount} cajones` : ''}`
      : undefined;

    const sentence = `[Módulo Clóset #${idx + 1}] Cuerpo ${idx + 1}: ${w}cm ancho × ${heightCm}cm alto × ${depthCm}cm fondo. Frente: ${fName}, estructura: ${sName}. ${hasDoors ? doorStyle : nicheDescription}.`;

    return {
      index: idx + 1,
      id: mod.id || `mod_${idx + 1}`,
      category: 'closet',
      categoryLabel: 'Módulo de Clóset',
      label: `Módulo Clóset ${idx + 1}`,
      widthCm: w,
      heightCm,
      depthCm,
      positionCm: { x: centerX, y: heightCm / 2, z: 0 },
      rotationDeg: 0,
      frontType,
      doorsCount,
      doorStyle,
      drawersCount,
      drawerStyle,
      shelvesCount,
      isOpenNiche: !hasDoors,
      nicheDescription,
      frontColorName: fName,
      frontColorHex: fHex,
      structureColorName: sName,
      handleStyle: 'Según captura 3D',
      leftCoverPanel: false,
      rightCoverPanel: false,
      isOpenInViewport: isOpen,
      summarySentence: sentence,
    };
  });

  const socleColorName = getFriendlyColorName(closetState.socleColor || globalStructHex);
  const socleDirective = closetState.showSocle
    ? `Zócalo inferior cerrado en acabado ${socleColorName} exactamente como muestra la captura 3D.`
    : closetState.showLegs
    ? 'Apoyo sobre patas individuales visibles exactamente como muestra la captura 3D.'
    : 'Base directa al piso exactamente como muestra la captura 3D.';

  const woodToneDetails = `${primaryFrontColor} (${globalDoorHex}), estructura en ${structColorName}. Conservar exactamente el tono y textura visible en la captura 3D.`;

  const rawTextPromptSpec = `
INVENTARIO TÉCNICO INMUTABLE DE CLÓSET MODULAR (FUENTE DE VERDAD 1:1):
TOTAL DE MÓDULOS: ${detailedList.length} (Altura: ${heightCm}cm, Fondo: ${depthCm}cm)

DETALLE PIEZA POR PIEZA:
${detailedList.map((item) => `${item.index}. ${item.summarySentence}`).join('\n')}

SOPORTE DE BASE:
- ${socleDirective}

MATERIALIDAD:
- Frentes: ${woodToneDetails}
`.trim();

  return {
    projectType: 'closet',
    totalModulesCount: detailedList.length,
    breakdown: {
      baseCount: 0,
      wallCount: 0,
      tallCount: 0,
      islandCount: 0,
      decoCount: 0,
      closetCount: detailedList.length,
    },
    hasIsland: false,
    islandDirectives: {
      allowed: false,
      description: 'Proyecto de clóset modular sin isla; mantener el piso frontal completamente despejado.',
    },
    countertop: {
      enabled: false,
      materialName: 'Sin cubierta',
      productName: 'Sin cubierta',
      finish: 'N/A',
      colorHex: 'N/A',
      thicknessMm: 0,
      regruesoCm: 0,
      backsplashHeightCm: 0,
      hasWaterfallLeft: false,
      hasWaterfallRight: false,
      sink: { hasSink: false, name: 'Sin fregadero', bowls: 0, installation: 'N/A' },
      cooktop: { hasCooktop: false, name: 'Sin encimera', burners: 0, fuelType: '' },
      description: 'Sin cubierta de cocina (mueble de clóset).',
    },
    socle: {
      hasClosedSocle: Boolean(closetState.showSocle),
      heightCm: 10,
      finishName: socleColorName,
      directive: socleDirective,
    },
    hardwareSummary: 'Herrajes y tiradores exactamente como se muestran en la captura 3D',
    finishSummary: {
      primaryFrontColor,
      primaryFrontHex: globalDoorHex,
      woodToneDetails,
      wallColor: 'Muros de estancia exactamente como aparecen en la captura 3D',
      floorDescription: 'Piso de estancia exactamente como aparece en la captura 3D',
    },
    cabinetsList: detailedList,
    architecturalElements: [],
    strictNegativeDirectives: [
      `Reproducir exactamente los ${detailedList.length} módulos del clóset sin agregar ni quitar cuerpos, repisas ni cajones.`,
      'Conservar medidas, proporciones, puertas cerradas/abiertas y acabados de la captura 3D.',
    ],
    rawTextPromptSpec,
    cabinetFronts: primaryFrontColor,
    islandFronts: null,
    woodToneDetails,
    moduleArchitecture: detailedList.map((d) => d.summarySentence).join(' | '),
    hardware: 'Según captura 3D',
    flooring: 'Según captura 3D',
    wallFinish: 'Según captura 3D',
    socleDirective,
  };
}
