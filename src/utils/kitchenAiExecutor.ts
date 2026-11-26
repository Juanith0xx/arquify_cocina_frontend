import {
  useKitchenStore,
  CabinetType,
  ArchitecturalElement,
  WallType,
  GolaSystem,
  getCabinetLabel,
} from '../store/kitchenStore';
import { useStore } from '../store';
import {
  RoomConfig,
  RoomShapeType,
  RoomVertex,
  centerVertices,
  orthogonalizePolygon,
  getPresetRoomVertices,
  generateWallsFromRoom,
  calculatePolygonArea,
  getWallLabel,
} from './roomGeometry';
import {
  getWallInwardNormal,
  constrainInsideRoomAndWalls,
  isCandidateValid,
  findSmartWallPlacement,
} from './kitchenCollision';
import { calculateMepPositionOnWall } from './mepGeometry';
import { detectMepClashes } from './mepClashDetection';
import {
  resolveApprovedTexture,
  resolveApprovedModuleTool,
  resolveApprovedCountertop,
  resolveWallColorHex,
  resolveFloorTypeId,
  resolveHandleConfig,
} from './kitchenAiCatalog';
import { SinkModelId, CooktopModelId, BacksplashMode } from '../types/countertop';
import { MepPoint, MepType, MepPresetType, MEP_TYPE_CONFIGS, MEP_PRESETS } from '../types/mep';

export interface AiFloorPlanOpening {
  type: 'door' | 'window' | 'pillar';
  wallLabel: string; // 'A', 'B', 'C', 'D'...
  offsetFromStartCm: number; // distancia desde el inicio del muro en cm
  widthCm: number;
  heightCm?: number;
  depthCm?: number;
  elevationCm?: number;
  hingeSide?: 'left' | 'right';
  name?: string;
}

export interface AiFloorPlanMep {
  wallLabel: string;
  offsetFromStartCm: number;
  preset?: MepPresetType;
  type?: MepType;
  elevationCm?: number;
  name?: string;
}

export interface AiFloorPlanAction {
  shapeType: RoomShapeType;
  wallHeightCm?: number;
  wallThicknessCm?: number;
  widthCm?: number; // Para rectangular rápido si no vienen vértices
  depthCm?: number;
  vertices?: Array<{ x: number; y: number }>;
  orthogonalize?: boolean;
  openings?: AiFloorPlanOpening[];
  mepPoints?: AiFloorPlanMep[];
  clearExistingCabinets?: boolean;
}

export interface AiDesignModuleItem {
  tool: string;
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
  offsetFromStartCm?: number; // opcional: posición sugerida desde el inicio del muro
  hingeSide?: 'left' | 'right';
  hasSink?: boolean;
  hasCooktop?: boolean;
}

export interface AiWallRunSpec {
  wallLabel: string; // 'A', 'B', 'C', 'D'...
  startOffsetCm?: number; // opcional: desde qué cm del muro comenzar
  baseAndTallModules?: AiDesignModuleItem[]; // secuencia de bases, torres y equipos de piso
  wallModules?: AiDesignModuleItem[]; // secuencia de muebles aéreos y campanas
}

export interface AiIslandSpec {
  enabled: boolean;
  orientation?: 'parallel_wall_a' | 'parallel_wall_b';
  depthCm?: number;
  modules: AiDesignModuleItem[];
  overhangBackCm?: number;
  waterfallSides?: boolean;
}

export interface AiFinishesSpec {
  doorsTexture?: string;
  lowerDoorsTexture?: string;
  upperDoorsTexture?: string;
  islandDoorsTexture?: string;
  structureTexture?: string;
  countertopProduct?: string;
  countertopEnabled?: boolean;
  backsplashMode?: BacksplashMode;
  regruesoCm?: number;
  sinkModel?: SinkModelId;
  cooktopModel?: CooktopModelId;
  golaSystem?: GolaSystem;
  handle?: {
    model?: string;
    finish?: string;
    lengthMm?: number;
  };
  showSocle?: boolean;
  socleFinish?: 'aluminum' | 'black';
  socleHeightCm?: number;
  wallColor?: string;
  floorType?: string;
}

export interface AiFullDesignAction {
  wallRuns: AiWallRunSpec[];
  island?: AiIslandSpec;
  finishes?: AiFinishesSpec;
  replaceExistingCabinets?: boolean;
}

export interface AiPatchDesignAction {
  finishes?: AiFinishesSpec;
  addModules?: Array<AiDesignModuleItem & { wallLabel?: string; isIsland?: boolean }>;
  removeCabinetIds?: string[];
  removeByVariant?: string[];
  updateCabinets?: Array<{
    cabinetId: string;
    widthCm?: number;
    heightCm?: number;
    depthCm?: number;
    hingeSide?: 'left' | 'right';
    doorTexture?: string;
  }>;
  addOpenings?: AiFloorPlanOpening[];
  addMepPoints?: AiFloorPlanMep[];
  clearIsland?: boolean;
}

export interface AiAgentStructuredResponse {
  reply: string;
  stage: 'awaiting_plan_confirmation' | 'ready_to_design' | 'iterating';
  actionType: 'apply_floor_plan' | 'apply_full_design' | 'patch_design' | 'reply_only';
  catalogAdaptations?: string[];
  floorPlan?: AiFloorPlanAction;
  fullDesign?: AiFullDesignAction;
  patchDesign?: AiPatchDesignAction;
}

export interface AiExecutionReport {
  success: boolean;
  appliedSummary: string[];
  warnings: string[];
  adaptations: string[];
  mepClashesCount: number;
}

const VALID_SHAPES: RoomShapeType[] = [
  'rectangular',
  'l_shape',
  'u_shape',
  'five_corners',
  'linear',
  'freeform',
];

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function findWallByLabel(walls: WallType[], wallLabel?: string): { wall: WallType; index: number } | null {
  if (!walls || walls.length === 0) return null;
  if (!wallLabel) return { wall: walls[0], index: 0 };

  const clean = wallLabel.trim().toUpperCase().replace(/^MURO\s*/i, '').replace(/^PARED\s*/i, '').replace(/^WALL\s*/i, '');
  for (let i = 0; i < walls.length; i++) {
    if (getWallLabel(i).toUpperCase() === clean) {
      return { wall: walls[i], index: i };
    }
  }
  const numMatch = clean.match(/^\d+$/);
  if (numMatch) {
    const idx = Math.max(0, Math.min(walls.length - 1, parseInt(numMatch[0], 10) - 1));
    return { wall: walls[idx], index: idx };
  }
  return { wall: walls[0], index: 0 };
}

function buildWallOpeningsIntervals(
  wall: WallType,
  elements: ArchitecturalElement[],
  tier: 'lower' | 'upper' | 'full'
): Array<{ start: number; end: number; reason: string }> {
  const wLen = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const intervals: Array<{ start: number; end: number; reason: string }> = [];

  for (const el of elements) {
    if (el.wallId !== wall.id) continue;
    const centerS = (el.offset || 0) + wLen / 2;
    const halfW = (el.width || 60) / 2;
    const margin = el.type === 'door' ? 8 : 5;

    if (el.type === 'door') {
      intervals.push({ start: centerS - halfW - margin, end: centerS + halfW + margin, reason: 'puerta' });
    } else if (el.type === 'pillar') {
      intervals.push({ start: centerS - halfW - 3, end: centerS + halfW + 3, reason: 'pilar' });
    } else if (el.type === 'window') {
      const elev = el.elevation ?? 100;
      if (tier === 'upper' || tier === 'full') {
        // Aéreos y torres nunca pueden bloquear una ventana
        intervals.push({ start: centerS - halfW - margin, end: centerS + halfW + margin, reason: 'ventana' });
      } else if (tier === 'lower' && elev < 88) {
        // Ventana baja / ventanal que sí bloquea muebles base
        intervals.push({ start: centerS - halfW - margin, end: centerS + halfW + margin, reason: 'ventana baja' });
      }
    }
  }

  return intervals.sort((a, b) => a.start - b.start);
}

function findNextFreeSpan(
  cursor: number,
  width: number,
  maxS: number,
  blocked: Array<{ start: number; end: number; reason: string }>
): number | null {
  let s = cursor;
  for (let guard = 0; guard < 20; guard++) {
    if (s + width > maxS + 0.5) return null;
    const blocker = blocked.find((b) => s < b.end && s + width > b.start);
    if (!blocker) return s;
    s = Math.max(s + 1, blocker.end);
  }
  return null;
}

function createArchitecturalElementOnWall(
  wall: WallType,
  spec: AiFloorPlanOpening,
  wallHeight: number
): ArchitecturalElement | null {
  const [x1, z1] = wall.start;
  const [x2, z2] = wall.end;
  const wLen = Math.hypot(x2 - x1, z2 - z1);
  if (wLen < 40) return null;

  const uX = (x2 - x1) / wLen;
  const uZ = (z2 - z1) / wLen;

  let width = clamp(Number(spec.widthCm) || (spec.type === 'door' ? 90 : spec.type === 'window' ? 120 : 35), 15, Math.max(20, wLen - 16));
  let elevation = 0;
  let height = wallHeight;
  let depth = wall.thickness || 20;

  if (spec.type === 'door') {
    elevation = 0;
    height = clamp(Number(spec.heightCm) || 210, 180, Math.max(185, wallHeight - 10));
    width = clamp(width, 60, Math.max(65, wLen - 14));
  } else if (spec.type === 'window') {
    elevation = clamp(Number(spec.elevationCm) || 105, 45, Math.max(60, wallHeight - 60));
    height = clamp(Number(spec.heightCm) || 110, 40, Math.max(45, wallHeight - elevation - 10));
    width = clamp(width, 40, Math.max(45, wLen - 14));
  } else {
    elevation = 0;
    height = wallHeight;
    width = clamp(Number(spec.widthCm) || 35, 15, 120);
    depth = clamp(Number(spec.depthCm) || 35, 15, 80);
  }

  const rawS = Number.isFinite(spec.offsetFromStartCm) ? spec.offsetFromStartCm : wLen / 2;
  const sClamped = clamp(rawS, width / 2 + 5, wLen - width / 2 - 5);
  const pX = x1 + sClamped * uX;
  const pZ = z1 + sClamped * uZ;

  return {
    id: `arch_ai_${spec.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    wallId: wall.id,
    offset: Math.round((sClamped - wLen / 2) * 10) / 10,
    type: spec.type,
    name:
      spec.name ||
      (spec.type === 'door' ? 'Puerta de Acceso' : spec.type === 'window' ? 'Ventana' : 'Pilar Estructural'),
    width: Math.round(width),
    height: Math.round(height),
    depth: Math.round(depth),
    elevation: Math.round(elevation),
    position: [pX, elevation + height / 2, pZ],
    rotation: Math.atan2(x1 - x2, z1 - z2),
    isOpen: false,
    hingeSide: spec.hingeSide === 'right' ? 'right' : 'left',
  };
}

function buildMepPointsOnWalls(
  specs: AiFloorPlanMep[],
  walls: WallType[],
  roomPoly: [number, number][]
): MepPoint[] {
  const result: MepPoint[] = [];

  for (const spec of specs) {
    const found = findWallByLabel(walls, spec.wallLabel);
    if (!found) continue;
    const { wall } = found;
    const wLen = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    const baseOffset = clamp(Number(spec.offsetFromStartCm) || wLen / 2, 15, Math.max(15, wLen - 15));

    if (spec.preset) {
      const preset = MEP_PRESETS.find((p) => p.id === spec.preset);
      if (preset) {
        preset.points.forEach((pt, idx) => {
          const offset = clamp(baseOffset + pt.relativeOffsetCm, 12, Math.max(12, wLen - 12));
          const calc = calculateMepPositionOnWall(wall, offset, pt.elevationCm, roomPoly);
          const cfg = MEP_TYPE_CONFIGS[pt.type];
          result.push({
            id: `mep_ai_${spec.preset}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}_${idx}`,
            name: `${cfg.label}`,
            type: pt.type,
            wallId: wall.id,
            wallOffset: Math.round(offset),
            elevation: pt.elevationCm,
            position: calc.position,
            rotation: calc.rotation,
            diameterMm: cfg.defaultDiameterMm,
            specs: pt.specs,
          });
        });
        continue;
      }
    }

    if (spec.type && MEP_TYPE_CONFIGS[spec.type]) {
      const cfg = MEP_TYPE_CONFIGS[spec.type];
      const elev = clamp(Number(spec.elevationCm) || cfg.defaultElevationCm, 15, (wall.height || 250) - 20);
      const calc = calculateMepPositionOnWall(wall, baseOffset, elev, roomPoly);
      result.push({
        id: `mep_ai_${spec.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: spec.name || cfg.label,
        type: spec.type,
        wallId: wall.id,
        wallOffset: Math.round(baseOffset),
        elevation: Math.round(elev),
        position: calc.position,
        rotation: calc.rotation,
        diameterMm: cfg.defaultDiameterMm,
        specs: cfg.description,
      });
    }
  }

  return result;
}

function applyFinishesToStore(
  finishes: AiFinishesSpec | undefined,
  sinkCabinetId: string | null,
  cooktopCabinetId: string | null,
  appliedSummary: string[],
  warnings: string[],
  adaptations: string[]
) {
  if (!finishes) return;
  const store = useKitchenStore.getState();
  const globalStore = useStore.getState();

  // 1. Muros y pisos
  if (finishes.wallColor) {
    const wallResolved = resolveWallColorHex(finishes.wallColor);
    store.setWallColor(wallResolved.hex);
    appliedSummary.push(`Muros: ${wallResolved.name}`);
    if (wallResolved.wasFallback) {
      adaptations.push(`Color de muro adaptado al catálogo: ${wallResolved.name}`);
    }
  }

  if (finishes.floorType) {
    const floorResolved = resolveFloorTypeId(finishes.floorType);
    store.setFloorType(floorResolved.id);
    appliedSummary.push(`Piso: ${floorResolved.name}`);
    if (floorResolved.wasFallback) {
      adaptations.push(`Tipo de piso adaptado al catálogo: ${floorResolved.name}`);
    }
  }

  // 2. Texturas de muebles (siempre catálogo aprobado)
  const defaultDoorTex = finishes.doorsTexture
    ? resolveApprovedTexture(finishes.doorsTexture)
    : finishes.lowerDoorsTexture
    ? resolveApprovedTexture(finishes.lowerDoorsTexture)
    : null;

  const structureTex = finishes.structureTexture
    ? resolveApprovedTexture(finishes.structureTexture)
    : defaultDoorTex;

  if (structureTex) {
    store.applyGlobalTexture('structure', structureTex.texture.url, structureTex.texture.material, structureTex.texture.thicknessMm);
    store.applyGlobalTexture('shelves', structureTex.texture.url, structureTex.texture.material, structureTex.texture.thicknessMm);
    globalStore.setStructureColor(structureTex.texture.url);
    globalStore.setStructureMaterial(structureTex.texture.material);
    if (structureTex.wasFallback && finishes.structureTexture) {
      adaptations.push(`Estructura "${finishes.structureTexture}" adaptada a ${structureTex.texture.name}`);
    }
  }

  if (defaultDoorTex) {
    store.applyGlobalTexture('doors', defaultDoorTex.texture.url, defaultDoorTex.texture.material, defaultDoorTex.texture.thicknessMm);
    store.applyGlobalTexture('drawerFronts', defaultDoorTex.texture.url, defaultDoorTex.texture.material, defaultDoorTex.texture.thicknessMm);
    globalStore.setDoorColor(defaultDoorTex.texture.url);
    globalStore.setDoorMaterial(defaultDoorTex.texture.material);
    globalStore.setDrawerFrontColor(defaultDoorTex.texture.url);
    globalStore.setDrawerFrontMaterial(defaultDoorTex.texture.material);
    appliedSummary.push(`Frentes: ${defaultDoorTex.texture.name}`);
    if (defaultDoorTex.wasFallback && (finishes.doorsTexture || finishes.lowerDoorsTexture)) {
      adaptations.push(`Acabado de frentes adaptado a ${defaultDoorTex.texture.name}`);
    }
  }

  // Acabado diferenciado para bajos / altos / isla si se solicitó cocina bicolor
  const lowerTex = finishes.lowerDoorsTexture ? resolveApprovedTexture(finishes.lowerDoorsTexture) : null;
  const upperTex = finishes.upperDoorsTexture ? resolveApprovedTexture(finishes.upperDoorsTexture) : null;
  const islandTex = finishes.islandDoorsTexture ? resolveApprovedTexture(finishes.islandDoorsTexture) : null;

  if (lowerTex || upperTex || islandTex) {
    const freshCabs = useKitchenStore.getState().cabinets;
    for (const cab of freshCabs) {
      if (cab.type === 'decoration') continue;
      if (lowerTex && (cab.type === 'base' || cab.type === 'tall')) {
        useKitchenStore.getState().updateCabinet(cab.id, {
          doorColor: lowerTex.texture.url,
          doorMaterial: lowerTex.texture.material,
          drawerFrontColor: lowerTex.texture.url,
          drawerFrontMaterial: lowerTex.texture.material,
        });
      }
      if (upperTex && cab.type === 'wall') {
        useKitchenStore.getState().updateCabinet(cab.id, {
          doorColor: upperTex.texture.url,
          doorMaterial: upperTex.texture.material,
        });
      }
      if (islandTex && cab.type === 'island') {
        useKitchenStore.getState().updateCabinet(cab.id, {
          doorColor: islandTex.texture.url,
          doorMaterial: islandTex.texture.material,
          drawerFrontColor: islandTex.texture.url,
          drawerFrontMaterial: islandTex.texture.material,
        });
      }
    }
    if (upperTex) {
      appliedSummary.push(`Aéreos: ${upperTex.texture.name}`);
      if (upperTex.wasFallback && finishes.upperDoorsTexture) {
        adaptations.push(`Acabado aéreos adaptado a ${upperTex.texture.name}`);
      }
    }
    if (islandTex) {
      appliedSummary.push(`Isla: ${islandTex.texture.name}`);
    }
  }

  // 3. Zócalo
  if (finishes.showSocle !== undefined) {
    useKitchenStore.getState().setShowSocle(Boolean(finishes.showSocle));
  }
  if (finishes.socleFinish === 'aluminum' || finishes.socleFinish === 'black') {
    useKitchenStore.getState().setSocleFinish(finishes.socleFinish);
  }
  if (finishes.socleHeightCm !== undefined) {
    useKitchenStore.getState().setSocleHeight(clamp(Number(finishes.socleHeightCm) || 10, 8, 15));
  }

  // 4. Cubierta Qstone/Abet + compatibilidad estricta con Gola
  const desiredGola: GolaSystem | undefined =
    finishes.golaSystem && ['none', 'aluminum', 'black'].includes(finishes.golaSystem)
      ? finishes.golaSystem
      : undefined;

  if (finishes.countertopProduct || finishes.countertopEnabled !== undefined || finishes.backsplashMode || finishes.regruesoCm !== undefined) {
    const resolvedStone = finishes.countertopProduct
      ? resolveApprovedCountertop(finishes.countertopProduct)
      : null;

    const stoneThicknessCm = (resolvedStone?.thicknessMm || 20) / 10;
    let safeRegrueso = finishes.regruesoCm !== undefined ? clamp(Number(finishes.regruesoCm), 0, 6) : 0;

    // Respetar regla del configurador: con perfil Gola, regrueso no puede superar thicknessCm + 2.0
    const activeGola = desiredGola ?? useKitchenStore.getState().golaSystem;
    if (activeGola !== 'none' && safeRegrueso > stoneThicknessCm + 2.0) {
      safeRegrueso = 0;
      warnings.push('Se ajustó el regrueso de cubierta a 0 cm para mantener compatibilidad con sistema Gola.');
    }

    const backsplash: BacksplashMode | undefined =
      finishes.backsplashMode && ['none', 'standard_5cm', 'full_height'].includes(finishes.backsplashMode)
        ? finishes.backsplashMode
        : undefined;

    useKitchenStore.getState().setCountertopConfig({
      enabled: finishes.countertopEnabled !== false,
      ...(resolvedStone ? { selectedProductId: resolvedStone.id } : {}),
      ...(backsplash ? { backsplashMode: backsplash } : {}),
      regruesoCm: safeRegrueso,
    });

    if (resolvedStone) {
      appliedSummary.push(`Cubierta: ${resolvedStone.name}`);
      if (resolvedStone.wasFallback) {
        adaptations.push(`Cubierta "${finishes.countertopProduct}" adaptada a ${resolvedStone.name}`);
      }
    }
  }

  // 5. Gola y Tiradores
  if (desiredGola) {
    useKitchenStore.getState().setGolaSystem(desiredGola);
    if (desiredGola !== 'none') {
      useKitchenStore.getState().setHandleConfig({ model: 'none', finish: 'negro', lengthMm: 0, orientation: 'auto' });
      appliedSummary.push(`Apertura: Perfil Gola ${desiredGola === 'black' ? 'Negro' : 'Aluminio'}`);
    }
  }

  if (finishes.handle && (!desiredGola || desiredGola === 'none')) {
    const resolvedHandle = resolveHandleConfig(finishes.handle);
    useKitchenStore.getState().setHandleConfig(resolvedHandle);
    appliedSummary.push(`Tirador: ${resolvedHandle.model} (${resolvedHandle.finish})`);
  }

  // 6. Lavaplatos y Encimera validados contra muebles instalados
  const latestStore = useKitchenStore.getState();
  if (finishes.sinkModel && finishes.sinkModel !== 'none') {
    const targetSinkCab = sinkCabinetId
      ? latestStore.cabinets.find((c) => c.id === sinkCabinetId)
      : latestStore.cabinets.find((c) => latestStore.validateCabinetForSink(c, finishes.sinkModel!).valid);
    if (targetSinkCab) {
      const check = latestStore.validateCabinetForSink(targetSinkCab, finishes.sinkModel);
      if (check.valid) {
        latestStore.setCountertopSink(finishes.sinkModel, targetSinkCab.id);
        appliedSummary.push(`Lavaplatos: ${finishes.sinkModel === 'alfa_twoc_f5858a' ? 'ALFA 2 tinas' : 'ALFA 1 tina'}`);
      } else if (finishes.sinkModel === 'alfa_twoc_f5858a' && latestStore.validateCabinetForSink(targetSinkCab, 'alfa_onec_3018').valid) {
        latestStore.setCountertopSink('alfa_onec_3018', targetSinkCab.id);
        adaptations.push('Lavaplatos ajustado a ALFA 1 tina por ancho disponible del módulo lavaplatos (80 cm).');
      }
    }
  }

  if (finishes.cooktopModel && finishes.cooktopModel !== 'none') {
    const targetCookCab = cooktopCabinetId
      ? latestStore.cabinets.find((c) => c.id === cooktopCabinetId)
      : latestStore.cabinets.find((c) => latestStore.validateCabinetForCooktop(c, finishes.cooktopModel!).valid);
    if (targetCookCab) {
      const check = latestStore.validateCabinetForCooktop(targetCookCab, finishes.cooktopModel);
      if (check.valid) {
        latestStore.setCountertopCooktop(finishes.cooktopModel, targetCookCab.id);
        appliedSummary.push(`Encimera: ${finishes.cooktopModel === 'fdv_design_90' ? 'FDV 90 (5 platos)' : 'FDV 60 (4 platos)'}`);
      } else if (finishes.cooktopModel === 'fdv_design_90' && latestStore.validateCabinetForCooktop(targetCookCab, 'fdv_design_60').valid) {
        latestStore.setCountertopCooktop('fdv_design_60', targetCookCab.id);
        adaptations.push('Encimera ajustada a FDV 60 (4 platos) por ancho disponible del módulo.');
      }
    }
  }
}

export function executeFloorPlanAction(plan: AiFloorPlanAction): AiExecutionReport {
  const appliedSummary: string[] = [];
  const warnings: string[] = [];
  const adaptations: string[] = [];

  const shapeType: RoomShapeType = VALID_SHAPES.includes(plan.shapeType) ? plan.shapeType : 'rectangular';
  const wallHeight = clamp(Number(plan.wallHeightCm) || 250, 210, 400);
  const wallThickness = clamp(Number(plan.wallThicknessCm) || 20, 10, 40);

  let vertices: RoomVertex[] = [];

  if (Array.isArray(plan.vertices) && plan.vertices.length >= 3) {
    vertices = plan.vertices.map((v, idx) => ({
      id: `v${idx + 1}`,
      x: Math.round(Number(v.x) || 0),
      y: Math.round(Number(v.y) || 0),
    }));
    vertices = centerVertices(vertices);
    if (plan.orthogonalize !== false && shapeType !== 'five_corners' && shapeType !== 'freeform') {
      vertices = orthogonalizePolygon(vertices, 5);
    }
  } else if (shapeType === 'rectangular' && (plan.widthCm || plan.depthCm)) {
    const w = clamp(Number(plan.widthCm) || 400, 160, 1400);
    const d = clamp(Number(plan.depthCm) || 320, 160, 1400);
    vertices = [
      { id: 'v1', x: -w / 2, y: -d / 2 },
      { id: 'v2', x: w / 2, y: -d / 2 },
      { id: 'v3', x: w / 2, y: d / 2 },
      { id: 'v4', x: -w / 2, y: d / 2 },
    ];
  } else {
    vertices = getPresetRoomVertices(shapeType);
    warnings.push('No se recibieron vértices exactos del plano; se cargó la plantilla base para ajuste manual.');
  }

  const area = calculatePolygonArea(vertices);
  if (area < 1.5) {
    vertices = getPresetRoomVertices('rectangular');
    warnings.push('Las dimensiones interpretadas resultaban demasiado pequeñas; se aplicó un recinto estándar de respaldo.');
  }

  const finalRoomConfig: RoomConfig = {
    type: shapeType,
    wallHeight,
    wallThickness,
    vertices: centerVertices(vertices),
  };

  const generatedWalls: WallType[] = generateWallsFromRoom(finalRoomConfig);
  const roomPoly: [number, number][] = finalRoomConfig.vertices.map((v) => [v.x, v.y]);

  const newArchElements: ArchitecturalElement[] = [];
  for (const op of plan.openings || []) {
    const found = findWallByLabel(generatedWalls, op.wallLabel);
    if (!found) continue;
    const created = createArchitecturalElementOnWall(found.wall, op, wallHeight);
    if (created) newArchElements.push(created);
  }

  const newMepPoints = buildMepPointsOnWalls(plan.mepPoints || [], generatedWalls, roomPoly);

  const prevState = useKitchenStore.getState();
  // Guardar snapshot en historial para que sea reversible con Ctrl+Z
  const snapshot = {
    cabinets: JSON.parse(JSON.stringify(prevState.cabinets)),
    architecturalElements: JSON.parse(JSON.stringify(prevState.architecturalElements)),
    showSocle: prevState.showSocle,
    socleFinish: prevState.socleFinish,
    socleHeight: prevState.socleHeight || 10,
    golaSystem: prevState.golaSystem,
    countertopConfig: JSON.parse(JSON.stringify(prevState.countertopConfig)),
    islandBackConfig: JSON.parse(JSON.stringify(prevState.islandBackConfig)),
    mepPoints: JSON.parse(JSON.stringify(prevState.mepPoints)),
    handleConfig: JSON.parse(JSON.stringify(prevState.handleConfig)),
  };

  useKitchenStore.setState({
    history: [snapshot, ...(prevState.history || []).slice(0, 29)],
    future: [],
    roomConfig: finalRoomConfig,
    walls: generatedWalls,
    architecturalElements: newArchElements,
    mepPoints: newMepPoints,
    cabinets: plan.clearExistingCabinets !== false ? [] : prevState.cabinets,
    activeCabinetId: null,
    activeArchElementId: null,
    activeWallId: null,
    showMep: newMepPoints.length > 0 ? true : prevState.showMep,
  });

  const finalArea = calculatePolygonArea(finalRoomConfig.vertices);
  appliedSummary.push(`Recinto ${shapeType} (${finalArea.toFixed(1)} m², altura ${wallHeight} cm, ${generatedWalls.length} muros)`);
  if (newArchElements.length > 0) {
    const doors = newArchElements.filter((e) => e.type === 'door').length;
    const windows = newArchElements.filter((e) => e.type === 'window').length;
    const pillars = newArchElements.filter((e) => e.type === 'pillar').length;
    appliedSummary.push(
      `Aberturas: ${[doors ? `${doors} puerta(s)` : '', windows ? `${windows} ventana(s)` : '', pillars ? `${pillars} pilar(es)` : ''].filter(Boolean).join(', ')}`
    );
  }
  if (newMepPoints.length > 0) {
    appliedSummary.push(`Conexiones MEP ubicadas: ${newMepPoints.length} punto(s)`);
  }

  return {
    success: true,
    appliedSummary,
    warnings,
    adaptations,
    mepClashesCount: 0,
  };
}

export function executeFullDesignAction(design: AiFullDesignAction): AiExecutionReport {
  const appliedSummary: string[] = [];
  const warnings: string[] = [];
  const adaptations: string[] = [];

  const prevState = useKitchenStore.getState();
  const walls = prevState.walls && prevState.walls.length > 0
    ? prevState.walls
    : generateWallsFromRoom(prevState.roomConfig);
  const roomPoly: [number, number][] = (prevState.roomConfig?.vertices || []).map((v) => [v.x, v.y]);
  const archElements = prevState.architecturalElements || [];

  // Snapshot único para deshacer todo el diseño con 1 solo Ctrl+Z
  const snapshot = {
    cabinets: JSON.parse(JSON.stringify(prevState.cabinets)),
    architecturalElements: JSON.parse(JSON.stringify(prevState.architecturalElements)),
    showSocle: prevState.showSocle,
    socleFinish: prevState.socleFinish,
    socleHeight: prevState.socleHeight || 10,
    golaSystem: prevState.golaSystem,
    countertopConfig: JSON.parse(JSON.stringify(prevState.countertopConfig)),
    islandBackConfig: JSON.parse(JSON.stringify(prevState.islandBackConfig)),
    mepPoints: JSON.parse(JSON.stringify(prevState.mepPoints)),
    handleConfig: JSON.parse(JSON.stringify(prevState.handleConfig)),
  };

  const placedCabinets: CabinetType[] = design.replaceExistingCabinets === false ? [...prevState.cabinets] : [];
  let sinkCabinetId: string | null = null;
  let cooktopCabinetId: string | null = null;

  const baseTexture = resolveApprovedTexture(
    design.finishes?.lowerDoorsTexture || design.finishes?.doorsTexture
  ).texture;
  const wallTexture = resolveApprovedTexture(
    design.finishes?.upperDoorsTexture || design.finishes?.doorsTexture
  ).texture;
  const structTexture = resolveApprovedTexture(
    design.finishes?.structureTexture || design.finishes?.doorsTexture
  ).texture;

  const placeItemOnWall = (
    wall: WallType,
    item: AiDesignModuleItem,
    sStart: number,
    isUpperTier: boolean
  ): { cabinet: CabinetType | null; nextCursor: number } => {
    const resolved = resolveApprovedModuleTool(item.tool);
    const { entry, specs, wasFallback } = resolved;
    if (wasFallback) {
      adaptations.push(`Módulo "${item.tool}" adaptado al módulo de catálogo "${entry.name}".`);
    }

    let width = clamp(
      Number(item.widthCm) || specs.width,
      entry.minWidth,
      entry.maxWidth
    );
    const depth = clamp(Number(item.depthCm) || specs.depth, 25, 95);
    const height = clamp(Number(item.heightCm) || specs.height, 35, Math.min(240, (wall.height || 250) - 5));

    // Validar ancho mínimo si trae lavaplatos o encimera asignados
    if (item.hasSink || entry.variant === 'base_sink_2_doors' || entry.variant === 'sink_u_drawer') {
      const minSinkW = design.finishes?.sinkModel === 'alfa_twoc_f5858a' ? 90 : 80;
      if (width < minSinkW) width = clamp(minSinkW, entry.minWidth, entry.maxWidth);
    }
    if (item.hasCooktop || entry.variant === 'base_cooktop_3_drawers') {
      const minCookW = design.finishes?.cooktopModel === 'fdv_design_90' ? 90 : 60;
      if (width < minCookW) width = clamp(minCookW, entry.minWidth, entry.maxWidth);
    }

    const [x1, z1] = wall.start;
    const [x2, z2] = wall.end;
    const wLen = Math.hypot(x2 - x1, z2 - z1);
    const uX = (x2 - x1) / wLen;
    const uZ = (z2 - z1) / wLen;
    const [nX, nZ] = getWallInwardNormal(x1, z1, x2, z2, roomPoly);
    const wallThick = wall.thickness || prevState.roomConfig.wallThickness || 20;
    const cornerMargin = wallThick / 2 + 2;
    const maxS = wLen - cornerMargin;

    const tierForOpenings: 'lower' | 'upper' | 'full' =
      specs.type === 'tall' || specs.variant === 'deco_fridge'
        ? 'full'
        : isUpperTier || specs.type === 'wall' || specs.variant === 'deco_hood'
        ? 'upper'
        : 'lower';

    const blocked = buildWallOpeningsIntervals(wall, archElements, tierForOpenings);

    // Si hay un mueble perpendicular ya en la esquina inicial, respetar su profundidad (62 cm para bases/torres, 37 cm para aéreos)
    const minStart = Math.max(cornerMargin, sStart);
    const freeS = findNextFreeSpan(minStart, width, maxS, blocked);
    if (freeS === null) {
      warnings.push(`No cupo "${entry.name}" (${width} cm) en muro ${getWallLabel(walls.indexOf(wall))} sin invadir aberturas o esquinas.`);
      return { cabinet: null, nextCursor: sStart };
    }

    const centerS = freeS + width / 2;
    const flushDist = wallThick / 2 + depth / 2;
    const centerY =
      specs.type === 'wall'
        ? 140 + height / 2
        : specs.variant === 'deco_hood'
        ? 145 + height / 2
        : height / 2;

    const rawPos: [number, number, number] = [
      x1 + centerS * uX + flushDist * nX,
      centerY,
      z1 + centerS * uZ + flushDist * nZ,
    ];
    const rotation = Math.atan2(nX, nZ);

    const constrainedPos = constrainInsideRoomAndWalls(
      rawPos,
      rotation,
      width,
      depth,
      height,
      walls,
      roomPoly,
      archElements
    );

    const valid = isCandidateValid(
      { position: constrainedPos, width, depth, height, rotation, type: specs.type, variant: specs.variant } as any,
      placedCabinets,
      walls,
      null,
      roomPoly,
      archElements
    );

    if (!valid) {
      // Reintentar desplazando 65cm si chocó con corrida perpendicular en esquina
      const shiftedS = findNextFreeSpan(freeS + 64, width, maxS, blocked);
      if (shiftedS === null) {
        warnings.push(`Se omitió "${entry.name}" en muro ${getWallLabel(walls.indexOf(wall))} para evitar colisión con otro módulo o esquina.`);
        return { cabinet: null, nextCursor: freeS + width };
      }
      const altCenterS = shiftedS + width / 2;
      const altPos = constrainInsideRoomAndWalls(
        [x1 + altCenterS * uX + flushDist * nX, centerY, z1 + altCenterS * uZ + flushDist * nZ],
        rotation,
        width,
        depth,
        height,
        walls,
        roomPoly,
        archElements
      );
      const validAlt = isCandidateValid(
        { position: altPos, width, depth, height, rotation, type: specs.type, variant: specs.variant } as any,
        placedCabinets,
        walls,
        null,
        roomPoly,
        archElements
      );
      if (!validAlt) {
        warnings.push(`Se omitió "${entry.name}" en muro ${getWallLabel(walls.indexOf(wall))} por restricción de espacio.`);
        return { cabinet: null, nextCursor: shiftedS + width };
      }
      const cabAlt = buildCabinetObject(specs, width, height, depth, altPos, rotation, item, baseTexture, wallTexture, structTexture);
      placedCabinets.push(cabAlt);
      if (item.hasSink || cabAlt.variant === 'base_sink_2_doors' || cabAlt.variant === 'sink_u_drawer') sinkCabinetId = cabAlt.id;
      if (item.hasCooktop || cabAlt.variant === 'base_cooktop_3_drawers') cooktopCabinetId = cabAlt.id;
      return { cabinet: cabAlt, nextCursor: shiftedS + width };
    }

    const cab = buildCabinetObject(specs, width, height, depth, constrainedPos, rotation, item, baseTexture, wallTexture, structTexture);
    placedCabinets.push(cab);
    if (item.hasSink || cab.variant === 'base_sink_2_doors' || cab.variant === 'sink_u_drawer') sinkCabinetId = cab.id;
    if (item.hasCooktop || cab.variant === 'base_cooktop_3_drawers') cooktopCabinetId = cab.id;

    return { cabinet: cab, nextCursor: freeS + width };
  };

  // 1. Recorrer corridas de muros
  for (const run of design.wallRuns || []) {
    const found = findWallByLabel(walls, run.wallLabel);
    if (!found) continue;
    const { wall } = found;
    const wallThick = wall.thickness || prevState.roomConfig.wallThickness || 20;
    const baseStart = Math.max(wallThick / 2 + 2, Number(run.startOffsetCm) || wallThick / 2 + 2);

    // 1a. Módulos de piso (bases, torres, equipos)
    let lowerCursor = baseStart;
    for (const item of run.baseAndTallModules || []) {
      const startAt = item.offsetFromStartCm !== undefined ? Math.max(lowerCursor, item.offsetFromStartCm) : lowerCursor;
      const res = placeItemOnWall(wall, item, startAt, false);
      lowerCursor = res.nextCursor;
    }

    // 1b. Módulos aéreos / campanas
    let upperCursor = baseStart;
    for (const item of run.wallModules || []) {
      const startAt = item.offsetFromStartCm !== undefined ? Math.max(upperCursor, item.offsetFromStartCm) : upperCursor;
      const res = placeItemOnWall(wall, item, startAt, true);
      upperCursor = res.nextCursor;
    }
  }

  // 2. Isla central (solo si cabe respetando pasillo ergonómico >= 90 cm)
  if (design.island?.enabled && Array.isArray(design.island.modules) && design.island.modules.length > 0) {
    const islandDepth = clamp(Number(design.island.depthCm) || 80, 60, 110);
    const islandItems = design.island.modules.map((m) => {
      const resolved = resolveApprovedModuleTool(m.tool);
      const w = clamp(Number(m.widthCm) || resolved.specs.width, resolved.entry.minWidth, resolved.entry.maxWidth);
      return { item: m, resolved, width: w };
    });
    const totalIslandWidth = islandItems.reduce((acc, it) => acc + it.width, 0);

    // Evaluar dimensiones libres del recinto
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [vx, vz] of roomPoly) {
      if (vx < minX) minX = vx;
      if (vx > maxX) maxX = vx;
      if (vz < minZ) minZ = vz;
      if (vz > maxZ) maxZ = vz;
    }
    const roomW = maxX - minX;
    const roomD = maxZ - minZ;

    // Requiere al menos 60cm (base) + 90cm (pasillo) + islandDepth + 90cm (pasillo) = 240 + islandDepth cm en profundidad
    const minPass = 90;
    const canFitHorizontal = roomW >= totalIslandWidth + minPass * 2 && roomD >= islandDepth + 60 + minPass * 1.8;

    if (!canFitHorizontal) {
      warnings.push(
        `No se instaló isla (${totalIslandWidth}×${islandDepth} cm) porque el recinto no permite mantener pasillos ergonómicos mínimos de 90 cm.`
      );
    } else {
      const centerX = (minX + maxX) / 2;
      const centerZ = (minZ + maxZ) / 2 + 20;
      const islandRot = design.island.orientation === 'parallel_wall_b' ? Math.PI / 2 : 0;
      const cos = Math.cos(islandRot);
      const sin = Math.sin(islandRot);

      let cursor = -totalIslandWidth / 2;
      const islandTex = resolveApprovedTexture(
        design.finishes?.islandDoorsTexture || design.finishes?.doorsTexture
      ).texture;

      let placedIslandCount = 0;
      for (const it of islandItems) {
        const localCenter = cursor + it.width / 2;
        const pos: [number, number, number] = [
          centerX + localCenter * cos,
          40,
          centerZ + localCenter * sin,
        ];
        const valid = isCandidateValid(
          { position: pos, width: it.width, depth: islandDepth, height: 80, rotation: islandRot, type: 'island', variant: it.resolved.specs.variant } as any,
          placedCabinets,
          walls,
          null,
          roomPoly,
          archElements
        );
        if (valid) {
          const cab = buildCabinetObject(
            { ...it.resolved.specs, type: 'island' },
            it.width,
            80,
            islandDepth,
            pos,
            islandRot,
            it.item,
            islandTex,
            wallTexture,
            structTexture
          );
          placedCabinets.push(cab);
          if (it.item.hasSink) sinkCabinetId = cab.id;
          if (it.item.hasCooktop) cooktopCabinetId = cab.id;
          placedIslandCount++;
        }
        cursor += it.width;
      }

      if (placedIslandCount > 0) {
        appliedSummary.push(`Isla central de ${placedIslandCount} módulo(s) (${totalIslandWidth}×${islandDepth} cm)`);
        if (design.island.overhangBackCm !== undefined || design.island.waterfallSides) {
          useKitchenStore.getState().setCountertopConfig({
            islandOverhangBackCm: clamp(Number(design.island.overhangBackCm) || 30, 0, 45),
            islandWaterfallLeft: Boolean(design.island.waterfallSides),
            islandWaterfallRight: Boolean(design.island.waterfallSides),
          });
        }
      }
    }
  }

  // Aplicar gabinetes y guardar historial
  useKitchenStore.setState({
    history: [snapshot, ...(prevState.history || []).slice(0, 29)],
    future: [],
    cabinets: placedCabinets,
    activeCabinetId: null,
    viewMode: '3d',
  });

  appliedSummary.unshift(`Módulos instalados: ${placedCabinets.length} piezas del catálogo`);

  // Aplicar acabados, cubierta, tiradores, lavaplatos y encimera
  applyFinishesToStore(design.finishes, sinkCabinetId, cooktopCabinetId, appliedSummary, warnings, adaptations);

  // Chequear interferencias MEP reales tras colocar muebles
  const finalState = useKitchenStore.getState();
  const clashes = detectMepClashes(finalState.mepPoints, finalState.cabinets, finalState.countertopConfig);
  const criticalClashes = clashes.filter((c) => c.severity === 'critical');
  if (criticalClashes.length > 0) {
    warnings.push(`Se detectaron ${criticalClashes.length} interferencia(s) MEP en el panel de Instalaciones para revisión.`);
  }

  return {
    success: placedCabinets.length > 0,
    appliedSummary,
    warnings,
    adaptations,
    mepClashesCount: criticalClashes.length,
  };
}

export function executePatchDesignAction(patch: AiPatchDesignAction): AiExecutionReport {
  const appliedSummary: string[] = [];
  const warnings: string[] = [];
  const adaptations: string[] = [];

  const prevState = useKitchenStore.getState();
  const snapshot = {
    cabinets: JSON.parse(JSON.stringify(prevState.cabinets)),
    architecturalElements: JSON.parse(JSON.stringify(prevState.architecturalElements)),
    showSocle: prevState.showSocle,
    socleFinish: prevState.socleFinish,
    socleHeight: prevState.socleHeight || 10,
    golaSystem: prevState.golaSystem,
    countertopConfig: JSON.parse(JSON.stringify(prevState.countertopConfig)),
    islandBackConfig: JSON.parse(JSON.stringify(prevState.islandBackConfig)),
    mepPoints: JSON.parse(JSON.stringify(prevState.mepPoints)),
    handleConfig: JSON.parse(JSON.stringify(prevState.handleConfig)),
  };

  useKitchenStore.setState({
    history: [snapshot, ...(prevState.history || []).slice(0, 29)],
    future: [],
  });

  // 1. Eliminar isla o módulos específicos
  if (patch.clearIsland) {
    const remaining = useKitchenStore.getState().cabinets.filter((c) => c.type !== 'island');
    useKitchenStore.setState({ cabinets: remaining });
    appliedSummary.push('Se eliminó la isla central');
  }

  if (Array.isArray(patch.removeCabinetIds) && patch.removeCabinetIds.length > 0) {
    const idSet = new Set(patch.removeCabinetIds);
    const before = useKitchenStore.getState().cabinets.length;
    const remaining = useKitchenStore.getState().cabinets.filter((c) => !idSet.has(c.id));
    useKitchenStore.setState({ cabinets: remaining });
    const removed = before - remaining.length;
    if (removed > 0) appliedSummary.push(`Eliminados ${removed} módulo(s)`);
  }

  if (Array.isArray(patch.removeByVariant) && patch.removeByVariant.length > 0) {
    const varSet = new Set(patch.removeByVariant.map((v) => v.toLowerCase()));
    const before = useKitchenStore.getState().cabinets.length;
    const remaining = useKitchenStore.getState().cabinets.filter(
      (c) => !varSet.has((c.variant || '').toLowerCase())
    );
    useKitchenStore.setState({ cabinets: remaining });
    const removed = before - remaining.length;
    if (removed > 0) appliedSummary.push(`Eliminados ${removed} módulo(s) por tipo`);
  }

  // 2. Actualizar módulos existentes
  for (const upd of patch.updateCabinets || []) {
    const cab = useKitchenStore.getState().cabinets.find((c) => c.id === upd.cabinetId);
    if (!cab) continue;
    const changes: Partial<CabinetType> = {};
    if (upd.widthCm !== undefined) changes.width = clamp(Number(upd.widthCm), 15, 120);
    if (upd.heightCm !== undefined) changes.height = clamp(Number(upd.heightCm), 35, 240);
    if (upd.depthCm !== undefined) changes.depth = clamp(Number(upd.depthCm), 25, 100);
    if (upd.hingeSide === 'left' || upd.hingeSide === 'right') changes.hingeSide = upd.hingeSide;
    if (upd.doorTexture) {
      const tex = resolveApprovedTexture(upd.doorTexture);
      changes.doorColor = tex.texture.url;
      changes.doorMaterial = tex.texture.material;
      changes.drawerFrontColor = tex.texture.url;
      changes.drawerFrontMaterial = tex.texture.material;
    }
    useKitchenStore.getState().updateCabinet(cab.id, changes);
    appliedSummary.push(`Actualizado ${getCabinetLabel(cab, 0)}`);
  }

  // 3. Agregar nuevos módulos usando colocación inteligente libre de colisiones
  for (const item of patch.addModules || []) {
    const st = useKitchenStore.getState();
    const resolved = resolveApprovedModuleTool(item.tool);
    const { entry, specs, wasFallback } = resolved;
    if (wasFallback) {
      adaptations.push(`Módulo "${item.tool}" adaptado a "${entry.name}".`);
    }
    const width = clamp(Number(item.widthCm) || specs.width, entry.minWidth, entry.maxWidth);
    const height = clamp(Number(item.heightCm) || specs.height, 35, 240);
    const depth = clamp(Number(item.depthCm) || specs.depth, 25, 100);
    const placement = findSmartWallPlacement(
      { ...specs, width, height, depth },
      st.cabinets,
      st.walls,
      st.roomConfig?.vertices,
      st.architecturalElements
    );
    const refCab = st.cabinets.find((c) => c.type !== 'decoration');
    const newId = `cab_ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    st.addCabinet({
      id: newId,
      type: specs.type,
      variant: specs.variant,
      width,
      height,
      depth,
      position: placement.position,
      rotation: placement.rotation,
      color: refCab?.color || '#FFFFFF',
      structureColor: refCab?.structureColor || '#FFFFFF',
      doorColor: refCab?.doorColor || '#FFFFFF',
      drawerFrontColor: refCab?.drawerFrontColor || '#FFFFFF',
      structureMaterial: refCab?.structureMaterial || 'melamina',
      doorMaterial: refCab?.doorMaterial || 'melamina',
      drawerFrontMaterial: refCab?.drawerFrontMaterial || 'melamina',
      shelvesCount: specs.shelvesCount !== undefined ? specs.shelvesCount : (specs.type === 'wall' ? 2 : specs.type === 'tall' ? 4 : 1),
      drawersCount: specs.drawersCount,
      hingeSide: item.hingeSide,
    });
    appliedSummary.push(`Agregado ${entry.name} (${width} cm)`);
  }

  // 4. Agregar aberturas o puntos MEP adicionales
  if (Array.isArray(patch.addOpenings) && patch.addOpenings.length > 0) {
    const st = useKitchenStore.getState();
    for (const op of patch.addOpenings) {
      const found = findWallByLabel(st.walls, op.wallLabel);
      if (!found) continue;
      const el = createArchitecturalElementOnWall(found.wall, op, st.roomConfig.wallHeight || 250);
      if (el) {
        st.addArchitecturalElement(el);
        appliedSummary.push(`Agregada abertura: ${el.name}`);
      }
    }
  }

  if (Array.isArray(patch.addMepPoints) && patch.addMepPoints.length > 0) {
    const st = useKitchenStore.getState();
    const roomPoly: [number, number][] = (st.roomConfig?.vertices || []).map((v) => [v.x, v.y]);
    const pts = buildMepPointsOnWalls(patch.addMepPoints, st.walls, roomPoly);
    pts.forEach((p) => st.addMepPoint(p));
    if (pts.length > 0) appliedSummary.push(`Agregados ${pts.length} punto(s) MEP`);
  }

  // 5. Acabados / colores / cubiertas / tiradores
  applyFinishesToStore(patch.finishes, null, null, appliedSummary, warnings, adaptations);

  const finalState = useKitchenStore.getState();
  const clashes = detectMepClashes(finalState.mepPoints, finalState.cabinets, finalState.countertopConfig);
  const criticalClashes = clashes.filter((c) => c.severity === 'critical');

  return {
    success: true,
    appliedSummary,
    warnings,
    adaptations,
    mepClashesCount: criticalClashes.length,
  };
}

function buildCabinetObject(
  specs: ReturnType<typeof resolveApprovedModuleTool>['specs'],
  width: number,
  height: number,
  depth: number,
  position: [number, number, number],
  rotation: number,
  item: AiDesignModuleItem,
  baseTex: { url: string; material: 'melamina' | 'hpl' },
  wallTex: { url: string; material: 'melamina' | 'hpl' },
  structTex: { url: string; material: 'melamina' | 'hpl' }
): CabinetType {
  const frontTex = specs.type === 'wall' ? wallTex : baseTex;
  return {
    id: `cab_ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: specs.type,
    variant: specs.variant,
    width: Math.round(width),
    height: Math.round(height),
    depth: Math.round(depth),
    position,
    rotation,
    color: frontTex.url,
    structureColor: structTex.url,
    structureMaterial: structTex.material,
    doorColor: frontTex.url,
    doorMaterial: frontTex.material,
    drawerFrontColor: frontTex.url,
    drawerFrontMaterial: frontTex.material,
    shelfColor: structTex.url,
    shelfMaterial: structTex.material,
    shelvesCount:
      specs.shelvesCount !== undefined
        ? specs.shelvesCount
        : specs.type === 'wall'
        ? 2
        : specs.type === 'tall'
        ? 4
        : 1,
    drawersCount: specs.drawersCount,
    hasHanger: specs.hasHanger,
    hasDoors: specs.hasDoors,
    innerDrawers: specs.innerDrawers,
    blindWidth: specs.blindWidth,
    hingeSide: item.hingeSide,
  };
}
