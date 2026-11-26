import { useAdminStore } from '../store/adminStore';
import { useKitchenStore, CabinetType, GolaSystem } from '../store/kitchenStore';
import { getCabinetSpecsFromTool } from './kitchenCollision';
import { WALL_COLOR_OPTIONS, FLOOR_TYPE_OPTIONS } from './kitchenMaterials';
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
  defaultDepth: number;
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

export const AI_ALLOWED_MODULES: AiModuleCatalogEntry[] = [
  // Bases
  { tool: 'place_base_1_door', category: 'base', name: 'Base 1 Puerta', variant: '1_door', defaultWidth: 60, minWidth: 30, maxWidth: 60, defaultHeight: 80, defaultDepth: 60, notes: 'Máximo 60cm por ser 1 hoja' },
  { tool: 'place_base_2_doors', category: 'base', name: 'Base 2 Puertas', variant: '2_doors', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 80, defaultDepth: 60 },
  { tool: 'place_base_1_door_1_drawer', category: 'base', name: 'Base 1 Puerta + 1 Cajón', variant: '1_door_1_drawer', defaultWidth: 60, minWidth: 35, maxWidth: 60, defaultHeight: 80, defaultDepth: 60, notes: 'Máximo 60cm' },
  { tool: 'place_base_4_drawers', category: 'base', name: 'Base 4 Cajones', variant: '4_drawers', defaultWidth: 80, minWidth: 40, maxWidth: 100, defaultHeight: 80, defaultDepth: 60 },
  { tool: 'place_base_3_drawers_veggie', category: 'base', name: 'Base Verdulero (3 Cajones)', variant: '3_drawers_veggie', defaultWidth: 60, minWidth: 45, maxWidth: 80, defaultHeight: 80, defaultDepth: 60 },
  { tool: 'place_base_2_pot_drawers', category: 'base', name: 'Base 2 Olleros', variant: '2_pot_drawers', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 80, defaultDepth: 60 },
  { tool: 'place_base_2_drawers_1_pot', category: 'base', name: 'Base 2 Cajones + 1 Ollero', variant: '2_drawers_1_pot', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 80, defaultDepth: 60 },
  { tool: 'place_base_spice_rack', category: 'base', name: 'Base Especiero Extraíble', variant: 'spice_rack', defaultWidth: 20, minWidth: 15, maxWidth: 30, defaultHeight: 80, defaultDepth: 60, notes: 'Ancho estricto 15-30cm' },
  { tool: 'place_base_wine_rack', category: 'base', name: 'Botellero Base', variant: 'wine_rack', defaultWidth: 20, minWidth: 15, maxWidth: 40, defaultHeight: 80, defaultDepth: 60 },
  { tool: 'place_base_sink_2_doors', category: 'base', name: 'Base Lavaplatos (2 Puertas)', variant: 'base_sink_2_doors', defaultWidth: 80, minWidth: 80, maxWidth: 120, defaultHeight: 80, defaultDepth: 60, notes: 'Obligatorio para lavaplatos: >=80cm (1 tina) o >=90cm (2 tinas)' },
  { tool: 'place_base_sink_u_drawer', category: 'base', name: 'Fregadero Cajón en U', variant: 'sink_u_drawer', defaultWidth: 90, minWidth: 80, maxWidth: 120, defaultHeight: 80, defaultDepth: 60, notes: 'Compatible con lavaplatos y sifón' },
  { tool: 'place_base_cooktop_3_drawers', category: 'base', name: 'Base Encimera (3 Cajones, 1° Fijo)', variant: 'base_cooktop_3_drawers', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 80, defaultDepth: 60, notes: 'Obligatorio para encimera: >=60cm (4 platos) o >=90cm (5 platos)' },
  { tool: 'place_base_corner_blind', category: 'base', name: 'Base Esquinero Ciego', variant: 'corner_blind_right', defaultWidth: 110, minWidth: 95, maxWidth: 120, defaultHeight: 80, defaultDepth: 60, notes: 'Usar en esquinas de cocinas en L o U' },
  { tool: 'place_base_corner_l', category: 'base', name: 'Base Esquinero en L (90x90)', variant: 'corner_l', defaultWidth: 90, minWidth: 90, maxWidth: 90, defaultHeight: 80, defaultDepth: 90, notes: 'Fijo 90x90cm en esquinas de cocinas en L o U' },

  // Aéreos / Murales
  { tool: 'place_wall_1_door', category: 'wall', name: 'Aéreo 1 Puerta', variant: 'wall_1_door', defaultWidth: 60, minWidth: 30, maxWidth: 60, defaultHeight: 70, defaultDepth: 35, notes: 'Máximo 60cm' },
  { tool: 'place_wall_2_doors', category: 'wall', name: 'Aéreo 2 Puertas', variant: 'wall_2_doors', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 70, defaultDepth: 35 },
  { tool: 'place_wall_lift_up', category: 'wall', name: 'Aéreo Puerta Elevable Aventos', variant: 'wall_lift_up', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 40, defaultDepth: 35 },
  { tool: 'place_wall_lift_up_double', category: 'wall', name: 'Aéreo Doble Elevable', variant: 'wall_lift_up_double', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 70, defaultDepth: 35 },
  { tool: 'place_wall_microwave_niche', category: 'wall', name: 'Aéreo Nicho Microondas', variant: 'wall_microwave_niche', defaultWidth: 60, minWidth: 55, maxWidth: 70, defaultHeight: 80, defaultDepth: 38 },
  { tool: 'place_wall_open', category: 'wall', name: 'Aéreo Abierto Repisas', variant: 'wall_open', defaultWidth: 60, minWidth: 30, maxWidth: 100, defaultHeight: 70, defaultDepth: 35 },
  { tool: 'place_wall_corner_blind', category: 'wall', name: 'Aéreo Esquinero Ciego', variant: 'wall_corner_blind_right', defaultWidth: 70, minWidth: 65, maxWidth: 90, defaultHeight: 70, defaultDepth: 35 },
  { tool: 'place_wall_wine_rack', category: 'wall', name: 'Aéreo Botellero', variant: 'wall_wine_rack', defaultWidth: 20, minWidth: 15, maxWidth: 40, defaultHeight: 70, defaultDepth: 35 },
  { tool: 'place_wall_hood_new_flow', category: 'wall', name: 'Aéreo Campana New Flow 60', variant: 'wall_hood_new_flow', defaultWidth: 60, minWidth: 60, maxWidth: 90, defaultHeight: 70, defaultDepth: 35, notes: 'Colocar centrado sobre base encimera' },
  { tool: 'place_wall_door_shelf', category: 'wall', name: 'Aéreo Puerta + Repisa Inferior', variant: 'wall_door_shelf', defaultWidth: 60, minWidth: 40, maxWidth: 80, defaultHeight: 80, defaultDepth: 35 },

  // Torres / Despensas
  { tool: 'place_tall_1_door', category: 'tall', name: 'Torre Despensa 1 Puerta', variant: 'tall_1_door', defaultWidth: 60, minWidth: 40, maxWidth: 60, defaultHeight: 215, defaultDepth: 60, notes: 'Máximo 60cm' },
  { tool: 'place_tall_split_2_doors', category: 'tall', name: 'Torre 2 Puertas (Línea Base)', variant: 'tall_split_2_doors', defaultWidth: 60, minWidth: 40, maxWidth: 60, defaultHeight: 215, defaultDepth: 60, notes: 'Máximo 60cm' },
  { tool: 'place_tall_2_doors', category: 'tall', name: 'Torre Despensa 2 Puertas', variant: 'tall_2_doors', defaultWidth: 80, minWidth: 70, maxWidth: 100, defaultHeight: 215, defaultDepth: 60 },
  { tool: 'place_tall_oven_micro', category: 'tall', name: 'Torre Horno + Microondas', variant: 'tall_oven_micro', defaultWidth: 60, minWidth: 60, maxWidth: 60, defaultHeight: 215, defaultDepth: 60 },
  { tool: 'place_tall_oven_vent', category: 'tall', name: 'Torre Hornos Vent. Técnica', variant: 'tall_oven_vent', defaultWidth: 60, minWidth: 60, maxWidth: 60, defaultHeight: 215, defaultDepth: 60 },
  { tool: 'place_tall_microwave_niche', category: 'tall', name: 'Torre Nicho Microondas', variant: 'tall_microwave_niche', defaultWidth: 60, minWidth: 60, maxWidth: 60, defaultHeight: 215, defaultDepth: 60 },
  { tool: 'place_tall_inner_drawers', category: 'tall', name: 'Torre Cajones Interiores', variant: 'tall_inner_drawers', defaultWidth: 60, minWidth: 45, maxWidth: 60, defaultHeight: 215, defaultDepth: 60 },
  { tool: 'place_tall_open', category: 'tall', name: 'Torre Repisas a la Vista', variant: 'tall_open', defaultWidth: 60, minWidth: 40, maxWidth: 80, defaultHeight: 215, defaultDepth: 60 },
  { tool: 'place_tall_wine_rack', category: 'tall', name: 'Torre Botellero', variant: 'tall_wine_rack', defaultWidth: 30, minWidth: 20, maxWidth: 40, defaultHeight: 215, defaultDepth: 60 },

  // Islas
  { tool: 'place_island', category: 'island', name: 'Isla 2 Olleros', variant: '2_pot_drawers', defaultWidth: 90, minWidth: 60, maxWidth: 120, defaultHeight: 80, defaultDepth: 80 },
  { tool: 'place_island_4_drawers', category: 'island', name: 'Isla 4 Cajones', variant: '4_drawers', defaultWidth: 80, minWidth: 50, maxWidth: 100, defaultHeight: 80, defaultDepth: 80 },
  { tool: 'place_island_2_drawers_1_pot', category: 'island', name: 'Isla 2 Cajones + 1 Ollero', variant: '2_drawers_1_pot', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 80, defaultDepth: 80 },
  { tool: 'place_island_1_door', category: 'island', name: 'Isla 1 Puerta', variant: '1_door', defaultWidth: 60, minWidth: 40, maxWidth: 60, defaultHeight: 80, defaultDepth: 80 },
  { tool: 'place_island_2_doors', category: 'island', name: 'Isla 2 Puertas', variant: '2_doors', defaultWidth: 80, minWidth: 60, maxWidth: 120, defaultHeight: 80, defaultDepth: 80 },
  { tool: 'place_island_wine_rack', category: 'island', name: 'Botellero Isla', variant: 'wine_rack', defaultWidth: 25, minWidth: 20, maxWidth: 40, defaultHeight: 80, defaultDepth: 80 },

  // Equipamiento y Decoración
  { tool: 'place_deco_fridge', category: 'decoration', name: 'Refrigerador SBS 513L', variant: 'deco_fridge', defaultWidth: 91, minWidth: 91, maxWidth: 91, defaultHeight: 177, defaultDepth: 67 },
  { tool: 'place_deco_dishwasher', category: 'decoration', name: 'Lavavajillas FDV Active 12C', variant: 'deco_dishwasher', defaultWidth: 60, minWidth: 60, maxWidth: 60, defaultHeight: 84.5, defaultDepth: 60 },
  { tool: 'place_deco_stove', category: 'decoration', name: 'Cocina Libre FDV 90', variant: 'deco_stove', defaultWidth: 90, minWidth: 90, maxWidth: 90, defaultHeight: 90, defaultDepth: 60 },
  { tool: 'place_deco_hood', category: 'decoration', name: 'Campana Mural FDV Conic 90', variant: 'deco_hood', defaultWidth: 90, minWidth: 90, maxWidth: 90, defaultHeight: 70, defaultDepth: 50, notes: 'Colocar centrada sobre cocina/encimera a 145cm' },
  { tool: 'place_deco_plant', category: 'decoration', name: 'Planta Interior Decorativa', variant: 'deco_plant', defaultWidth: 40, minWidth: 40, maxWidth: 40, defaultHeight: 95, defaultDepth: 40 },
];

const DEFAULT_FALLBACK_TEXTURES: AiBoardTextureEntry[] = [
  { id: 'def_mas_blanco_18', name: 'Masisa Blanco', brand: 'Masisa', category: 'solidos', finish: 'Mate', thicknessMm: 18, material: 'melamina', url: '#FFFFFF', stock: 50 },
  { id: 'def_mas_negro_18', name: 'Masisa Negro', brand: 'Masisa', category: 'solidos', finish: 'Mate', thicknessMm: 18, material: 'melamina', url: '#171717', stock: 50 },
];

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
        offsetFromStartCm,
        widthCm: el.width,
        heightCm: el.height,
        depthCm: el.depth,
        elevationCm: el.elevation,
        hingeSide: el.hingeSide,
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
    cabinets: (s.cabinets || []).map((c: CabinetType, idx: number) => ({
      id: c.id,
      index: idx + 1,
      type: c.type,
      variant: c.variant,
      widthCm: c.width,
      heightCm: c.height,
      depthCm: c.depth,
      position: c.position.map((v) => Math.round(v)),
      rotationDeg: Math.round(((c.rotation || 0) * 180) / Math.PI),
      doorColor: c.doorColor || c.color,
      structureColor: c.structureColor || c.color,
    })),
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

  // Token overlap matching
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

  // Fallback safe module by category hint
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
