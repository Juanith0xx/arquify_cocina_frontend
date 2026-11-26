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
  Box2D,
  checkOBBCollision,
  getWallInwardNormal,
  getWallBox2D,
  getPillarsBox2D,
  constrainInsideRoomAndWalls,
  isCandidateValid,
  findSmartWallPlacement,
  findPerpendicularCabinetForCorner,
} from './kitchenCollision';
import { calculateMepPositionOnWall } from './mepGeometry';
import { detectMepClashes } from './mepClashDetection';
import {
  AiModuleCatalogEntry,
  findCatalogEntryForCabinet,
  resolveApprovedTexture,
  resolveApprovedModuleTool,
  resolveApprovedCountertop,
  resolveWallColorHex,
  resolveFloorTypeId,
  resolveHandleConfig,
} from './kitchenAiCatalog';
import { SinkModelId, CooktopModelId, BacksplashMode } from '../types/countertop';
import { MepPoint, MepType, MepPresetType, MEP_TYPE_CONFIGS, MEP_PRESETS } from '../types/mep';
import { startKitchenBuildAnimation } from './kitchenBuildAnimation';

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
  widthCm?: number;
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
  offsetFromStartCm?: number;
  hingeSide?: 'left' | 'right';
  hasSink?: boolean;
  hasCooktop?: boolean;
}

export interface AiWallRunSpec {
  wallLabel: string;
  startOffsetCm?: number;
  baseAndTallModules?: AiDesignModuleItem[];
  wallModules?: AiDesignModuleItem[];
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
  moveIsland?: {
    deltaXCm?: number;
    deltaZCm?: number;
  };
  updateCabinets?: Array<{
    cabinetId: string;
    widthCm?: number;
    heightCm?: number;
    depthCm?: number;
    hingeSide?: 'left' | 'right';
    doorTexture?: string;
    deltaXCm?: number;
    deltaZCm?: number;
    xCm?: number;
    zCm?: number;
    position?: [number, number, number];
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

/**
 * Convención exacta de rotación Y de Three.js usada por Cabinet.tsx y KitchenCountertop3D.tsx:
 *   Eje local +X (ancho / derecha): [ cos(rot), -sin(rot) ]
 *   Eje local +Z (frente puertas):  [ sin(rot),  cos(rot) ]
 */
function getThreeRightVector(rot: number): [number, number] {
  return [Math.cos(rot), -Math.sin(rot)];
}

function getThreeFrontVector(rot: number): [number, number] {
  return [Math.sin(rot), Math.cos(rot)];
}

function getThreeCabinetBox2D(cab: {
  position: [number, number, number];
  width: number;
  depth: number;
  height: number;
  rotation?: number;
}): Box2D {
  const rot = Number(cab.rotation) || 0;
  const [rX, rZ] = getThreeRightVector(rot);
  const [fX, fZ] = getThreeFrontVector(rot);
  const cx = Number(cab.position[0]) || 0;
  const cy = Number(cab.position[1]) || cab.height / 2;
  const cz = Number(cab.position[2]) || 0;
  const hw = cab.width / 2;
  const hd = cab.depth / 2;

  const corners: [number, number][] = [
    [cx - hw * rX - hd * fX, cz - hw * rZ - hd * fZ],
    [cx + hw * rX - hd * fX, cz + hw * rZ - hd * fZ],
    [cx + hw * rX + hd * fX, cz + hw * rZ + hd * fZ],
    [cx - hw * rX + hd * fX, cz - hw * rZ + hd * fZ],
  ];

  return {
    corners,
    center: [cx, cz],
    axes: [
      [rX, rZ],
      [fX, fZ],
    ],
    width: cab.width,
    depth: cab.depth,
    rotation: rot,
    yMin: cy - cab.height / 2,
    yMax: cy + cab.height / 2,
  };
}

function hasFrontOpeningMechanism(cab: { type?: string; variant?: string }): boolean {
  const v = (cab.variant || '').toLowerCase();
  if (
    v === 'wall_open' ||
    v === 'tall_open' ||
    v === 'deco_plant' ||
    v === 'deco_hood' ||
    v.includes('wine_rack')
  ) {
    return false;
  }
  return true;
}

/**
 * Proyecta la zona de abatimiento / extracción frontal frente a puertas y cajones.
 * Recorta 4cm por cada flanco para no marcar falsos positivos con muebles coplanares contiguos.
 */
function getFrontClearanceBox2D(cab: {
  position: [number, number, number];
  width: number;
  depth: number;
  height: number;
  rotation?: number;
  type?: string;
  variant?: string;
}): Box2D | null {
  if (!hasFrontOpeningMechanism(cab)) return null;

  const rot = Number(cab.rotation) || 0;
  const [rX, rZ] = getThreeRightVector(rot);
  const [fX, fZ] = getThreeFrontVector(rot);
  const v = (cab.variant || '').toLowerCase();

  // Profundidad real de apertura ergonómica
  const swingDepth =
    cab.type === 'wall'
      ? 38
      : v === 'deco_fridge'
      ? 72
      : v === 'deco_dishwasher'
      ? 62
      : 52;

  const clearWidth = Math.max(12, cab.width - 8);
  const offsetFront = cab.depth / 2 + swingDepth / 2 + 1.5;
  const cx = cab.position[0] + fX * offsetFront;
  const cz = cab.position[2] + fZ * offsetFront;
  const hw = clearWidth / 2;
  const hd = swingDepth / 2;

  const corners: [number, number][] = [
    [cx - hw * rX - hd * fX, cz - hw * rZ - hd * fZ],
    [cx + hw * rX - hd * fX, cz + hw * rZ - hd * fZ],
    [cx + hw * rX + hd * fX, cz + hw * rZ + hd * fZ],
    [cx - hw * rX + hd * fX, cz - hw * rZ + hd * fZ],
  ];

  const cy = cab.position[1];
  return {
    corners,
    center: [cx, cz],
    axes: [
      [rX, rZ],
      [fX, fZ],
    ],
    width: clearWidth,
    depth: swingDepth,
    rotation: rot,
    yMin: cy - cab.height / 2 + 6,
    yMax: cy + cab.height / 2 - 6,
  };
}

function isCornerModuleVariant(variant?: string): boolean {
  const v = (variant || '').toLowerCase();
  return (
    v === 'corner_l' ||
    v === 'base_corner_l' ||
    v.startsWith('corner_blind') ||
    v.startsWith('wall_corner_blind')
  );
}

function isFullHeightBlocker(cab: { type?: string; variant?: string; height?: number }): boolean {
  return cab.type === 'tall' || cab.variant === 'deco_fridge' || (cab.height || 0) >= 150;
}

/**
 * Valida que el candidato NO colisione con otros muebles, NI quede con su puerta/cajón bloqueado,
 * NI bloquee la apertura frontal de ningún mueble ya instalado (ej. Base 1 Puerta atrapado frente a Despensa).
 */
function hasClearFrontAccessAndNoClash(
  candidate: {
    position: [number, number, number];
    width: number;
    depth: number;
    height: number;
    rotation: number;
    type: string;
    variant?: string;
  },
  placedCabinets: CabinetType[],
  walls: WallType[],
  archElements: ArchitecturalElement[],
  roomPoly: [number, number][]
): boolean {
  const candBody = getThreeCabinetBox2D(candidate);
  const candFront = getFrontClearanceBox2D(candidate);
  const candIsCorner = isCornerModuleVariant(candidate.variant);

  // 1. Chequear contra todos los muebles ya colocados
  for (const existing of placedCabinets) {
    const exBody = getThreeCabinetBox2D(existing);

    // 1a. Colisión cuerpo-cuerpo exacta en coordenadas Three.js
    if (checkOBBCollision(candBody, exBody, 0.8).colliding) {
      return false;
    }

    // 1b. El frente de apertura del nuevo mueble no puede ser obstruido por un mueble existente
    if (candFront && !candIsCorner) {
      if (checkOBBCollision(candFront, exBody, 1.5).colliding) {
        return false;
      }
    }

    // 1c. El cuerpo del nuevo mueble no puede obstruir la apertura frontal de un mueble existente
    const exIsCorner = isCornerModuleVariant(existing.variant);
    if (!exIsCorner) {
      const exFront = getFrontClearanceBox2D(existing);
      if (exFront && checkOBBCollision(candBody, exFront, 1.5).colliding) {
        return false;
      }
    }
  }

  // 2. El frente de apertura no debe chocar contra muros perimetrales/interiores ni pilares
  if (candFront) {
    for (const w of walls) {
      const wallBox = getWallBox2D(w);
      if (checkOBBCollision(candFront, wallBox, 2.0).colliding) {
        return false;
      }
    }
    const pillarBoxes = getPillarsBox2D(archElements, walls, roomPoly);
    for (const pb of pillarBoxes) {
      if (checkOBBCollision(candFront, pb, 2.0).colliding) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Aplica los límites normativos exactos del catálogo y reporta si el agente pidió una medida fija inválida
 * (por ejemplo, intentar cambiar el ancho de New Flow 60 de 60cm a 80cm).
 */
function enforceCatalogDimensions(
  entry: AiModuleCatalogEntry,
  requestedWidth: number | undefined,
  requestedHeight: number | undefined,
  requestedDepth: number | undefined,
  wallHeight: number,
  adaptations: string[]
): { width: number; height: number; depth: number } {
  if (entry.fixedDimensions) {
    if (
      requestedWidth !== undefined &&
      Math.abs(Number(requestedWidth) - entry.defaultWidth) > 1
    ) {
      adaptations.push(
        `${entry.name} tiene medidas fijas de electrodoméstico (${entry.defaultWidth}×${entry.defaultHeight}×${entry.defaultDepth} cm); no se modificó su ancho.`
      );
    }
    return {
      width: entry.defaultWidth,
      height: entry.defaultHeight,
      depth: entry.defaultDepth,
    };
  }

  let width = entry.fixedWidth
    ? entry.defaultWidth
    : clamp(Number(requestedWidth) || entry.defaultWidth, entry.minWidth, entry.maxWidth);

  if (
    entry.fixedWidth &&
    requestedWidth !== undefined &&
    Math.abs(Number(requestedWidth) - entry.defaultWidth) > 0.5
  ) {
    adaptations.push(
      `${entry.name} mantiene su ancho normativo fijo de ${entry.defaultWidth} cm (no modificable por electrodoméstico/geometría).`
    );
  }

  const maxAllowedH = Math.min(entry.maxHeight, Math.max(entry.minHeight, wallHeight - 5));
  const height = clamp(Number(requestedHeight) || entry.defaultHeight, entry.minHeight, maxAllowedH);
  const depth = clamp(Number(requestedDepth) || entry.defaultDepth, entry.minDepth, entry.maxDepth);

  return { width, height, depth };
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
    const margin = el.type === 'door' ? 10 : 5;

    if (el.type === 'door') {
      intervals.push({ start: centerS - halfW - margin, end: centerS + halfW + margin, reason: 'puerta' });
    } else if (el.type === 'pillar') {
      intervals.push({ start: centerS - halfW - 4, end: centerS + halfW + 4, reason: 'pilar' });
    } else if (el.type === 'window') {
      const elev = el.elevation ?? 100;
      if (tier === 'upper' || tier === 'full') {
        intervals.push({ start: centerS - halfW - margin, end: centerS + halfW + margin, reason: 'ventana' });
      } else if (tier === 'lower' && elev < 88) {
        intervals.push({ start: centerS - halfW - margin, end: centerS + halfW + margin, reason: 'ventana baja' });
      }
    }
  }

  return intervals.sort((a, b) => a.start - b.start);
}

/**
 * Calcula los tramos de esquina en `wall` que YA están ocupados por muebles colocados en muros
 * perpendiculares (por ejemplo una Despensa, Refrigerador o corrida base/aérea a 90°),
 * evitando que se coloquen puertas o cajones atrapados contra el costado de una torre o esquina.
 */
function buildPerpendicularCornerIntervals(
  wall: WallType,
  placedCabinets: CabinetType[],
  roomPoly: [number, number][],
  candidateTier: 'lower' | 'upper' | 'full',
  candidateIsCorner: boolean
): Array<{ start: number; end: number; reason: string }> {
  const [x1, z1] = wall.start;
  const [x2, z2] = wall.end;
  const wLen = Math.hypot(x2 - x1, z2 - z1);
  if (wLen < 10) return [];

  const uX = (x2 - x1) / wLen;
  const uZ = (z2 - z1) / wLen;
  const [nX, nZ] = getWallInwardNormal(x1, z1, x2, z2, roomPoly);
  const wallThick = wall.thickness || 20;
  const intervals: Array<{ start: number; end: number; reason: string }> = [];

  for (const cab of placedCabinets) {
    if (cab.type === 'island') continue;

    // Verificar si hay superposición vertical relevante con el nivel que vamos a colocar
    const cabIsTallOrFridge = isFullHeightBlocker(cab);
    const cabIsUpper = cab.type === 'wall' || cab.variant === 'deco_hood';
    const cabIsLower = !cabIsUpper && !cabIsTallOrFridge;

    const verticalConflict =
      cabIsTallOrFridge ||
      candidateTier === 'full' ||
      (candidateTier === 'lower' && cabIsLower) ||
      (candidateTier === 'upper' && cabIsUpper);

    if (!verticalConflict) continue;

    // Verificar si el mueble existente está orientado aproximadamente perpendicular a este muro
    const [cabFX, cabFZ] = getThreeFrontVector(cab.rotation || 0);
    const dotNormals = Math.abs(cabFX * nX + cabFZ * nZ);
    if (dotNormals > 0.5) continue; // Mismo muro o muro opuesto, no perpendicular

    // Proyectar las 4 esquinas exactas del mueble existente sobre este muro (eje u) y distancia normal (eje n)
    const box = getThreeCabinetBox2D(cab);
    let minS = Infinity;
    let maxS = -Infinity;
    let minDistToWallInner = Infinity;

    for (const [px, pz] of box.corners) {
      const s = (px - x1) * uX + (pz - z1) * uZ;
      const distNormal = (px - x1) * nX + (pz - z1) * nZ - wallThick / 2;
      if (s < minS) minS = s;
      if (s > maxS) maxS = s;
      if (distNormal < minDistToWallInner) minDistToWallInner = distNormal;
    }

    // Si el mueble perpendicular está cerca de este muro (dentro de la franja de profundidad del mueble <= 85 cm)
    const relevantDepthBand = candidateTier === 'upper' ? 50 : 85;
    if (minDistToWallInner <= relevantDepthBand && maxS >= -5 && minS <= wLen + 5) {
      // Si el mueble perpendicular es una Torre o Refrigerador, NINGÚN mueble puede entrar ahí (+8cm holgura apertura)
      // Si es un Base/Aéreo normal, solo se respeta despeje si el candidato no es un esquinero diseñado para encuentro a 90°
      if (cabIsTallOrFridge) {
        const clearance = 8;
        intervals.push({
          start: minS - clearance,
          end: maxS + clearance,
          reason: 'torre/refrigerador en esquina perpendicular',
        });
      } else if (!candidateIsCorner) {
        // Si el mueble perpendicular ya es un esquinero ciego o en L, trae su propia franja de holgura (5 cm)
        // integrada y debe recibir la corrida perpendicular a tope (0 cm) sin dejar huecos visibles en el rincón.
        const clearance = isCornerModuleVariant(cab.variant) ? 0 : 6;
        intervals.push({
          start: minS - clearance,
          end: maxS + clearance,
          reason: 'corrida perpendicular en esquina',
        });
      }
    }
  }

  return intervals;
}

function findNextFreeSpan(
  cursor: number,
  width: number,
  maxS: number,
  blocked: Array<{ start: number; end: number; reason: string }>
): number | null {
  let s = cursor;
  for (let guard = 0; guard < 30; guard++) {
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

  let width = clamp(
    Number(spec.widthCm) || (spec.type === 'door' ? 90 : spec.type === 'window' ? 120 : 35),
    15,
    Math.max(20, wLen - 16)
  );
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

  if (finishes.showSocle !== undefined) {
    useKitchenStore.getState().setShowSocle(Boolean(finishes.showSocle));
  }
  if (finishes.socleFinish === 'aluminum' || finishes.socleFinish === 'black') {
    useKitchenStore.getState().setSocleFinish(finishes.socleFinish);
  }
  if (finishes.socleHeightCm !== undefined) {
    useKitchenStore.getState().setSocleHeight(clamp(Number(finishes.socleHeightCm) || 10, 8, 15));
  }

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

/**
 * Calcula un rectángulo interior REALMENTE libre y ergonómico para instalar la isla,
 * descontando todos los muebles en todos los muros (A, B, C, D...), puertas de acceso
 * y pasillos normativos (>=105cm frente a muebles/electrodomésticos y >=90cm frente a muros libres).
 */
function placeErgonomicIsland(
  islandSpec: AiIslandSpec,
  placedCabinets: CabinetType[],
  walls: WallType[],
  roomPoly: [number, number][],
  archElements: ArchitecturalElement[],
  wallThickness: number,
  islandTex: { url: string; material: 'melamina' | 'hpl' },
  wallTex: { url: string; material: 'melamina' | 'hpl' },
  structTex: { url: string; material: 'melamina' | 'hpl' },
  appliedSummary: string[],
  warnings: string[],
  adaptations: string[]
): { sinkCabId: string | null; cooktopCabId: string | null; placedCount: number } {
  let sinkCabId: string | null = null;
  let cooktopCabId: string | null = null;

  const islandDepth = clamp(Number(islandSpec.depthCm) || 80, 60, 105);
  const rawItems = islandSpec.modules.map((m) => {
    const resolved = resolveApprovedModuleTool(m.tool);
    const dims = enforceCatalogDimensions(
      resolved.entry,
      m.widthCm,
      80,
      islandDepth,
      250,
      adaptations
    );
    return { item: m, resolved, width: dims.width };
  });

  if (rawItems.length === 0) {
    return { sinkCabId, cooktopCabId, placedCount: 0 };
  }

  // 1. Límites interiores reales del recinto
  let roomMinX = Infinity, roomMaxX = -Infinity, roomMinZ = Infinity, roomMaxZ = -Infinity;
  for (const [vx, vz] of roomPoly) {
    if (vx < roomMinX) roomMinX = vx;
    if (vx > roomMaxX) roomMaxX = vx;
    if (vz < roomMinZ) roomMinZ = vz;
    if (vz > roomMaxZ) roomMaxZ = vz;
  }
  const halfWall = wallThickness / 2;
  const innerMinX = roomMinX + halfWall;
  const innerMaxX = roomMaxX - halfWall;
  const innerMinZ = roomMinZ + halfWall;
  const innerMaxZ = roomMaxZ - halfWall;

  // 2. Descontar todos los muebles de muro ya colocados + pasillo de trabajo ergonómico (105 cm mínimo, 115 cm frente a refri/horno)
  const PASS_EMPTY_WALL = 90;
  const PASS_WORK_RUN = 105;
  const PASS_APPLIANCE = 115;

  let freeMinX = innerMinX + PASS_EMPTY_WALL;
  let freeMaxX = innerMaxX - PASS_EMPTY_WALL;
  let freeMinZ = innerMinZ + PASS_EMPTY_WALL;
  let freeMaxZ = innerMaxZ - PASS_EMPTY_WALL;

  // Contar longitud de trabajo por orientación para elegir la cara principal hacia donde debe mirar la isla
  let workScoreNorth = 0; // Wall A (-Z), muebles miran hacia +Z
  let workScoreSouth = 0; // Wall C (+Z), muebles miran hacia -Z
  let workScoreEast = 0;  // Wall B (+X), muebles miran hacia -X
  let workScoreWest = 0;  // Wall D (-X), muebles miran hacia +X

  for (const cab of placedCabinets) {
    if (cab.type === 'island' || cab.type === 'wall' || cab.variant === 'deco_hood') continue;
    const box = getThreeCabinetBox2D(cab);
    const [fX, fZ] = getThreeFrontVector(cab.rotation || 0);
    const isHeavyAppliance =
      cab.variant === 'deco_fridge' ||
      cab.variant === 'deco_dishwasher' ||
      cab.variant === 'tall_oven_micro' ||
      cab.variant === 'tall_oven_vent';
    const aisle = isHeavyAppliance ? PASS_APPLIANCE : PASS_WORK_RUN;

    let cMinX = Infinity, cMaxX = -Infinity, cMinZ = Infinity, cMaxZ = -Infinity;
    for (const [px, pz] of box.corners) {
      if (px < cMinX) cMinX = px;
      if (px > cMaxX) cMaxX = px;
      if (pz < cMinZ) cMinZ = pz;
      if (pz > cMaxZ) cMaxZ = pz;
    }

    if (fZ > 0.7) {
      // Mueble en muro norte (-Z) mirando hacia +Z
      freeMinZ = Math.max(freeMinZ, cMaxZ + aisle);
      workScoreNorth += cab.width;
    } else if (fZ < -0.7) {
      // Mueble en muro sur (+Z) mirando hacia -Z
      freeMaxZ = Math.min(freeMaxZ, cMinZ - aisle);
      workScoreSouth += cab.width;
    } else if (fX < -0.7) {
      // Mueble en muro este (+X) mirando hacia -X
      freeMaxX = Math.min(freeMaxX, cMinX - aisle);
      workScoreEast += cab.width;
    } else if (fX > 0.7) {
      // Mueble en muro oeste (-X) mirando hacia +X
      freeMinX = Math.max(freeMinX, cMaxX + aisle);
      workScoreWest += cab.width;
    }
  }

  // 3. Descontar puertas de acceso (100 cm de paso libre frente a puertas)
  for (const el of archElements) {
    if (el.type !== 'door') continue;
    const [dx, , dz] = el.position;
    const distNorth = Math.abs(dz - roomMinZ);
    const distSouth = Math.abs(dz - roomMaxZ);
    const distWest = Math.abs(dx - roomMinX);
    const distEast = Math.abs(dx - roomMaxX);
    const minD = Math.min(distNorth, distSouth, distWest, distEast);
    if (minD === distNorth) freeMinZ = Math.max(freeMinZ, innerMinZ + 100);
    else if (minD === distSouth) freeMaxZ = Math.min(freeMaxZ, innerMaxZ - 100);
    else if (minD === distWest) freeMinX = Math.max(freeMinX, innerMinX + 100);
    else freeMaxX = Math.min(freeMaxX, innerMaxX - 100);
  }

  const availX = Math.floor(freeMaxX - freeMinX);
  const availZ = Math.floor(freeMaxZ - freeMinZ);

  // 4. Determinar orientación ergonómica óptima (paralela a la corrida principal, frentes mirando hacia la zona de trabajo)
  const scoreHoriz = Math.max(workScoreNorth, workScoreSouth);
  const scoreVert = Math.max(workScoreEast, workScoreWest);

  const horizRot = workScoreNorth >= workScoreSouth ? Math.PI : 0; // rot=PI mira hacia -Z (Muro A)
  const vertRot = workScoreEast >= workScoreWest ? Math.PI / 2 : -Math.PI / 2; // rot=PI/2 mira hacia +X (Muro B)

  type CandidateOrient = { rot: number; availLen: number; availDep: number; label: string };
  const orientHorizontal: CandidateOrient = { rot: horizRot, availLen: availX, availDep: availZ, label: 'horizontal' };
  const orientVertical: CandidateOrient = { rot: vertRot, availLen: availZ, availDep: availX, label: 'vertical' };

  const orderedOrients: CandidateOrient[] =
    islandSpec.orientation === 'parallel_wall_b' || (islandSpec.orientation === undefined && scoreVert > scoreHoriz)
      ? [orientVertical, orientHorizontal]
      : [orientHorizontal, orientVertical];

  let chosenOrient: CandidateOrient | null = null;
  let fittedItems = [...rawItems];

  for (const cand of orderedOrients) {
    if (cand.availDep < islandDepth || cand.availLen < 120) continue;

    // Si todos los módulos caben exactamente, usarlos tal cual
    let totalW = rawItems.reduce((acc, it) => acc + it.width, 0);
    if (totalW <= cand.availLen) {
      chosenOrient = cand;
      fittedItems = [...rawItems];
      break;
    }

    // Si excede un poco, recortar módulos finales opcionales hasta que quepa ergonómicamente (>=120cm)
    const trimmed = [...rawItems];
    while (trimmed.length > 1 && totalW > cand.availLen) {
      const popped = trimmed.pop()!;
      totalW -= popped.width;
    }
    if (totalW <= cand.availLen && totalW >= 120) {
      chosenOrient = cand;
      fittedItems = trimmed;
      adaptations.push(
        `Se ajustó el largo de la isla a ${Math.round(totalW)} cm para respetar pasillos ergonómicos mínimos de 105 cm alrededor.`
      );
      break;
    }
  }

  if (!chosenOrient) {
    warnings.push(
      `No se instaló isla porque el espacio interior libre (${Math.max(0, availX)}×${Math.max(0, availZ)} cm descontando muebles y pasillos de 105 cm) no permite ubicar una isla funcional de ${islandDepth} cm de fondo.`
    );
    return { sinkCabId, cooktopCabId, placedCount: 0 };
  }

  // 5. Posicionar todos los módulos de la isla como bloque atómico perfectamente alineado en Three.js
  const centerX = (freeMinX + freeMaxX) / 2;
  const centerZ = (freeMinZ + freeMaxZ) / 2;
  const rot = chosenOrient.rot;
  const [rX, rZ] = getThreeRightVector(rot);
  const totalWidth = fittedItems.reduce((acc, it) => acc + it.width, 0);

  let cursor = -totalWidth / 2;
  const candidateIslandCabinets: CabinetType[] = [];

  for (const it of fittedItems) {
    const localX = cursor + it.width / 2;
    const pos: [number, number, number] = [
      centerX + localX * rX,
      40,
      centerZ + localX * rZ,
    ];

    const validPhysics = isCandidateValid(
      { position: pos, width: it.width, depth: islandDepth, height: 80, rotation: rot, type: 'island', variant: it.resolved.specs.variant } as any,
      [...placedCabinets, ...candidateIslandCabinets],
      walls,
      null,
      roomPoly,
      archElements
    );

    const validErgonomics = hasClearFrontAccessAndNoClash(
      { position: pos, width: it.width, depth: islandDepth, height: 80, rotation: rot, type: 'island', variant: it.resolved.specs.variant },
      [...placedCabinets, ...candidateIslandCabinets],
      walls,
      archElements,
      roomPoly
    );

    if (!validPhysics || !validErgonomics) {
      warnings.push(
        'Se omitió la isla porque alguno de sus frentes o pasillos colisionaba con el abatimiento de los muebles de cocina.'
      );
      return { sinkCabId: null, cooktopCabId: null, placedCount: 0 };
    }

    const cab = buildCabinetObject(
      { ...it.resolved.specs, type: 'island' },
      it.width,
      80,
      islandDepth,
      pos,
      rot,
      it.item,
      islandTex,
      wallTex,
      structTex
    );
    candidateIslandCabinets.push(cab);
    if (it.item.hasSink) sinkCabId = cab.id;
    if (it.item.hasCooktop) cooktopCabId = cab.id;
    cursor += it.width;
  }

  // Confirmar bloque atómico completo
  placedCabinets.push(...candidateIslandCabinets);
  appliedSummary.push(
    `Isla ergonómica de ${candidateIslandCabinets.length} módulo(s) (${Math.round(totalWidth)}×${islandDepth} cm, pasillos ≥105 cm)`
  );

  return { sinkCabId, cooktopCabId, placedCount: candidateIslandCabinets.length };
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

    const enforced = enforceCatalogDimensions(
      entry,
      item.widthCm,
      item.heightCm,
      item.depthCm,
      wall.height || prevState.roomConfig.wallHeight || 250,
      adaptations
    );
    let { width } = enforced;
    const { height, depth } = enforced;

    // Validar ancho mínimo si trae lavaplatos o encimera asignados (solo si el módulo NO es de ancho fijo)
    if (!entry.fixedWidth) {
      if (item.hasSink || entry.variant === 'base_sink_2_doors') {
        const minSinkW = design.finishes?.sinkModel === 'alfa_twoc_f5858a' ? 90 : 80;
        if (width < minSinkW) width = clamp(minSinkW, entry.minWidth, entry.maxWidth);
      }
      if (item.hasCooktop || entry.variant === 'base_cooktop_3_drawers') {
        const minCookW = design.finishes?.cooktopModel === 'fdv_design_90' ? 90 : 80;
        if (width < minCookW) width = clamp(minCookW, entry.minWidth, entry.maxWidth);
      }
    }

    const [x1, z1] = wall.start;
    const [x2, z2] = wall.end;
    const wLen = Math.hypot(x2 - x1, z2 - z1);
    const uX = (x2 - x1) / wLen;
    const uZ = (z2 - z1) / wLen;
    const [nX, nZ] = getWallInwardNormal(x1, z1, x2, z2, roomPoly);
    const wallThick = wall.thickness || prevState.roomConfig.wallThickness || 20;
    const candIsCorner = isCornerModuleVariant(specs.variant);
    const cornerMargin = candIsCorner ? wallThick / 2 : wallThick / 2 + 2;
    const maxS = wLen - cornerMargin;

    const tierForRules: 'lower' | 'upper' | 'full' =
      specs.type === 'tall' || specs.variant === 'deco_fridge'
        ? 'full'
        : isUpperTier || specs.type === 'wall' || specs.variant === 'deco_hood'
        ? 'upper'
        : 'lower';

    // Combinar aberturas arquitectónicas + ocupación real de muebles/torres en esquinas perpendiculares
    const openingBlocks = buildWallOpeningsIntervals(wall, archElements, tierForRules);
    const perpCornerBlocks = buildPerpendicularCornerIntervals(
      wall,
      placedCabinets,
      roomPoly,
      tierForRules,
      candIsCorner
    );
    const allBlocked = [...openingBlocks, ...perpCornerBlocks].sort((a, b) => a.start - b.start);

    const flushDist = wallThick / 2 + depth / 2;
    const centerY =
      specs.variant === 'wall_hood_new_flow'
        ? 145 + height / 2
        : specs.type === 'wall'
        ? 140 + height / 2
        : specs.variant === 'deco_hood'
        ? 145 + height / 2
        : height / 2;
    const rotation = Math.atan2(nX, nZ);

    // Buscar primer tramo libre que además pase colisión física + despeje de apertura frontal (puertas/cajones)
    let searchCursor = Math.max(cornerMargin, sStart);
    for (let attempt = 0; attempt < 18; attempt++) {
      const freeS = findNextFreeSpan(searchCursor, width, maxS, allBlocked);
      if (freeS === null) break;

      const centerS = freeS + width / 2;
      const rawPos: [number, number, number] = [
        x1 + centerS * uX + flushDist * nX,
        centerY,
        z1 + centerS * uZ + flushDist * nZ,
      ];

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

      const candidateObj = {
        position: constrainedPos,
        width,
        depth,
        height,
        rotation,
        type: specs.type,
        variant: specs.variant,
      };

      const validPhysics = isCandidateValid(
        candidateObj as any,
        placedCabinets,
        walls,
        null,
        roomPoly,
        archElements
      );

      const validAccess = hasClearFrontAccessAndNoClash(
        candidateObj,
        placedCabinets,
        walls,
        archElements,
        roomPoly
      );

      if (validPhysics && validAccess) {
        // Determinar orientación real del lado ciego según qué extremo del muro (inicio vs fin) ocupa el esquinero
        let resolvedSpecs = specs;
        if (
          specs.variant?.startsWith('corner_blind') ||
          specs.variant?.startsWith('wall_corner_blind')
        ) {
          const [rX, rZ] = getThreeRightVector(rotation);
          const rightDotU = rX * uX + rZ * uZ;
          const distToStart = freeS - wallThick / 2;
          const distToEnd = wLen - wallThick / 2 - (freeS + width);
          const cornerTowardEnd = distToEnd <= distToStart;
          const blindShouldBeRight = cornerTowardEnd ? rightDotU >= 0 : rightDotU < 0;
          const isWallBlind = specs.variant.startsWith('wall_corner_blind');
          resolvedSpecs = {
            ...specs,
            variant: isWallBlind
              ? (blindShouldBeRight ? 'wall_corner_blind_right' : 'wall_corner_blind_left')
              : (blindShouldBeRight ? 'corner_blind_right' : 'corner_blind_left'),
          };
        }

        const cab = buildCabinetObject(
          resolvedSpecs,
          width,
          height,
          depth,
          constrainedPos,
          rotation,
          item,
          baseTexture,
          wallTexture,
          structTexture
        );
        placedCabinets.push(cab);
        if (item.hasSink || cab.variant === 'base_sink_2_doors') {
          sinkCabinetId = cab.id;
        }
        if (item.hasCooktop || cab.variant === 'base_cooktop_3_drawers') {
          cooktopCabinetId = cab.id;
        }
        return { cabinet: cab, nextCursor: freeS + width };
      }

      // Avanzar en pasos de 10 cm para sortear esquinas, torres o bloqueos de abatimiento
      searchCursor = freeS + 10;
    }

    warnings.push(
      `Se omitió "${entry.name}" (${width} cm) en muro ${getWallLabel(walls.indexOf(wall))} porque no tenía despeje libre de apertura o invadía una esquina/abertura.`
    );
    return { cabinet: null, nextCursor: sStart };
  };

  // 1. Recorrer corridas de muros (primero bases/torres de todos los muros para detectar esquinas reales, luego aéreos)
  const resolvedRuns = (design.wallRuns || [])
    .map((run) => {
      const found = findWallByLabel(walls, run.wallLabel);
      return found ? { run, wall: found.wall } : null;
    })
    .filter((x): x is { run: AiWallRunSpec; wall: WallType } => Boolean(x));

  // 1a. Módulos de piso (bases, torres, equipos) en todos los muros
  // Priorizar corridas que contienen un esquinero (ciego o en L) para que reclamen el rincón exacto primero
  // y la corrida perpendicular se acople a tope (0 cm) sin huecos.
  const orderedLowerRuns = [...resolvedRuns].sort((a, b) => {
    const aHasCorner = (a.run.baseAndTallModules || []).some((m) =>
      isCornerModuleVariant(resolveApprovedModuleTool(m.tool).specs.variant)
    );
    const bHasCorner = (b.run.baseAndTallModules || []).some((m) =>
      isCornerModuleVariant(resolveApprovedModuleTool(m.tool).specs.variant)
    );
    if (aHasCorner !== bHasCorner) return aHasCorner ? -1 : 1;
    return 0;
  });

  for (const { run, wall } of orderedLowerRuns) {
    const wallThick = wall.thickness || prevState.roomConfig.wallThickness || 20;
    const firstItemIsCorner =
      (run.baseAndTallModules?.length || 0) > 0 &&
      isCornerModuleVariant(resolveApprovedModuleTool(run.baseAndTallModules![0].tool).specs.variant);
    const defaultStart = firstItemIsCorner ? wallThick / 2 : wallThick / 2 + 2;
    const baseStart = Math.max(defaultStart, Number(run.startOffsetCm) || defaultStart);
    let lowerCursor = baseStart;

    for (const item of run.baseAndTallModules || []) {
      const itemIsCorner = isCornerModuleVariant(resolveApprovedModuleTool(item.tool).specs.variant);
      const startAt = item.offsetFromStartCm !== undefined
        ? Math.max(lowerCursor, item.offsetFromStartCm)
        : (itemIsCorner && lowerCursor <= wallThick / 2 + 2.5 ? wallThick / 2 : lowerCursor);
      const res = placeItemOnWall(wall, item, startAt, false);
      lowerCursor = res.nextCursor;
    }
  }

  // Sincronizar blindWidth de esquineros ciegos con la profundidad real del mueble perpendicular acoplado
  for (const cab of placedCabinets) {
    if (cab.variant?.startsWith('corner_blind') || cab.variant?.startsWith('wall_corner_blind')) {
      const perpCab = findPerpendicularCabinetForCorner(cab, placedCabinets);
      if (perpCab && perpCab.depth > 0) {
        cab.blindWidth = perpCab.depth;
      }
    }
  }

  // 1b. Módulos aéreos / campanas (después de todas las torres/bases, así nunca chocan con torres en esquinas)
  for (const { run, wall } of resolvedRuns) {
    const wallThick = wall.thickness || prevState.roomConfig.wallThickness || 20;
    const baseStart = Math.max(wallThick / 2 + 2, Number(run.startOffsetCm) || wallThick / 2 + 2);
    let upperCursor = baseStart;

    for (const item of run.wallModules || []) {
      const startAt = item.offsetFromStartCm !== undefined ? Math.max(upperCursor, item.offsetFromStartCm) : upperCursor;
      const res = placeItemOnWall(wall, item, startAt, true);
      upperCursor = res.nextCursor;
    }
  }

  // 2. Isla central ergonómica (evaluando TODOS los muros y muebles colocados)
  let islandPlacedCount = 0;
  if (design.island?.enabled && Array.isArray(design.island.modules) && design.island.modules.length > 0) {
    const islandTex = resolveApprovedTexture(
      design.finishes?.islandDoorsTexture || design.finishes?.doorsTexture
    ).texture;

    const islandRes = placeErgonomicIsland(
      design.island,
      placedCabinets,
      walls,
      roomPoly,
      archElements,
      prevState.roomConfig.wallThickness || 20,
      islandTex,
      wallTexture,
      structTexture,
      appliedSummary,
      warnings,
      adaptations
    );
    islandPlacedCount = islandRes.placedCount;
    if (islandRes.sinkCabId) sinkCabinetId = islandRes.sinkCabId;
    if (islandRes.cooktopCabId) cooktopCabinetId = islandRes.cooktopCabId;
  }

  const prevCabinetIds = new Set(prevState.cabinets.map((c) => c.id));
  const animatedIds =
    design.replaceExistingCabinets === false
      ? placedCabinets.filter((c) => !prevCabinetIds.has(c.id)).map((c) => c.id)
      : placedCabinets.map((c) => c.id);

  // Aplicar gabinetes y guardar historial
  useKitchenStore.setState({
    history: [snapshot, ...(prevState.history || []).slice(0, 29)],
    future: [],
    cabinets: placedCabinets,
    activeCabinetId: null,
    viewMode: '3d',
  });

  appliedSummary.unshift(`Módulos instalados: ${placedCabinets.length} piezas del catálogo`);

  // Configurar voladizo/cascada de isla después de insertar los gabinetes si la isla se colocó
  if (islandPlacedCount > 0 && design.island && (design.island.overhangBackCm !== undefined || design.island.waterfallSides)) {
    useKitchenStore.getState().setCountertopConfig({
      enabled: true,
      islandOverhangBackCm: clamp(Number(design.island.overhangBackCm) || 30, 0, 45),
      islandWaterfallLeft: Boolean(design.island.waterfallSides),
      islandWaterfallRight: Boolean(design.island.waterfallSides),
    });
  }

  // Asegurar cubierta activa por defecto en diseño completo salvo que se deshabilite explícitamente
  const finishesWithCountertop: AiFinishesSpec = {
    countertopEnabled: true,
    ...(design.finishes || {}),
  };

  applyFinishesToStore(finishesWithCountertop, sinkCabinetId, cooktopCabinetId, appliedSummary, warnings, adaptations);

  if (animatedIds.length > 0) {
    startKitchenBuildAnimation(animatedIds, {
      animateFinishing: design.replaceExistingCabinets !== false,
    });
  }

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

  // Mover la isla completa en bloque atómico validando muros, límites y despeje frontal
  let islandMovedByBlock = false;
  if (patch.moveIsland && !patch.clearIsland) {
    const dx = Number(patch.moveIsland.deltaXCm) || 0;
    const dz = Number(patch.moveIsland.deltaZCm) || 0;
    if (Math.abs(dx) > 0.05 || Math.abs(dz) > 0.05) {
      const st = useKitchenStore.getState();
      const islandCabs = st.cabinets.filter((c) => c.type === 'island');
      const nonIslandCabs = st.cabinets.filter((c) => c.type !== 'island');
      const roomPoly: [number, number][] = (st.roomConfig?.vertices || []).map((v) => [v.x, v.y]);

      if (islandCabs.length === 0) {
        warnings.push('No existe una isla en el diseño actual para desplazar.');
      } else {
        const movedIslandCabs = islandCabs.map((c) => ({
          ...c,
          position: [
            Math.round((c.position[0] + dx) * 10) / 10,
            c.position[1],
            Math.round((c.position[2] + dz) * 10) / 10,
          ] as [number, number, number],
        }));

        let allValid = true;
        for (const cand of movedIslandCabs) {
          const validPhysics = isCandidateValid(
            cand as any,
            nonIslandCabs,
            st.walls,
            null,
            roomPoly,
            st.architecturalElements
          );
          const validAccess = hasClearFrontAccessAndNoClash(
            {
              position: cand.position,
              width: cand.width,
              depth: cand.depth,
              height: cand.height,
              rotation: cand.rotation || 0,
              type: cand.type,
              variant: cand.variant,
            },
            nonIslandCabs,
            st.walls,
            st.architecturalElements,
            roomPoly
          );
          if (!validPhysics || !validAccess) {
            allValid = false;
            break;
          }
        }

        if (allValid) {
          const movedById = new Map(movedIslandCabs.map((c) => [c.id, c]));
          const nextCabinets = st.cabinets.map((c) => movedById.get(c.id) || c);
          useKitchenStore.setState({ cabinets: nextCabinets });
          islandMovedByBlock = true;
          const parts: string[] = [];
          if (Math.abs(dx) > 0.05) parts.push(`${dx > 0 ? '+' : ''}${Math.round(dx)} cm en X`);
          if (Math.abs(dz) > 0.05) parts.push(`${dz > 0 ? '+' : ''}${Math.round(dz)} cm en Z`);
          appliedSummary.push(`Isla desplazada (${parts.join(', ')})`);
        } else {
          warnings.push(
            'No se pudo desplazar la isla esa distancia porque invadiría un muro, el límite del recinto o bloquearía la apertura de otro mueble.'
          );
        }
      }
    }
  }

  // Actualizar módulos existentes respetando estrictamente medidas fijas/normativas de catálogo y colisiones
  const pendingMoves: Array<{
    cabinetId: string;
    newPosition: [number, number, number];
    label: string;
  }> = [];

  for (const upd of patch.updateCabinets || []) {
    const cab = useKitchenStore.getState().cabinets.find((c) => c.id === upd.cabinetId);
    if (!cab) continue;
    const catEntry = findCatalogEntryForCabinet(cab);
    const changes: Partial<CabinetType> = {};

    if (upd.widthCm !== undefined) {
      if (catEntry?.fixedWidth || catEntry?.fixedDimensions) {
        warnings.push(`${catEntry.name} tiene ancho fijo (${catEntry.defaultWidth} cm) y no puede redimensionarse.`);
      } else {
        changes.width = clamp(Number(upd.widthCm), catEntry?.minWidth ?? 15, catEntry?.maxWidth ?? 120);
      }
    }
    if (upd.heightCm !== undefined) {
      if (catEntry?.fixedDimensions) {
        warnings.push(`${catEntry.name} tiene alto fijo (${catEntry.defaultHeight} cm).`);
      } else {
        changes.height = clamp(Number(upd.heightCm), catEntry?.minHeight ?? 35, catEntry?.maxHeight ?? 240);
      }
    }
    if (upd.depthCm !== undefined) {
      if (catEntry?.fixedDimensions) {
        warnings.push(`${catEntry.name} tiene profundidad fija (${catEntry.defaultDepth} cm).`);
      } else {
        changes.depth = clamp(Number(upd.depthCm), catEntry?.minDepth ?? 25, catEntry?.maxDepth ?? 110);
      }
    }
    if (upd.hingeSide === 'left' || upd.hingeSide === 'right') changes.hingeSide = upd.hingeSide;
    if (upd.doorTexture) {
      const tex = resolveApprovedTexture(upd.doorTexture);
      changes.doorColor = tex.texture.url;
      changes.doorMaterial = tex.texture.material;
      changes.drawerFrontColor = tex.texture.url;
      changes.drawerFrontMaterial = tex.texture.material;
    }

    if (Object.keys(changes).length > 0) {
      useKitchenStore.getState().updateCabinet(cab.id, changes);
      appliedSummary.push(`Actualizado ${getCabinetLabel(cab, 0)}`);
    }

    // Recopilar cambios de posición XZ para validarlos en lote atómico (evita auto-colisión entre módulos contiguos)
    const skipRedundantIslandMove = islandMovedByBlock && cab.type === 'island';
    if (!skipRedundantIslandMove) {
      const hasPosUpdate =
        upd.deltaXCm !== undefined ||
        upd.deltaZCm !== undefined ||
        upd.xCm !== undefined ||
        upd.zCm !== undefined ||
        (Array.isArray(upd.position) && upd.position.length >= 3);

      if (hasPosUpdate) {
        let nextX = cab.position[0];
        let nextZ = cab.position[2];
        if (Array.isArray(upd.position) && upd.position.length >= 3) {
          if (Number.isFinite(Number(upd.position[0]))) nextX = Number(upd.position[0]);
          if (Number.isFinite(Number(upd.position[2]))) nextZ = Number(upd.position[2]);
        }
        if (upd.xCm !== undefined && Number.isFinite(Number(upd.xCm))) nextX = Number(upd.xCm);
        if (upd.zCm !== undefined && Number.isFinite(Number(upd.zCm))) nextZ = Number(upd.zCm);
        if (upd.deltaXCm !== undefined && Number.isFinite(Number(upd.deltaXCm))) nextX += Number(upd.deltaXCm);
        if (upd.deltaZCm !== undefined && Number.isFinite(Number(upd.deltaZCm))) nextZ += Number(upd.deltaZCm);

        nextX = Math.round(nextX * 10) / 10;
        nextZ = Math.round(nextZ * 10) / 10;

        if (Math.abs(nextX - cab.position[0]) > 0.05 || Math.abs(nextZ - cab.position[2]) > 0.05) {
          pendingMoves.push({
            cabinetId: cab.id,
            newPosition: [nextX, cab.position[1], nextZ],
            label: getCabinetLabel(cab, 0),
          });
        }
      }
    }
  }

  if (pendingMoves.length > 0) {
    const st = useKitchenStore.getState();
    const roomPoly: [number, number][] = (st.roomConfig?.vertices || []).map((v) => [v.x, v.y]);
    const moveMap = new Map(pendingMoves.map((m) => [m.cabinetId, m.newPosition]));
    const proposedCabinets = st.cabinets.map((c) => {
      const targetPos = moveMap.get(c.id);
      return targetPos ? { ...c, position: targetPos } : c;
    });

    const validMoveIds = new Set<string>();
    for (const move of pendingMoves) {
      const movedCab = proposedCabinets.find((c) => c.id === move.cabinetId);
      if (!movedCab) continue;
      const others = proposedCabinets.filter((c) => c.id !== move.cabinetId);
      const validPhysics = isCandidateValid(
        movedCab as any,
        others,
        st.walls,
        movedCab.id,
        roomPoly,
        st.architecturalElements
      );
      const validAccess = hasClearFrontAccessAndNoClash(
        {
          position: movedCab.position,
          width: movedCab.width,
          depth: movedCab.depth,
          height: movedCab.height,
          rotation: movedCab.rotation || 0,
          type: movedCab.type,
          variant: movedCab.variant,
        },
        others,
        st.walls,
        st.architecturalElements,
        roomPoly
      );

      if (validPhysics && validAccess) {
        validMoveIds.add(move.cabinetId);
      } else {
        warnings.push(
          `No se pudo mover ${move.label} a la nueva posición porque colisiona con un muro, límite del recinto o la apertura de otro mueble.`
        );
      }
    }

    if (validMoveIds.size > 0) {
      const nextCabinets = st.cabinets.map((c) => {
        if (!validMoveIds.has(c.id)) return c;
        const targetPos = moveMap.get(c.id)!;
        return { ...c, position: targetPos };
      });
      useKitchenStore.setState({ cabinets: nextCabinets });
      appliedSummary.push(`Reposicionado(s) ${validMoveIds.size} módulo(s)`);
    }
  }

  // Agregar nuevos módulos respetando medidas fijas + despeje frontal
  const addedModuleIds: string[] = [];
  for (const item of patch.addModules || []) {
    const st = useKitchenStore.getState();
    const resolved = resolveApprovedModuleTool(item.tool);
    const { entry, specs, wasFallback } = resolved;
    if (wasFallback) {
      adaptations.push(`Módulo "${item.tool}" adaptado a "${entry.name}".`);
    }
    const dims = enforceCatalogDimensions(
      entry,
      item.widthCm,
      item.heightCm,
      item.depthCm,
      st.roomConfig.wallHeight || 250,
      adaptations
    );
    const placement = findSmartWallPlacement(
      { ...specs, width: dims.width, height: dims.height, depth: dims.depth },
      st.cabinets,
      st.walls,
      st.roomConfig?.vertices,
      st.architecturalElements
    );
    const roomPoly: [number, number][] = (st.roomConfig?.vertices || []).map((v) => [v.x, v.y]);
    const hasAccess = hasClearFrontAccessAndNoClash(
      {
        position: placement.position,
        width: dims.width,
        depth: dims.depth,
        height: dims.height,
        rotation: placement.rotation,
        type: specs.type,
        variant: specs.variant,
      },
      st.cabinets,
      st.walls,
      st.architecturalElements,
      roomPoly
    );

    if (!hasAccess) {
      warnings.push(`No se pudo agregar "${entry.name}" porque quedaría bloqueando la apertura de otro mueble o esquina.`);
      continue;
    }

    const refCab = st.cabinets.find((c) => c.type !== 'decoration');
    const newId = `cab_ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    st.addCabinet({
      id: newId,
      type: specs.type,
      variant: specs.variant,
      width: dims.width,
      height: dims.height,
      depth: dims.depth,
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
    addedModuleIds.push(newId);
    appliedSummary.push(`Agregado ${entry.name} (${dims.width} cm)`);
  }

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

  applyFinishesToStore(patch.finishes, null, null, appliedSummary, warnings, adaptations);

  if (addedModuleIds.length > 0) {
    startKitchenBuildAnimation(addedModuleIds, { animateFinishing: false });
  }

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
    width: Math.round(width * 10) / 10,
    height: Math.round(height * 10) / 10,
    depth: Math.round(depth * 10) / 10,
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
