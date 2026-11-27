import { useAdminStore } from '../store/adminStore';
import { useKitchenStore, CabinetType, GolaSystem, getCabinetLabel } from '../store/kitchenStore';
import { getCabinetSpecsFromTool } from './kitchenCollision';
import { WALL_COLOR_OPTIONS, FLOOR_TYPE_OPTIONS } from './kitchenMaterials';
import {
  isCabinetWithDoors,
  isCabinetWithSplitDoors,
  getDefaultShelvesCount,
  getSplitCabinetShelvesCounts,
} from './kitchenManufacturing';
import {
  DEFAULT_QSTONE_CATALOG,
  QSTONE_SINKS,
  FDV_COOKTOPS,
  SinkModelId,
  CooktopModelId,
} from '../types/countertop';
import { HANDLE_CATALOG, HandleModelId, HandleFinish } from '../types/handle';
import { MEP_TYPE_CONFIGS, MEP_PRESETS, MepType, MepPresetType } from '../types/mep';
import { analyzeRoomWalls, calculatePolygonArea } from './roomGeometry';

export interface AiModuleCatalogEntry {
  tool: string;
  category: 'base' | 'wall' | 'tall' | 'island' | 'decoration';
  name: string;
  variant: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  defaultHeight: number;
  minHeight: number;
  maxHeight: number;
  defaultDepth: number;
  minDepth: number;
  maxDepth: number;
  fixedWidth?: boolean;
  fixedDimensions?: boolean;
  notes?: string;
}

export interface AiBoardTextureEntry {
  id: string;
  name: string;
  brand: string;
  category: string;
  finish: string;
  thicknessMm: number;
  material: 'melamina' | 'hpl';
  url: string;
  stock: number;
}

export interface AiCountertopEntry {
  id: string;
  name: string;
  materialType: 'quarzo' | 'sinterizado' | 'hpl_abet';
  thicknessMm: number;
  colorHex: string;
  finish: string;
}

export interface AiCatalogSnapshot {
  modules: AiModuleCatalogEntry[];
  boardTextures: AiBoardTextureEntry[];
  countertops: AiCountertopEntry[];
  sinks: Array<{ id: SinkModelId; name: string; bowls: number; minCabinetWidthCm: number }>;
  cooktops: Array<{ id: CooktopModelId; name: string; burners: number; minCabinetWidthCm: number }>;
  handles: Array<{
    id: HandleModelId;
    name: string;
    category: string;
    finishes: HandleFinish[];
    lengths: number[];
  }>;
  golaSystems: GolaSystem[];
  wallColors: Array<{ id: string; name: string; hex: string; category: string }>;
  floorTypes: Array<{ id: string; name: string; category: string; primaryColor: string }>;
  mepTypes: Array<{ type: MepType; label: string; defaultElevationCm: number }>;
  mepPresets: Array<{ id: MepPresetType; name: string }>;
}

// Rangos 100% sincronizados con KitchenModuleContextMenu.tsx y especificaciones reales de herrajes/electrodomésticos
export const AI_ALLOWED_MODULES: AiModuleCatalogEntry[] = [
  // Bases
  { tool: 'place_base_1_door', category: 'base', name: 'Base 1 Puerta', variant: '1_door', defaultWidth: 60, minWidth: 30, maxWidth: 60, defaultHeight: 80, minHeight: 70, maxHeight: 100, defaultDepth: 60, minDepth: 35, maxDepth: 80, notes: 'Máximo 60cm por ser 1 hoja' },
  { tool: 'place_base_2_doors', category: 'base', name: 'Base 2 Puertas', variant: '2_doors', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 80, minHeight: 70, maxHeight: 100, defaultDepth: 60, minDepth: 35, maxDepth: 80 },
  { tool: 'place_base_1_door_1_drawer', category: 'base', name: 'Base 1 Puerta + 1 Cajón', variant: '1_door_1_drawer', defaultWidth: 60, minWidth: 35, maxWidth: 60, defaultHeight: 80, minHeight: 70, maxHeight: 100, defaultDepth: 60, minDepth: 40, maxDepth: 80, notes: 'Máximo 60cm' },
  { tool: 'place_base_4_drawers', category: 'base', name: 'Base 4 Cajones', variant: '4_drawers', defaultWidth: 80, minWidth: 40, maxWidth: 100, defaultHeight: 80, minHeight: 70, maxHeight: 100, defaultDepth: 60, minDepth: 45, maxDepth: 80 },
  { tool: 'place_base_3_drawers_veggie', category: 'base', name: 'Base Verdulero (3 Cajones)', variant: '3_drawers_veggie', defaultWidth: 60, minWidth: 45, maxWidth: 80, defaultHeight: 80, minHeight: 70, maxHeight: 100, defaultDepth: 60, minDepth: 45, maxDepth: 80 },
  { tool: 'place_base_2_pot_drawers', category: 'base', name: 'Base 2 Olleros', variant: '2_pot_drawers', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 80, minHeight: 70, maxHeight: 100, defaultDepth: 60, minDepth: 45, maxDepth: 80 },
  { tool: 'place_base_2_drawers_1_pot', category: 'base', name: 'Base 2 Cajones + 1 Ollero', variant: '2_drawers_1_pot', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 80, minHeight: 70, maxHeight: 100, defaultDepth: 60, minDepth: 45, maxDepth: 80 },
  { tool: 'place_base_spice_rack', category: 'base', name: 'Base Especiero Extraíble', variant: 'spice_rack', defaultWidth: 20, minWidth: 15, maxWidth: 30, defaultHeight: 80, minHeight: 70, maxHeight: 100, defaultDepth: 60, minDepth: 45, maxDepth: 80, notes: 'Ancho estricto 15-30cm' },
  { tool: 'place_base_wine_rack', category: 'base', name: 'Botellero Base', variant: 'wine_rack', defaultWidth: 20, minWidth: 15, maxWidth: 40, defaultHeight: 80, minHeight: 70, maxHeight: 100, defaultDepth: 60, minDepth: 35, maxDepth: 80 },
  { tool: 'place_base_sink_2_doors', category: 'base', name: 'Base Lavaplatos (2 Puertas)', variant: 'base_sink_2_doors', defaultWidth: 80, minWidth: 80, maxWidth: 120, defaultHeight: 80, minHeight: 70, maxHeight: 100, defaultDepth: 60, minDepth: 55, maxDepth: 80, notes: 'Obligatorio para lavaplatos: >=80cm (1 tina) o >=90cm (2 tinas)' },
  { tool: 'place_base_cooktop_3_drawers', category: 'base', name: 'Base Encimera (3 Cajones, 1° Fijo)', variant: 'base_cooktop_3_drawers', defaultWidth: 80, minWidth: 80, maxWidth: 120, defaultHeight: 80, minHeight: 70, maxHeight: 100, defaultDepth: 60, minDepth: 55, maxDepth: 80, notes: 'Mínimo normativo 80cm (90cm para encimera FDV 90 de 5 platos)' },
  { tool: 'place_base_corner_blind', category: 'base', name: 'Base Esquinero Ciego', variant: 'corner_blind_right', defaultWidth: 110, minWidth: 95, maxWidth: 140, defaultHeight: 80, minHeight: 70, maxHeight: 100, defaultDepth: 60, minDepth: 55, maxDepth: 80, notes: 'Usar en esquinas de cocinas en L o U' },
  { tool: 'place_base_corner_l', category: 'base', name: 'Base Esquinero en L (90x90)', variant: 'corner_l', defaultWidth: 90, minWidth: 90, maxWidth: 90, defaultHeight: 80, minHeight: 70, maxHeight: 100, defaultDepth: 90, minDepth: 90, maxDepth: 90, fixedWidth: true, notes: 'MEDIDA FIJA 90x90cm en esquinas de cocinas en L o U' },

  // Aéreos / Murales
  { tool: 'place_wall_1_door', category: 'wall', name: 'Aéreo 1 Puerta', variant: 'wall_1_door', defaultWidth: 60, minWidth: 30, maxWidth: 60, defaultHeight: 70, minHeight: 30, maxHeight: 120, defaultDepth: 35, minDepth: 25, maxDepth: 45, notes: 'Máximo 60cm' },
  { tool: 'place_wall_2_doors', category: 'wall', name: 'Aéreo 2 Puertas', variant: 'wall_2_doors', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 70, minHeight: 30, maxHeight: 120, defaultDepth: 35, minDepth: 25, maxDepth: 45 },
  { tool: 'place_wall_lift_up', category: 'wall', name: 'Aéreo Puerta Elevable Aventos', variant: 'wall_lift_up', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 40, minHeight: 30, maxHeight: 60, defaultDepth: 35, minDepth: 25, maxDepth: 45 },
  { tool: 'place_wall_lift_up_double', category: 'wall', name: 'Aéreo Doble Elevable', variant: 'wall_lift_up_double', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 70, minHeight: 55, maxHeight: 100, defaultDepth: 35, minDepth: 25, maxDepth: 45 },
  { tool: 'place_wall_microwave_niche', category: 'wall', name: 'Aéreo Nicho Microondas', variant: 'wall_microwave_niche', defaultWidth: 60, minWidth: 60, maxWidth: 60, defaultHeight: 80, minHeight: 70, maxHeight: 100, defaultDepth: 38, minDepth: 35, maxDepth: 45, fixedWidth: true, notes: 'ANCHO FIJO 60cm por nicho microondas' },
  { tool: 'place_wall_open', category: 'wall', name: 'Aéreo Abierto Repisas', variant: 'wall_open', defaultWidth: 60, minWidth: 30, maxWidth: 100, defaultHeight: 70, minHeight: 30, maxHeight: 120, defaultDepth: 35, minDepth: 25, maxDepth: 45 },
  { tool: 'place_wall_corner_blind', category: 'wall', name: 'Aéreo Esquinero Ciego', variant: 'wall_corner_blind_right', defaultWidth: 70, minWidth: 65, maxWidth: 100, defaultHeight: 70, minHeight: 40, maxHeight: 110, defaultDepth: 35, minDepth: 30, maxDepth: 45 },
  { tool: 'place_wall_wine_rack', category: 'wall', name: 'Aéreo Botellero', variant: 'wall_wine_rack', defaultWidth: 20, minWidth: 15, maxWidth: 40, defaultHeight: 70, minHeight: 40, maxHeight: 100, defaultDepth: 35, minDepth: 25, maxDepth: 40 },
  { tool: 'place_wall_hood_new_flow', category: 'wall', name: 'Aéreo Campana New Flow 60', variant: 'wall_hood_new_flow', defaultWidth: 60, minWidth: 60, maxWidth: 60, defaultHeight: 70, minHeight: 55, maxHeight: 95, defaultDepth: 35, minDepth: 32, maxDepth: 40, fixedWidth: true, notes: 'ANCHO ESTRICTAMENTE FIJO 60cm (NO modificable, aloja campana Kubli Neu Flow 60). Fondo 32-40cm. Centrar sobre encimera.' },
  { tool: 'place_wall_door_shelf', category: 'wall', name: 'Aéreo Puerta + Repisa Inferior', variant: 'wall_door_shelf', defaultWidth: 60, minWidth: 40, maxWidth: 80, defaultHeight: 80, minHeight: 60, maxHeight: 110, defaultDepth: 35, minDepth: 25, maxDepth: 45 },

  // Torres / Despensas
  { tool: 'place_tall_1_door', category: 'tall', name: 'Torre Despensa 1 Puerta', variant: 'tall_1_door', defaultWidth: 60, minWidth: 40, maxWidth: 60, defaultHeight: 215, minHeight: 180, maxHeight: 240, defaultDepth: 60, minDepth: 45, maxDepth: 80, notes: 'Máximo 60cm' },
  { tool: 'place_tall_split_2_doors', category: 'tall', name: 'Torre 2 Puertas (Línea Base)', variant: 'tall_split_2_doors', defaultWidth: 60, minWidth: 40, maxWidth: 60, defaultHeight: 215, minHeight: 180, maxHeight: 240, defaultDepth: 60, minDepth: 45, maxDepth: 80, notes: 'Máximo 60cm' },
  { tool: 'place_tall_2_doors', category: 'tall', name: 'Torre Despensa 2 Puertas', variant: 'tall_2_doors', defaultWidth: 80, minWidth: 70, maxWidth: 100, defaultHeight: 215, minHeight: 180, maxHeight: 240, defaultDepth: 60, minDepth: 45, maxDepth: 80 },
  { tool: 'place_tall_oven_micro', category: 'tall', name: 'Torre Horno + Microondas', variant: 'tall_oven_micro', defaultWidth: 60, minWidth: 60, maxWidth: 60, defaultHeight: 215, minHeight: 200, maxHeight: 240, defaultDepth: 60, minDepth: 58, maxDepth: 70, fixedWidth: true, notes: 'ANCHO FIJO 60cm para horno empotrado estándar' },
  { tool: 'place_tall_oven_vent', category: 'tall', name: 'Torre Hornos Vent. Técnica', variant: 'tall_oven_vent', defaultWidth: 60, minWidth: 60, maxWidth: 60, defaultHeight: 215, minHeight: 200, maxHeight: 240, defaultDepth: 60, minDepth: 58, maxDepth: 70, fixedWidth: true, notes: 'ANCHO FIJO 60cm para hornos empotrados' },
  { tool: 'place_tall_microwave_niche', category: 'tall', name: 'Torre Nicho Microondas', variant: 'tall_microwave_niche', defaultWidth: 60, minWidth: 60, maxWidth: 60, defaultHeight: 215, minHeight: 190, maxHeight: 240, defaultDepth: 60, minDepth: 55, maxDepth: 70, fixedWidth: true, notes: 'ANCHO FIJO 60cm' },
  { tool: 'place_tall_inner_drawers', category: 'tall', name: 'Torre Cajones Interiores', variant: 'tall_inner_drawers', defaultWidth: 60, minWidth: 45, maxWidth: 60, defaultHeight: 215, minHeight: 180, maxHeight: 240, defaultDepth: 60, minDepth: 50, maxDepth: 80, notes: 'Máximo 60cm' },
  { tool: 'place_tall_open', category: 'tall', name: 'Torre Repisas a la Vista', variant: 'tall_open', defaultWidth: 60, minWidth: 40, maxWidth: 80, defaultHeight: 215, minHeight: 180, maxHeight: 240, defaultDepth: 60, minDepth: 35, maxDepth: 70 },
  { tool: 'place_tall_wine_rack', category: 'tall', name: 'Torre Botellero', variant: 'tall_wine_rack', defaultWidth: 30, minWidth: 20, maxWidth: 40, defaultHeight: 215, minHeight: 180, maxHeight: 240, defaultDepth: 60, minDepth: 40, maxDepth: 70 },

  // Islas
  { tool: 'place_island', category: 'island', name: 'Isla 2 Olleros', variant: '2_pot_drawers', defaultWidth: 90, minWidth: 60, maxWidth: 120, defaultHeight: 80, minHeight: 75, maxHeight: 95, defaultDepth: 80, minDepth: 60, maxDepth: 110 },
  { tool: 'place_island_4_drawers', category: 'island', name: 'Isla 4 Cajones', variant: '4_drawers', defaultWidth: 80, minWidth: 50, maxWidth: 100, defaultHeight: 80, minHeight: 75, maxHeight: 95, defaultDepth: 80, minDepth: 60, maxDepth: 110 },
  { tool: 'place_island_2_drawers_1_pot', category: 'island', name: 'Isla 2 Cajones + 1 Ollero', variant: '2_drawers_1_pot', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 80, minHeight: 75, maxHeight: 95, defaultDepth: 80, minDepth: 60, maxDepth: 110 },
  { tool: 'place_island_1_door', category: 'island', name: 'Isla 1 Puerta', variant: '1_door', defaultWidth: 60, minWidth: 40, maxWidth: 60, defaultHeight: 80, minHeight: 75, maxHeight: 95, defaultDepth: 80, minDepth: 60, maxDepth: 110, notes: 'Máximo 60cm' },
  { tool: 'place_island_2_doors', category: 'island', name: 'Isla 2 Puertas', variant: '2_doors', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 80, minHeight: 75, maxHeight: 95, defaultDepth: 80, minDepth: 60, maxDepth: 110 },
  { tool: 'place_island_wine_rack', category: 'island', name: 'Botellero Isla', variant: 'wine_rack', defaultWidth: 25, minWidth: 20, maxWidth: 40, defaultHeight: 80, minHeight: 75, maxHeight: 95, defaultDepth: 80, minDepth: 60, maxDepth: 110 },

  // Equipamiento y Decoración (MEDIDAS 100% FIJAS DEL MODELO/ELECTRODOMÉSTICO)
  { tool: 'place_deco_fridge', category: 'decoration', name: 'Refrigerador SBS 513L', variant: 'deco_fridge', defaultWidth: 91, minWidth: 91, maxWidth: 91, defaultHeight: 177, minHeight: 177, maxHeight: 177, defaultDepth: 67, minDepth: 67, maxDepth: 67, fixedWidth: true, fixedDimensions: true, notes: 'MEDIDAS FIJAS 91x177x67cm (requiere despeje frontal >=80cm)' },
  { tool: 'place_deco_dishwasher', category: 'decoration', name: 'Lavavajillas FDV Active 12C', variant: 'deco_dishwasher', defaultWidth: 59.8, minWidth: 59.8, maxWidth: 59.8, defaultHeight: 84.5, minHeight: 84.5, maxHeight: 84.5, defaultDepth: 60, minDepth: 60, maxDepth: 60, fixedWidth: true, fixedDimensions: true, notes: 'MEDIDAS FIJAS 60x84.5x60cm (ubicar junto al lavaplatos)' },
  { tool: 'place_deco_stove', category: 'decoration', name: 'Cocina Libre FDV 90', variant: 'deco_stove', defaultWidth: 90, minWidth: 90, maxWidth: 90, defaultHeight: 90, minHeight: 90, maxHeight: 90, defaultDepth: 60, minDepth: 60, maxDepth: 60, fixedWidth: true, fixedDimensions: true, notes: 'MEDIDAS FIJAS 90x90x60cm' },
  { tool: 'place_deco_hood', category: 'decoration', name: 'Campana Mural FDV Conic 90', variant: 'deco_hood', defaultWidth: 89.8, minWidth: 89.8, maxWidth: 89.8, defaultHeight: 70, minHeight: 70, maxHeight: 70, defaultDepth: 50, minDepth: 50, maxDepth: 50, fixedWidth: true, fixedDimensions: true, notes: 'MEDIDAS FIJAS 90x70x50cm (centrar sobre cocina/encimera)' },
  { tool: 'place_deco_plant', category: 'decoration', name: 'Planta Interior Decorativa', variant: 'deco_plant', defaultWidth: 40, minWidth: 40, maxWidth: 40, defaultHeight: 95, minHeight: 95, maxHeight: 95, defaultDepth: 40, minDepth: 40, maxDepth: 40, fixedWidth: true, fixedDimensions: true },
];

const DEFAULT_FALLBACK_TEXTURES: AiBoardTextureEntry[] = [
  { id: 'def_mas_blanco_18', name: 'Masisa Blanco', brand: 'Masisa', category: 'solidos', finish: 'Mate', thicknessMm: 18, material: 'melamina', url: '#FFFFFF', stock: 50 },
  { id: 'def_mas_negro_18', name: 'Masisa Negro', brand: 'Masisa', category: 'solidos', finish: 'Mate', thicknessMm: 18, material: 'melamina', url: '#171717', stock: 50 },
];

export function findCatalogEntryForCabinet(cab: Pick<CabinetType, 'type' | 'variant'>): AiModuleCatalogEntry | undefined {
  const v = (cab.variant || '').toLowerCase();
  const byTypeAndVariant = AI_ALLOWED_MODULES.find(
    (m) =>
      m.category === cab.type &&
      (m.variant.toLowerCase() === v ||
        (v.startsWith('corner_blind') && m.variant.startsWith('corner_blind')) ||
        (v.startsWith('wall_corner_blind') && m.variant.startsWith('wall_corner_blind')))
  );
  if (byTypeAndVariant) return byTypeAndVariant;
  return AI_ALLOWED_MODULES.find((m) => m.variant.toLowerCase() === v);
}

export function getApprovedBoardTextures(): AiBoardTextureEntry[] {
  const adminTextures = useAdminStore.getState().textures || [];
  const filtered: AiBoardTextureEntry[] = [];

  for (const t of adminTextures) {
    if (!t.active) continue;
    if (t.approvalStatus && t.approvalStatus !== 'approved') continue;
    const stock = t.stock !== undefined ? t.stock : 30;
    if (stock <= 0) continue;

    const cat = String(t.category || '');
    const n = (t.name || '').toLowerCase();
    const b = (t.brand || t.providerName || '').toLowerCase();
    const isStone =
      cat === 'piedras_marmoles' ||
      cat === 'cubiertas_hpl' ||
      n.includes('qstone') ||
      b.includes('qstone') ||
      b.includes('sysprotec');
    const isCountertopHpl = t.thicknessMm === 8 || n.includes('cubierta') || cat === 'cubiertas_hpl';
    if (isStone || isCountertopHpl) continue;

    const url = t.url || t.previewUrl || '#CCCCCC';
    const isHpl =
      cat === 'hpl_autor' ||
      n.includes('abet') ||
      n.includes('hpl') ||
      n.includes('laminati') ||
      url.toLowerCase().includes('abet');

    const fullName = t.name.toLowerCase().includes((t.brand || '').toLowerCase())
      ? t.name
      : `${t.brand ? t.brand + ' ' : ''}${t.name}`;

    filtered.push({
      id: t.id,
      name: fullName.trim(),
      brand: t.brand || t.providerName || 'Catálogo',
      category: cat || 'melamina',
      finish: t.finish || 'Estándar',
      thicknessMm: t.thicknessMm || (isHpl ? 0.9 : 18),
      material: isHpl ? 'hpl' : 'melamina',
      url,
      stock,
    });
  }

  return filtered.length > 0 ? filtered : DEFAULT_FALLBACK_TEXTURES;
}

export function buildAiCatalogSnapshot(): AiCatalogSnapshot {
  const kitchenState = useKitchenStore.getState();
  const boardTextures = getApprovedBoardTextures();
  const activeQstone = (kitchenState.qstoneCatalog?.length ? kitchenState.qstoneCatalog : DEFAULT_QSTONE_CATALOG).filter(
    (q) => q.active !== false
  );

  return {
    modules: AI_ALLOWED_MODULES,
    boardTextures: boardTextures.slice(0, 90),
    countertops: activeQstone.map((q) => ({
      id: q.id,
      name: q.name,
      materialType: q.materialType,
      thicknessMm: q.thicknessMm,
      colorHex: q.colorHex,
      finish: q.finish,
    })),
    sinks: Object.values(QSTONE_SINKS)
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((s) => ({
        id: s.id,
        name: s.name,
        bowls: s.bowls,
        minCabinetWidthCm: s.minCabinetWidthCm,
      })),
    cooktops: Object.values(FDV_COOKTOPS)
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => ({
        id: c.id,
        name: c.name,
        burners: c.burners,
        minCabinetWidthCm: c.minCabinetWidthCm,
      })),
    handles: HANDLE_CATALOG.map((h) => ({
      id: h.id,
      name: h.name,
      category: h.category,
      finishes: h.finishes,
      lengths: h.lengths,
    })),
    golaSystems: ['none', 'aluminum', 'black'],
    wallColors: WALL_COLOR_OPTIONS.map((w) => ({
      id: w.id,
      name: w.name,
      hex: w.hex,
      category: w.category,
    })),
    floorTypes: FLOOR_TYPE_OPTIONS.map((f) => ({
      id: f.id,
      name: f.name,
      category: f.category,
      primaryColor: f.primaryColor,
    })),
    mepTypes: Object.values(MEP_TYPE_CONFIGS).map((m) => ({
      type: m.type,
      label: m.label,
      defaultElevationCm: m.defaultElevationCm,
    })),
    mepPresets: MEP_PRESETS.map((p) => ({
      id: p.id,
      name: p.name,
    })),
  };
}

export interface AiInteractiveElementInfo {
  key: string;
  label: string;
  type: 'door' | 'drawer';
}

export function cabinetSupportsShelves(cab: CabinetType): boolean {
  if (cab.type === 'decoration' || cab.variant?.startsWith('deco_')) return false;
  if (
    cab.variant === 'base_sink_2_doors' ||
    cab.variant === 'sink_2_doors' ||
    cab.variant === 'base_cooktop_3_drawers' ||
    cab.variant === 'cooktop_3_drawers'
  ) {
    return false;
  }
  return (
    isCabinetWithDoors(cab) ||
    cab.variant === 'wall_open' ||
    cab.variant === 'tall_open' ||
    cab.variant === 'tall_terminal_shelves' ||
    cab.variant === 'open'
  );
}

export function getCabinetInteractiveElements(cab: CabinetType): AiInteractiveElementInfo[] {
  if (cab.type === 'decoration' || cab.variant?.startsWith('deco_')) return [];
  const variant = cab.variant;
  if (
    variant === 'wall_open' ||
    variant === 'tall_open' ||
    variant === 'tall_terminal_shelves' ||
    variant === 'open' ||
    variant?.includes('wine_rack')
  ) {
    return [];
  }

  const elements: AiInteractiveElementInfo[] = [];
  const is2Doors =
    variant === '2_doors' ||
    variant === 'wall_2_doors' ||
    variant === 'tall_2_doors' ||
    variant === 'base_sink_2_doors' ||
    variant === 'sink_2_doors' ||
    (!variant && cab.width > 60);
  const is1Door =
    variant === '1_door' ||
    variant === 'wall_1_door' ||
    variant === 'tall_1_door' ||
    (!variant && cab.width <= 60);
  const isCornerBlind =
    variant === 'corner_blind' ||
    variant?.startsWith('corner_blind') ||
    variant?.startsWith('wall_corner_blind');

  if (variant === 'wall_hood_new_flow') {
    elements.push({ key: 'door-0', label: 'Puerta Superior Izq.', type: 'door' });
    elements.push({ key: 'door-1', label: 'Puerta Superior Der.', type: 'door' });
    elements.push({ key: 'hood-visor', label: 'Visera Telescópica Campana', type: 'drawer' });
  } else if (is2Doors) {
    elements.push({ key: 'door-0', label: 'Puerta Izquierda', type: 'door' });
    elements.push({ key: 'door-1', label: 'Puerta Derecha', type: 'door' });
  } else if (is1Door || isCornerBlind) {
    const doorLabel = variant?.startsWith('wall_corner_blind')
      ? 'Puerta Esquinero Aéreo'
      : isCornerBlind
      ? 'Puerta Esquinero'
      : 'Puerta Frontal';
    elements.push({ key: 'door-0', label: doorLabel, type: 'door' });
  } else if (variant === 'tall_split_2_doors') {
    elements.push({ key: 'door-upper', label: 'Puerta Superior', type: 'door' });
    elements.push({ key: 'door-lower', label: 'Puerta Inferior', type: 'door' });
  } else if (variant === 'wall_lift_up_double') {
    elements.push({ key: 'door-upper', label: 'Pta. Elevable Sup.', type: 'door' });
    elements.push({ key: 'door-lower', label: 'Pta. Elevable Inf.', type: 'door' });
  } else if (variant === 'wall_microwave_niche') {
    elements.push({ key: 'door-top', label: 'Pta. Superior Elevable', type: 'door' });
  } else if (variant === 'wall_door_shelf') {
    elements.push({ key: 'door-top', label: 'Puerta Superior', type: 'door' });
  } else if (variant === 'wall_lift_up') {
    elements.push({ key: 'door-lift', label: 'Puerta Elevable', type: 'door' });
  } else if (variant === 'corner_l' || variant === 'base_corner_l') {
    elements.push({ key: 'door-0', label: 'Puerta Escuadra 1', type: 'door' });
    elements.push({ key: 'door-1', label: 'Puerta Escuadra 2', type: 'door' });
  } else if (variant === 'sink_u_drawer') {
    elements.push({ key: 'drawer-0', label: 'Cajón en U (Sifón)', type: 'drawer' });
    elements.push({ key: 'drawer-1', label: 'Cacerolero Inferior', type: 'drawer' });
  } else if (variant === 'tall_inner_drawers') {
    elements.push({ key: 'door-0', label: 'Puerta Despensa 155°', type: 'door' });
    elements.push({ key: 'drawer-0', label: 'Cajón Interior 1 (Sup.)', type: 'drawer' });
    elements.push({ key: 'drawer-1', label: 'Cajón Interior 2', type: 'drawer' });
    elements.push({ key: 'drawer-2', label: 'Cajón Interior 3', type: 'drawer' });
    elements.push({ key: 'drawer-3', label: 'Cajón Interior 4 (Inf.)', type: 'drawer' });
  } else if (
    variant === 'tall_oven_micro' ||
    variant === 'tall_oven_vent' ||
    variant === 'tall_microwave_niche'
  ) {
    if (variant === 'tall_oven_micro' && cab.towerLowerType === 'drawers') {
      elements.push({ key: 'drawer-0', label: 'Cacerolero Inferior 1', type: 'drawer' });
      elements.push({ key: 'drawer-1', label: 'Cacerolero Inferior 2', type: 'drawer' });
    } else {
      elements.push({ key: 'door-lower', label: 'Puerta Inferior', type: 'door' });
    }
    elements.push({ key: 'door-top', label: 'Puerta Superior', type: 'door' });
  } else if (variant === '1_door_1_drawer') {
    elements.push({ key: 'drawer-0', label: 'Cajón Superior', type: 'drawer' });
    elements.push({ key: 'door-0', label: 'Puerta Inferior', type: 'door' });
  } else if (variant === '4_drawers') {
    elements.push({ key: 'drawer-0', label: 'Cajón 1 (Superior)', type: 'drawer' });
    elements.push({ key: 'drawer-1', label: 'Cajón 2', type: 'drawer' });
    elements.push({ key: 'drawer-2', label: 'Cajón 3', type: 'drawer' });
    elements.push({ key: 'drawer-3', label: 'Cajón 4 (Inferior)', type: 'drawer' });
  } else if (variant === '2_pot_drawers') {
    elements.push({ key: 'drawer-0', label: 'Cacerolero Superior', type: 'drawer' });
    elements.push({ key: 'drawer-1', label: 'Cacerolero Inferior', type: 'drawer' });
  } else if (variant === '3_drawers_veggie' || variant === 'base_3_drawers_veggie') {
    elements.push({ key: 'drawer-2', label: 'Cajón 1 (Superior)', type: 'drawer' });
    elements.push({ key: 'drawer-1', label: 'Cajón 2 (Medio)', type: 'drawer' });
    elements.push({ key: 'drawer-0', label: 'Cajón 3 (Inferior)', type: 'drawer' });
  } else if (variant === '2_drawers_1_pot') {
    elements.push({ key: 'drawer-2', label: 'Cajón 1 (Superior)', type: 'drawer' });
    elements.push({ key: 'drawer-1', label: 'Cajón 2 (Medio)', type: 'drawer' });
    elements.push({ key: 'drawer-0', label: 'Cacerolero Inferior', type: 'drawer' });
  } else if (variant === 'base_cooktop_3_drawers' || variant === 'cooktop_3_drawers') {
    elements.push({ key: 'drawer-1', label: 'Cajón 2 (Medio)', type: 'drawer' });
    elements.push({ key: 'drawer-0', label: 'Cacerolero Inferior', type: 'drawer' });
  } else if (variant === 'spice_rack') {
    elements.push({ key: 'drawer-0', label: 'Especiero Extraíble', type: 'drawer' });
  } else if (cab.type === 'closet' || variant?.startsWith('closet_')) {
    const isClosetDoors = Boolean(
      cab.hasDoors || variant === 'closet_2_doors' || variant === 'closet_inner_drawers'
    );
    if (isClosetDoors) {
      if (cab.width > 50) {
        elements.push({ key: 'door-0', label: 'Puerta Izquierda', type: 'door' });
        elements.push({ key: 'door-1', label: 'Puerta Derecha', type: 'door' });
      } else {
        elements.push({ key: 'door-0', label: 'Puerta Clóset', type: 'door' });
      }
    }
    const effDrawersCount =
      cab.drawersCount !== undefined
        ? cab.drawersCount
        : variant === 'closet_drawers'
        ? 4
        : variant === 'closet_mixed' || variant === 'closet_inner_drawers'
        ? 3
        : variant === 'closet_2_doors'
        ? 2
        : 0;
    for (let i = 0; i < effDrawersCount; i++) {
      elements.push({ key: `drawer-${i}`, label: `Cajón ${i + 1}`, type: 'drawer' });
    }
  }

  return elements;
}

export function buildCurrentKitchenStateSummary() {
  const s = useKitchenStore.getState();
  const vertices = s.roomConfig?.vertices || [];
  const wallSegments = analyzeRoomWalls(vertices);
  const areaM2 = calculatePolygonArea(vertices);

  const walls = (s.walls || []).map((w, idx) => {
    const len = Math.round(Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]));
    const seg = wallSegments[idx];
    return {
      index: idx,
      id: w.id,
      label: seg?.label || String.fromCharCode(65 + idx),
      lengthCm: len,
      heightCm: w.height || s.roomConfig.wallHeight || 250,
      thicknessCm: w.thickness || s.roomConfig.wallThickness || 20,
      start: w.start,
      end: w.end,
      isInterior: Boolean(w.isInterior),
    };
  });

  const wallLabelById = new Map<string, string>();
  walls.forEach((w) => wallLabelById.set(w.id, w.label));

  return {
    room: {
      type: s.roomConfig.type,
      areaM2,
      wallHeightCm: s.roomConfig.wallHeight,
      wallThicknessCm: s.roomConfig.wallThickness,
      vertices,
      walls,
    },
    architecturalElements: (s.architecturalElements || []).map((el) => {
      const wall = walls.find((w) => w.id === el.wallId);
      const offsetFromStartCm = wall ? Math.round((el.offset || 0) + wall.lengthCm / 2) : undefined;
      return {
        id: el.id,
        type: el.type,
        name: el.name,
        wallId: el.wallId,
        wallLabel: (el.wallId && wallLabelById.get(el.wallId)) || 'A',
        wallLengthCm: wall?.lengthCm,
        offsetFromStartCm,
        offsetFromCenterCm: Math.round(el.offset || 0),
        widthCm: el.width,
        heightCm: el.height,
        depthCm: el.depth,
        elevationCm: el.elevation,
        hingeSide: el.hingeSide,
        isOpen: Boolean(el.isOpen),
      };
    }),
    mepPoints: (s.mepPoints || []).map((p) => ({
      id: p.id,
      type: p.type,
      name: p.name,
      wallId: p.wallId,
      wallLabel: (p.wallId && wallLabelById.get(p.wallId)) || 'A',
      offsetFromStartCm: Math.round(p.wallOffset || 0),
      elevationCm: p.elevation,
    })),
    cabinets: (s.cabinets || []).map((c: CabinetType, idx: number) => {
      const bottomElevationCm = Math.round((c.position[1] - c.height / 2) * 10) / 10;
      const topElevationCm = Math.round((c.position[1] + c.height / 2) * 10) / 10;
      const supportsShelves = cabinetSupportsShelves(c);
      const isSplit = isCabinetWithSplitDoors(c);
      const splitCounts = isSplit ? getSplitCabinetShelvesCounts(c) : null;
      const interactiveElements = getCabinetInteractiveElements(c);

      return {
        id: c.id,
        index: idx + 1,
        label: getCabinetLabel(c, idx),
        type: c.type,
        variant: c.variant,
        widthCm: c.width,
        heightCm: c.height,
        depthCm: c.depth,
        position: c.position.map((v) => Math.round(v)),
        bottomElevationCm,
        topElevationCm,
        rotationDeg: Math.round(((c.rotation || 0) * 180) / Math.PI),
        doorColor: c.doorColor || c.color,
        structureColor: c.structureColor || c.color,
        leftCoverPanel: c.leftCoverPanel?.enabled
          ? {
              enabled: true,
              extendToFloor: Boolean(c.leftCoverPanel.extendToFloor),
              hasCustomColor: Boolean(c.leftCoverPanel.color),
              ...(c.leftCoverPanel.depth ? { depthCm: c.leftCoverPanel.depth } : {}),
            }
          : { enabled: false },
        rightCoverPanel: c.rightCoverPanel?.enabled
          ? {
              enabled: true,
              extendToFloor: Boolean(c.rightCoverPanel.extendToFloor),
              hasCustomColor: Boolean(c.rightCoverPanel.color),
              ...(c.rightCoverPanel.depth ? { depthCm: c.rightCoverPanel.depth } : {}),
            }
          : { enabled: false },
        shelves: !supportsShelves
          ? null
          : isSplit && splitCounts
          ? { split: true, lower: splitCounts.lower, upper: splitCounts.upper }
          : { count: c.shelvesCount !== undefined ? c.shelvesCount : getDefaultShelvesCount(c) },
        isOpen: Boolean(c.isOpen),
        openElements: c.openElements || {},
        interactiveElements,
      };
    }),
    finishes: {
      wallColorHex: s.wallColor,
      floorTypeId: s.floorType,
      golaSystem: s.golaSystem,
      showSocle: s.showSocle,
      socleFinish: s.socleFinish,
      socleHeightCm: s.socleHeight,
      handleConfig: s.handleConfig,
      countertop: {
        enabled: s.countertopConfig.enabled,
        selectedProductId: s.countertopConfig.selectedProductId,
        sinkModel: s.countertopConfig.sinkModel,
        cooktopModel: s.countertopConfig.cooktopModel,
        backsplashMode: s.countertopConfig.backsplashMode,
        regruesoCm: s.countertopConfig.regruesoCm,
        waterfallLeft: s.countertopConfig.waterfallLeft,
        waterfallRight: s.countertopConfig.waterfallRight,
        baseWaterfallLeft: s.countertopConfig.baseWaterfallLeft ?? s.countertopConfig.waterfallLeft,
        baseWaterfallRight: s.countertopConfig.baseWaterfallRight ?? s.countertopConfig.waterfallRight,
        islandWaterfallLeft: s.countertopConfig.islandWaterfallLeft ?? s.countertopConfig.waterfallLeft,
        islandWaterfallRight: s.countertopConfig.islandWaterfallRight ?? s.countertopConfig.waterfallRight,
      },
    },
  };
}

export function resolveApprovedTexture(
  idOrName?: string
): { texture: AiBoardTextureEntry; wasFallback: boolean } {
  const catalog = getApprovedBoardTextures();
  if (!idOrName || !idOrName.trim()) {
    return { texture: catalog[0], wasFallback: true };
  }

  const q = idOrName.trim().toLowerCase();
  const exactId = catalog.find((t) => t.id.toLowerCase() === q);
  if (exactId) return { texture: exactId, wasFallback: false };

  const exactUrl = catalog.find((t) => t.url.toLowerCase() === q);
  if (exactUrl) return { texture: exactUrl, wasFallback: false };

  const exactName = catalog.find((t) => t.name.toLowerCase() === q);
  if (exactName) return { texture: exactName, wasFallback: false };

  const partial = catalog.find(
    (t) => t.name.toLowerCase().includes(q) || q.includes(t.name.toLowerCase())
  );
  if (partial) return { texture: partial, wasFallback: false };

  const tokens = q.split(/[\s_-]+/).filter((w) => w.length >= 3);
  let best: AiBoardTextureEntry | null = null;
  let bestScore = 0;
  for (const t of catalog) {
    const hay = `${t.name} ${t.brand} ${t.category} ${t.finish}`.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (hay.includes(tok)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best && bestScore > 0) {
    return { texture: best, wasFallback: true };
  }

  return { texture: catalog[0], wasFallback: true };
}

export function resolveApprovedModuleTool(toolOrVariant?: string): {
  entry: AiModuleCatalogEntry;
  specs: ReturnType<typeof getCabinetSpecsFromTool>;
  wasFallback: boolean;
} {
  const normalized = (toolOrVariant || '').trim().toLowerCase();
  if (normalized === 'place_base_sink_u_drawer' || normalized === 'sink_u_drawer' || normalized === 'base_sink_u_drawer') {
    const sink2Doors = AI_ALLOWED_MODULES.find((m) => m.tool === 'place_base_sink_2_doors')!;
    return { entry: sink2Doors, specs: getCabinetSpecsFromTool(sink2Doors.tool), wasFallback: false };
  }
  const exactTool = AI_ALLOWED_MODULES.find((m) => m.tool.toLowerCase() === normalized);
  if (exactTool) {
    return { entry: exactTool, specs: getCabinetSpecsFromTool(exactTool.tool), wasFallback: false };
  }

  const byVariant = AI_ALLOWED_MODULES.find(
    (m) => m.variant.toLowerCase() === normalized || m.tool.replace('place_', '') === normalized
  );
  if (byVariant) {
    return { entry: byVariant, specs: getCabinetSpecsFromTool(byVariant.tool), wasFallback: false };
  }

  if (normalized.includes('wall') || normalized.includes('aereo')) {
    const fb = AI_ALLOWED_MODULES.find((m) => m.tool === 'place_wall_2_doors')!;
    return { entry: fb, specs: getCabinetSpecsFromTool(fb.tool), wasFallback: true };
  }
  if (normalized.includes('tall') || normalized.includes('torre') || normalized.includes('despensa')) {
    const fb = AI_ALLOWED_MODULES.find((m) => m.tool === 'place_tall_1_door')!;
    return { entry: fb, specs: getCabinetSpecsFromTool(fb.tool), wasFallback: true };
  }
  if (normalized.includes('island') || normalized.includes('isla')) {
    const fb = AI_ALLOWED_MODULES.find((m) => m.tool === 'place_island_2_doors')!;
    return { entry: fb, specs: getCabinetSpecsFromTool(fb.tool), wasFallback: true };
  }

  const fb = AI_ALLOWED_MODULES.find((m) => m.tool === 'place_base_2_doors')!;
  return { entry: fb, specs: getCabinetSpecsFromTool(fb.tool), wasFallback: true };
}

export function resolveApprovedCountertop(idOrName?: string): {
  id: string;
  name: string;
  thicknessMm: number;
  wasFallback: boolean;
} {
  const catalog = (useKitchenStore.getState().qstoneCatalog || DEFAULT_QSTONE_CATALOG).filter(
    (q) => q.active !== false
  );
  if (!idOrName) {
    const first = catalog[0] || DEFAULT_QSTONE_CATALOG[0];
    return { id: first.id, name: first.name, thicknessMm: first.thicknessMm, wasFallback: true };
  }

  const q = idOrName.trim().toLowerCase();
  const exact = catalog.find((c) => c.id.toLowerCase() === q || c.name.toLowerCase() === q);
  if (exact) {
    return { id: exact.id, name: exact.name, thicknessMm: exact.thicknessMm, wasFallback: false };
  }

  const partial = catalog.find((c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  if (partial) {
    return { id: partial.id, name: partial.name, thicknessMm: partial.thicknessMm, wasFallback: true };
  }

  const first = catalog[0] || DEFAULT_QSTONE_CATALOG[0];
  return { id: first.id, name: first.name, thicknessMm: first.thicknessMm, wasFallback: true };
}

export function resolveWallColorHex(idOrHex?: string): { hex: string; name: string; wasFallback: boolean } {
  if (!idOrHex) return { hex: WALL_COLOR_OPTIONS[2].hex, name: WALL_COLOR_OPTIONS[2].name, wasFallback: true };
  const q = idOrHex.trim().toLowerCase();
  const match = WALL_COLOR_OPTIONS.find(
    (w) => w.id.toLowerCase() === q || w.hex.toLowerCase() === q || w.name.toLowerCase().includes(q)
  );
  if (match) return { hex: match.hex, name: match.name, wasFallback: false };
  return { hex: WALL_COLOR_OPTIONS[1].hex, name: WALL_COLOR_OPTIONS[1].name, wasFallback: true };
}

export function resolveFloorTypeId(idOrName?: string): { id: string; name: string; wasFallback: boolean } {
  if (!idOrName) return { id: FLOOR_TYPE_OPTIONS[0].id, name: FLOOR_TYPE_OPTIONS[0].name, wasFallback: true };
  const q = idOrName.trim().toLowerCase();
  const match = FLOOR_TYPE_OPTIONS.find(
    (f) => f.id.toLowerCase() === q || f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
  );
  if (match) return { id: match.id, name: match.name, wasFallback: false };
  return { id: FLOOR_TYPE_OPTIONS[0].id, name: FLOOR_TYPE_OPTIONS[0].name, wasFallback: true };
}

export function resolveHandleConfig(input?: {
  model?: string;
  finish?: string;
  lengthMm?: number;
}): { model: HandleModelId; finish: HandleFinish; lengthMm: number; orientation: 'auto' } {
  const modelQ = (input?.model || 'forza').toLowerCase();
  const found = HANDLE_CATALOG.find((h) => h.id === modelQ || h.name.toLowerCase().includes(modelQ)) || HANDLE_CATALOG[0];
  const finishQ = (input?.finish || '').toLowerCase() as HandleFinish;
  const finish = found.finishes.includes(finishQ) ? finishQ : found.finishes[0];
  const reqLen = Number(input?.lengthMm);
  const lengthMm = found.lengths.includes(reqLen) ? reqLen : found.lengths[Math.min(1, found.lengths.length - 1)] || found.lengths[0];
  return {
    model: found.id,
    finish,
    lengthMm,
    orientation: 'auto',
  };
}
