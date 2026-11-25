import { CabinetType, WallType, ArchitecturalElement, GolaSystem, IslandBackConfig, KitchenHandleConfig } from '../store/kitchenStore';
import { RoomConfig } from './roomGeometry';
import { CountertopConfig } from '../types/countertop';
import { MaterialType, TextureItem } from '../store';

export interface AssemblySnapshotPayload {
  version: 1;
  createdAt: string;
  projectName?: string;
  kitchen: {
    cabinets: CabinetType[];
    walls: WallType[];
    roomConfig?: RoomConfig;
    architecturalElements?: ArchitecturalElement[];
    countertopConfig?: CountertopConfig;
    islandBackConfig?: IslandBackConfig;
    golaSystem?: GolaSystem;
    handleConfig?: KitchenHandleConfig;
    showSocle?: boolean;
    socleFinish?: 'aluminum' | 'black';
    socleHeight?: number;
    wallColor?: string;
  };
  materials: {
    thickness: number;
    structureMaterial: MaterialType;
    structureColor: string;
    doorMaterial: MaterialType;
    doorColor: string;
    drawerFrontMaterial: MaterialType;
    drawerFrontColor: string;
    drawerInnerMaterial: MaterialType;
    drawerInnerColor: string;
    shelfMaterial: MaterialType;
    shelfColor: string;
    backColor: string;
    backMaterial?: MaterialType | 'durolac';
    backThickness?: number;
    drawerBottomMaterial?: 'melamina' | 'durolac';
    hplBalancer: boolean;
    drawerHardware: 'Provelcar' | 'Hafele';
    assemblyType: 'spax' | 'minifix';
    drawerAssemblyType: 'spax' | 'minifix';
    customTextures?: TextureItem[];
  };
}

const LOCAL_PREFIX = 'arquify_assembly_snapshot_';

function getApiBaseUrl(): string {
  const metaEnv = (import.meta as any).env || {};
  const configured = typeof metaEnv.VITE_API_BASE_URL === 'string' ? metaEnv.VITE_API_BASE_URL.trim() : '';
  return configured ? configured.replace(/\/+$/, '') : '';
}

function generateShortSnapshotId(length = 10): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function buildAssemblySnapshotPayload(
  kitchenState: any,
  globalState: any,
  projectName?: string
): AssemblySnapshotPayload {
  const cabinets: CabinetType[] = Array.isArray(kitchenState?.cabinets)
    ? kitchenState.cabinets.map((c: CabinetType) => ({
        ...c,
        openElements: undefined,
        isOpen: false,
      }))
    : [];

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    projectName: projectName || 'Proyecto Cocina Arquify',
    kitchen: {
      cabinets,
      walls: Array.isArray(kitchenState?.walls) ? kitchenState.walls : [],
      roomConfig: kitchenState?.roomConfig,
      architecturalElements: Array.isArray(kitchenState?.architecturalElements)
        ? kitchenState.architecturalElements
        : [],
      countertopConfig: kitchenState?.countertopConfig,
      islandBackConfig: kitchenState?.islandBackConfig,
      golaSystem: kitchenState?.golaSystem || 'none',
      handleConfig: kitchenState?.handleConfig,
      showSocle: kitchenState?.showSocle ?? true,
      socleFinish: kitchenState?.socleFinish || 'aluminum',
      socleHeight: kitchenState?.socleHeight || 10,
      wallColor: kitchenState?.wallColor || '#E2E8F0',
    },
    materials: {
      thickness: globalState?.thickness ?? 1.8,
      structureMaterial: globalState?.structureMaterial || 'melamina',
      structureColor: globalState?.structureColor || '#FFFFFF',
      doorMaterial: globalState?.doorMaterial || 'melamina',
      doorColor: globalState?.doorColor || '#FFFFFF',
      drawerFrontMaterial: globalState?.drawerFrontMaterial || 'melamina',
      drawerFrontColor: globalState?.drawerFrontColor || '#FFFFFF',
      drawerInnerMaterial: globalState?.drawerInnerMaterial || 'melamina',
      drawerInnerColor: globalState?.drawerInnerColor || '#FFFFFF',
      shelfMaterial: globalState?.shelfMaterial || 'melamina',
      shelfColor: globalState?.shelfColor || '#FFFFFF',
      backColor: globalState?.backColor || '#FFFFFF',
      backMaterial: globalState?.backMaterial,
      backThickness: globalState?.backThickness,
      drawerBottomMaterial: globalState?.drawerBottomMaterial,
      hplBalancer: Boolean(globalState?.hplBalancer),
      drawerHardware: globalState?.drawerHardware === 'Hafele' ? 'Hafele' : 'Provelcar',
      assemblyType: globalState?.assemblyType === 'spax' ? 'spax' : 'minifix',
      drawerAssemblyType: globalState?.drawerAssemblyType === 'minifix' ? 'minifix' : 'spax',
      customTextures: Array.isArray(globalState?.customTextures)
        ? globalState.customTextures.filter((t: TextureItem) => t?.url && !t.url.startsWith('data:'))
        : [],
    },
  };
}

export async function saveAssemblySnapshot(
  kitchenState: any,
  globalState: any,
  projectName?: string
): Promise<{ id: string; savedToCloud: boolean; baseUrl: string }> {
  const id = generateShortSnapshotId(10);
  const payload = buildAssemblySnapshotPayload(kitchenState, globalState, projectName);
  const baseUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://arquify.cl';

  // Respaldo local (útil en desarrollo/pruebas locales en el mismo navegador)
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(`${LOCAL_PREFIX}${id}`, JSON.stringify(payload));
    }
  } catch {
    // Ignorar errores de cuota localStorage
  }

  let savedToCloud = false;
  const endpoint = `${getApiBaseUrl()}/api/v1/assembly-snapshots`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id,
        projectName: payload.projectName || null,
        snapshot: payload,
      }),
    });

    if (response.ok) {
      savedToCloud = true;
    } else {
      console.warn('[AssemblySnapshot] API Gateway respondió:', response.status);
    }
  } catch (err) {
    console.warn('[AssemblySnapshot] No se pudo guardar en PostgreSQL (Railway):', err);
  }

  return { id, savedToCloud, baseUrl };
}

export async function loadAssemblySnapshot(id: string): Promise<AssemblySnapshotPayload | null> {
  if (!id || id.length > 64) return null;

  // 1. Consultar desde PostgreSQL en Railway vía API Gateway (/api/v1/assembly-snapshots/:id)
  const endpoint = `${getApiBaseUrl()}/api/v1/assembly-snapshots/${encodeURIComponent(id)}`;
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      if (data?.snapshot) {
        return data.snapshot as AssemblySnapshotPayload;
      }
    }
  } catch (err) {
    console.warn('[AssemblySnapshot] Error consultando API Gateway:', err);
  }

  // 2. Fallback local (pruebas locales en el mismo navegador sin backend levantado)
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(`${LOCAL_PREFIX}${id}`);
      if (raw) {
        return JSON.parse(raw) as AssemblySnapshotPayload;
      }
    }
  } catch {
    // Ignorar error de parseo
  }

  return null;
}

export function buildAssemblyViewerUrl(
  baseUrl: string,
  snapshotId: string,
  cabinetId: string,
  partKey: string,
  partCode?: string
): string {
  const params = new URLSearchParams();
  params.set('assembly', snapshotId);
  params.set('cab', cabinetId);
  params.set('part', partKey);
  if (partCode) {
    params.set('code', partCode);
  }
  return `${baseUrl.replace(/\/+$/, '')}/?${params.toString()}`;
}
