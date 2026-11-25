import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Grid, Line } from '@react-three/drei';
import * as THREE from 'three';
import {
  Box,
  Crosshair,
  DoorOpen,
  Eye,
  EyeOff,
  Layers,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
  Ruler,
  ShieldCheck,
} from 'lucide-react';
import { useKitchenStore, CabinetType, getCabinetLabel } from '../store/kitchenStore';
import { useStore } from '../store';
import { Cabinet } from '../components/kitchen/Cabinet';
import { KitchenCountertop3D } from '../components/kitchen/KitchenCountertop3D';
import { KitchenIslandBackPanel } from '../components/kitchen/KitchenIslandBackPanel';
import { KitchenSocle } from '../components/kitchen/KitchenSocle';
import { AssemblyHighlightProvider } from '../components/kitchen/AssemblyHighlightContext';
import { loadAssemblySnapshot, AssemblySnapshotPayload } from '../utils/assemblySnapshotService';
import { generateKitchenPartsList } from '../utils/kitchenManufacturing';
import { calculateCncMachiningForPart, CncMachinedPart } from '../utils/kitchenCncMachining';
import { resolveAssemblyPartKey } from '../utils/assemblyPartMapper';
import { getFriendlyColorName } from '../utils/colorNames';

interface KitchenAssemblyViewerProps {
  snapshotId: string;
  cabinetId: string;
  partKey: string;
  partCode?: string;
}

interface ResolvedPartDetails {
  partCode: string;
  partName: string;
  moduleName: string;
  length: number;
  width: number;
  thickness: number;
  material: string;
  grainDirection: 'vertical' | 'horizontal';
  edgeL1: boolean;
  edgeL2: boolean;
  edgeW1: boolean;
  edgeW2: boolean;
  edgeThicknessL1: number;
  edgeThicknessL2: number;
  edgeThicknessW1: number;
  edgeThicknessW2: number;
  drillsCount: number;
  groovesCount: number;
  notes?: string;
}

/**
 * Contorno ligero de muros del recinto en Rayos X para orientación espacial sin obstruir la cámara 360°.
 */
function GhostWallsOutline({
  walls,
  roomConfig,
}: {
  walls: any[];
  roomConfig?: any;
}) {
  const effectiveWalls = useMemo(() => {
    if (walls && walls.length > 0) return walls;
    if (roomConfig?.vertices && roomConfig.vertices.length >= 3) {
      return roomConfig.vertices.map((v: any, i: number, arr: any[]) => {
        const next = arr[(i + 1) % arr.length];
        return {
          id: `ghost_wall_${i}`,
          start: [v.x, v.y] as [number, number],
          end: [next.x, next.y] as [number, number],
          height: roomConfig.wallHeight || 250,
        };
      });
    }
    return [];
  }, [walls, roomConfig]);

  if (effectiveWalls.length === 0) return null;

  return (
    <group name="assembly-ghost-walls">
      {effectiveWalls.map((w: any, idx: number) => {
        const [x1, z1] = w.start;
        const [x2, z2] = w.end;
        const h = w.height || 250;
        return (
          <group key={w.id || idx}>
            <Line
              points={[
                [x1, 0.2, z1],
                [x2, 0.2, z2],
                [x2, h, z2],
                [x1, h, z1],
                [x1, 0.2, z1],
              ]}
              color="#334155"
              lineWidth={1}
              transparent
              opacity={0.45}
            />
          </group>
        );
      })}
    </group>
  );
}

/**
 * Controlador de cámara que enfoca suavemente el módulo que contiene la pieza escaneada
 * y cede el control inmediatamente cuando el maestro orbita o hace zoom.
 */
function AssemblyCameraRig({
  targetCabinet,
  focusTrigger,
}: {
  targetCabinet?: CabinetType;
  focusTrigger: number;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const animatingRef = useRef(true);
  const desiredPosRef = useRef(new THREE.Vector3(180, 150, 220));
  const desiredTargetRef = useRef(new THREE.Vector3(0, 70, 0));

  useEffect(() => {
    if (!targetCabinet || !Array.isArray(targetCabinet.position)) {
      desiredTargetRef.current.set(0, 75, 0);
      desiredPosRef.current.set(220, 170, 260);
      animatingRef.current = true;
      return;
    }

    const cx = Number(targetCabinet.position[0]) || 0;
    const cy = Number(targetCabinet.position[1]) || targetCabinet.height / 2;
    const cz = Number(targetCabinet.position[2]) || 0;
    const rot = Number(targetCabinet.rotation) || 0;

    // Vector frontal del gabinete en el mundo (+Z local rotado por rotY)
    const frontX = Math.sin(rot);
    const frontZ = Math.cos(rot);
    const rightX = Math.cos(rot);
    const rightZ = -Math.sin(rot);

    const maxDim = Math.max(targetCabinet.width || 60, targetCabinet.height || 80, targetCabinet.depth || 60);
    const dist = Math.max(125, Math.min(250, maxDim * 1.9));

    desiredTargetRef.current.set(cx, cy, cz);
    desiredPosRef.current.set(
      cx + frontX * dist * 0.85 + rightX * dist * 0.45,
      Math.max(45, cy + dist * 0.38),
      cz + frontZ * dist * 0.85 + rightZ * dist * 0.45
    );
    animatingRef.current = true;
  }, [targetCabinet, focusTrigger]);

  useFrame((_, delta) => {
    if (!animatingRef.current || !controlsRef.current) return;
    const step = Math.min(1, delta * 5);
    camera.position.lerp(desiredPosRef.current, step);
    controlsRef.current.target.lerp(desiredTargetRef.current, step);
    controlsRef.current.update();

    if (
      camera.position.distanceTo(desiredPosRef.current) < 1.5 &&
      controlsRef.current.target.distanceTo(desiredTargetRef.current) < 1.5
    ) {
      animatingRef.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={35}
      maxDistance={1200}
      maxPolarAngle={Math.PI / 2 - 0.02}
      onStart={() => {
        animatingRef.current = false;
      }}
    />
  );
}

export function KitchenAssemblyViewer({
  snapshotId,
  cabinetId,
  partKey,
  partCode,
}: KitchenAssemblyViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AssemblySnapshotPayload | null>(null);
  const [xrayMode, setXrayMode] = useState(true);
  const [isolateModule, setIsolateModule] = useState(false);
  const [moduleOpened, setModuleOpened] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [focusTrigger, setFocusTrigger] = useState(0);

  const cabinets = useKitchenStore((s) => s.cabinets);
  const walls = useKitchenStore((s) => s.walls);
  const roomConfig = useKitchenStore((s) => s.roomConfig);

  // Cargar snapshot desde Supabase (o fallback local) e hidratar stores en modo solo lectura
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    loadAssemblySnapshot(snapshotId)
      .then((data) => {
        if (!active) return;
        if (!data || !data.kitchen || !Array.isArray(data.kitchen.cabinets)) {
          setError('No se encontró el proyecto asociado a este código QR o el enlace expiró.');
          setLoading(false);
          return;
        }

        // Hidratar materiales globales y activar modo Rayos X por defecto
        useStore.setState({
          thickness: data.materials.thickness ?? 1.8,
          structureMaterial: data.materials.structureMaterial || 'melamina',
          structureColor: data.materials.structureColor || '#FFFFFF',
          doorMaterial: data.materials.doorMaterial || 'melamina',
          doorColor: data.materials.doorColor || '#FFFFFF',
          drawerFrontMaterial: data.materials.drawerFrontMaterial || 'melamina',
          drawerFrontColor: data.materials.drawerFrontColor || '#FFFFFF',
          drawerInnerMaterial: data.materials.drawerInnerMaterial || 'melamina',
          drawerInnerColor: data.materials.drawerInnerColor || '#FFFFFF',
          shelfMaterial: data.materials.shelfMaterial || 'melamina',
          shelfColor: data.materials.shelfColor || '#FFFFFF',
          backColor: data.materials.backColor || '#FFFFFF',
          backMaterial: data.materials.backMaterial,
          backThickness: data.materials.backThickness,
          drawerBottomMaterial: data.materials.drawerBottomMaterial,
          hplBalancer: Boolean(data.materials.hplBalancer),
          drawerHardware: data.materials.drawerHardware || 'Provelcar',
          assemblyType: data.materials.assemblyType || 'minifix',
          drawerAssemblyType: data.materials.drawerAssemblyType || 'spax',
          customTextures: data.materials.customTextures || [],
          isTransparent: true,
          showDimensions: false,
          showDecorations: false,
        });

        // Hidratar escena de cocina en solo lectura
        useKitchenStore.setState({
          viewMode: '3d',
          toolMode: 'select',
          activeCabinetId: null,
          activeArchElementId: null,
          activeWallId: null,
          draggingCabinetId: null,
          cabinets: data.kitchen.cabinets,
          walls: data.kitchen.walls || [],
          ...(data.kitchen.roomConfig ? { roomConfig: data.kitchen.roomConfig } : {}),
          ...(data.kitchen.architecturalElements ? { architecturalElements: data.kitchen.architecturalElements } : {}),
          ...(data.kitchen.countertopConfig ? { countertopConfig: data.kitchen.countertopConfig } : {}),
          ...(data.kitchen.islandBackConfig ? { islandBackConfig: data.kitchen.islandBackConfig } : {}),
          golaSystem: data.kitchen.golaSystem || 'none',
          ...(data.kitchen.handleConfig ? { handleConfig: data.kitchen.handleConfig } : {}),
          showSocle: data.kitchen.showSocle ?? true,
          socleFinish: data.kitchen.socleFinish || 'aluminum',
          socleHeight: data.kitchen.socleHeight || 10,
          wallColor: data.kitchen.wallColor || '#E2E8F0',
        });

        setSnapshot(data);
        setLoading(false);
        setFocusTrigger((n) => n + 1);
      })
      .catch((err) => {
        if (!active) return;
        console.error('[KitchenAssemblyViewer] Error cargando snapshot:', err);
        setError('Error al cargar el modelo 3D del proyecto. Verifica tu conexión a internet.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [snapshotId]);

  // Sincronizar toggle de Rayos X con store global (para cubierta e isla)
  useEffect(() => {
    if (!snapshot) return;
    useStore.setState({ isTransparent: xrayMode });
  }, [xrayMode, snapshot]);

  // Abrir/cerrar puertas y cajones del módulo objetivo para inspeccionar piezas interiores
  useEffect(() => {
    if (!snapshot || !cabinetId) return;
    useKitchenStore.setState((prev) => ({
      cabinets: prev.cabinets.map((c) => {
        if (c.id !== cabinetId) return c;
        return {
          ...c,
          isOpen: moduleOpened,
          openElements: moduleOpened
            ? {
                'door-0': true,
                'door-1': true,
                'door-lower': true,
                'door-upper': true,
                'door-top': true,
                'door-lift': true,
                'drawer-0': true,
                'drawer-1': true,
                'drawer-2': true,
                'drawer-3': true,
              }
            : {},
        };
      }),
    }));
  }, [moduleOpened, cabinetId, snapshot]);

  const targetCabinetIndex = useMemo(
    () => cabinets.findIndex((c) => c.id === cabinetId),
    [cabinets, cabinetId]
  );
  const targetCabinet = targetCabinetIndex >= 0 ? cabinets[targetCabinetIndex] : undefined;

  // Resolver ficha técnica exacta de la pieza escaneada desde el BOM del snapshot
  const partDetails: ResolvedPartDetails | null = useMemo(() => {
    if (!snapshot || cabinets.length === 0) return null;
    try {
      const realCabinets = cabinets.filter(
        (c) => c.type !== 'decoration' && !c.variant?.startsWith('deco_')
      );
      const allParts = generateKitchenPartsList(cabinets);
      const hardwareBrand = snapshot.materials.drawerHardware === 'Hafele' ? 'Hafele' : 'Provelcar';
      const assemblyType = snapshot.materials.assemblyType === 'minifix' ? 'minifix' : 'spax';
      const golaSystem = (snapshot.kitchen.golaSystem || 'none') as 'none' | 'aluminum' | 'black';

      let fallbackMatch: CncMachinedPart | null = null;

      for (const part of allParts) {
        if (part.moduleId !== cabinetId) continue;
        const cab = realCabinets.find((c) => c.id === part.moduleId);
        const cncPart = calculateCncMachiningForPart(
          part,
          cab,
          hardwareBrand,
          assemblyType,
          golaSystem,
          snapshot.kitchen.handleConfig
        );

        for (let q = 1; q <= part.qty; q++) {
          const code = part.qty > 1 ? `${cncPart.partCode}#${q}` : cncPart.partCode;
          const mappedKey = resolveAssemblyPartKey(part, q);
          const candidate: CncMachinedPart = {
            ...cncPart,
            partCode: code,
            material: getFriendlyColorName(part.material, snapshot.materials.customTextures),
          };

          if (partCode && code === partCode) {
            return {
              partCode: candidate.partCode,
              partName: candidate.partName,
              moduleName: candidate.moduleName,
              length: candidate.length,
              width: candidate.width,
              thickness: candidate.thickness,
              material: candidate.material,
              grainDirection: candidate.grainDirection,
              edgeL1: candidate.edgeL1,
              edgeL2: candidate.edgeL2,
              edgeW1: candidate.edgeW1,
              edgeW2: candidate.edgeW2,
              edgeThicknessL1: candidate.edgeThicknessL1,
              edgeThicknessL2: candidate.edgeThicknessL2,
              edgeThicknessW1: candidate.edgeThicknessW1,
              edgeThicknessW2: candidate.edgeThicknessW2,
              drillsCount: candidate.drills.length,
              groovesCount: candidate.grooves.length,
              notes: candidate.notes,
            };
          }

          if (!fallbackMatch && mappedKey === partKey) {
            fallbackMatch = candidate;
          }
        }
      }

      if (fallbackMatch) {
        return {
          partCode: fallbackMatch.partCode,
          partName: fallbackMatch.partName,
          moduleName: fallbackMatch.moduleName,
          length: fallbackMatch.length,
          width: fallbackMatch.width,
          thickness: fallbackMatch.thickness,
          material: fallbackMatch.material,
          grainDirection: fallbackMatch.grainDirection,
          edgeL1: fallbackMatch.edgeL1,
          edgeL2: fallbackMatch.edgeL2,
          edgeW1: fallbackMatch.edgeW1,
          edgeW2: fallbackMatch.edgeW2,
          edgeThicknessL1: fallbackMatch.edgeThicknessL1,
          edgeThicknessL2: fallbackMatch.edgeThicknessL2,
          edgeThicknessW1: fallbackMatch.edgeThicknessW1,
          edgeThicknessW2: fallbackMatch.edgeThicknessW2,
          drillsCount: fallbackMatch.drills.length,
          groovesCount: fallbackMatch.grooves.length,
          notes: fallbackMatch.notes,
        };
      }
    } catch (err) {
      console.warn('[KitchenAssemblyViewer] No se pudo calcular detalle BOM de pieza:', err);
    }
    return null;
  }, [snapshot, cabinets, cabinetId, partKey, partCode]);

  const visibleCabinets = useMemo(() => {
    if (isolateModule && targetCabinet) {
      return [targetCabinet];
    }
    return cabinets;
  }, [cabinets, isolateModule, targetCabinet]);

  const highlightValue = useMemo(
    () => ({
      active: true,
      targetCabinetId: cabinetId || null,
      targetPartKey: partKey || '__cabinet__',
      xrayMode,
    }),
    [cabinetId, partKey, xrayMode]
  );

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-slate-950 text-white flex flex-col items-center justify-center p-6 gap-4">
        <div className="w-14 h-14 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
          <Loader2 className="w-7 h-7 text-orange-500 animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-base font-bold tracking-tight">Cargando Visor 3D de Armado</p>
          <p className="text-xs text-slate-400 mt-1">Preparando proyecto en modo Rayos X...</p>
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="min-h-screen w-full bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
          </div>
          <h1 className="text-lg font-bold text-white">No se pudo abrir la pieza 3D</h1>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            {error || 'El código QR no contiene un proyecto válido.'}
          </p>
          <p className="text-[11px] text-slate-500 mt-4 font-mono">ID: {snapshotId || '—'}</p>
        </div>
      </div>
    );
  }

  const moduleFriendlyLabel = targetCabinet
    ? `MOD ${targetCabinetIndex + 1} • ${getCabinetLabel(targetCabinet, targetCabinetIndex)}`
    : partDetails?.moduleName || 'Módulo de Cocina';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* VISOR 3D DE SOLO LECTURA */}
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ far: 40000 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#0b1120']} />
        <PerspectiveCamera makeDefault fov={42} near={1} far={40000} position={[200, 160, 240]} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[200, 320, 220]} intensity={1.1} />
        <directionalLight position={[-180, 180, -160]} intensity={0.45} />
        <Environment preset="city" />

        <Grid
          position={[0, -0.1, 0]}
          args={[2000, 2000]}
          cellSize={20}
          cellThickness={0.5}
          cellColor="#1e293b"
          sectionSize={100}
          sectionThickness={1}
          sectionColor="#334155"
          fadeDistance={1200}
          infiniteGrid
        />

        <AssemblyHighlightProvider value={highlightValue}>
          <React.Suspense fallback={null}>
            {!isolateModule && <GhostWallsOutline walls={walls} roomConfig={roomConfig} />}
            {!isolateModule && <KitchenCountertop3D />}
            {!isolateModule && <KitchenIslandBackPanel />}
            {!isolateModule && <KitchenSocle />}

            {visibleCabinets.map((cab, idx) => (
              <Cabinet
                key={cab.id}
                {...cab}
                index={isolateModule ? targetCabinetIndex : idx}
              />
            ))}
          </React.Suspense>
        </AssemblyHighlightProvider>

        <AssemblyCameraRig targetCabinet={targetCabinet} focusTrigger={focusTrigger} />
      </Canvas>

      {/* HUD SUPERIOR: IDENTIFICACIÓN DE PIEZA Y MODO SOLO LECTURA */}
      <div className="pointer-events-none fixed top-0 left-0 right-0 z-20 p-3 sm:p-4 flex flex-col gap-2">
        <div className="pointer-events-auto max-w-xl w-full mx-auto bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl px-4 py-3 shadow-2xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500 text-white text-[10px] font-black tracking-wider uppercase shrink-0">
                <Box className="w-3 h-3" />
                {partDetails?.partCode || partCode || 'PIEZA'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-semibold uppercase shrink-0">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Solo Vista
              </span>
            </div>
            <span className="text-[10px] font-semibold text-slate-400 truncate">
              ARQUIFY 3D ARMADO
            </span>
          </div>

          <h1 className="text-sm sm:text-base font-bold text-white mt-1.5 leading-snug truncate">
            {partDetails?.partName || 'Pieza Seleccionada'}
          </h1>
          <p className="text-xs text-sky-300 font-medium truncate mt-0.5">
            {moduleFriendlyLabel}
          </p>
        </div>
      </div>

      {/* CONTROLES RÁPIDOS DE TALLER (LATERAL DERECHO) */}
      <div className="fixed right-3 sm:right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setFocusTrigger((n) => n + 1)}
          title="Centrar cámara en la pieza"
          className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:scale-95 text-white border border-slate-700/80 backdrop-blur-md shadow-xl transition"
        >
          <Crosshair className="w-5 h-5 text-orange-400" />
          <span className="text-[9px] font-bold mt-1 text-slate-200">Enfocar</span>
        </button>

        <button
          type="button"
          onClick={() => setXrayMode((v) => !v)}
          title="Alternar modo Rayos X"
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl border backdrop-blur-md shadow-xl transition active:scale-95 ${
            xrayMode
              ? 'bg-orange-500 text-white border-orange-400'
              : 'bg-slate-900/90 text-slate-200 border-slate-700/80 hover:bg-slate-800'
          }`}
        >
          {xrayMode ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          <span className="text-[9px] font-bold mt-1">Rayos X</span>
        </button>

        <button
          type="button"
          onClick={() => setModuleOpened((v) => !v)}
          title="Abrir o cerrar puertas y cajones del módulo"
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl border backdrop-blur-md shadow-xl transition active:scale-95 ${
            moduleOpened
              ? 'bg-sky-600 text-white border-sky-400'
              : 'bg-slate-900/90 text-slate-200 border-slate-700/80 hover:bg-slate-800'
          }`}
        >
          <DoorOpen className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-1">{moduleOpened ? 'Cerrar' : 'Abrir'}</span>
        </button>

        <button
          type="button"
          onClick={() => setIsolateModule((v) => !v)}
          title="Ver solo este módulo o todo el proyecto"
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl border backdrop-blur-md shadow-xl transition active:scale-95 ${
            isolateModule
              ? 'bg-emerald-600 text-white border-emerald-400'
              : 'bg-slate-900/90 text-slate-200 border-slate-700/80 hover:bg-slate-800'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-1">{isolateModule ? 'Todo' : 'Módulo'}</span>
        </button>
      </div>

      {/* TARJETA TÉCNICA INFERIOR COLAPSABLE */}
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-20 p-3 sm:p-4">
        <div className="pointer-events-auto max-w-xl w-full mx-auto bg-slate-900/92 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setDetailsExpanded((v) => !v)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-800/60 transition"
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_#f97316]" />
              <span className="text-xs font-bold text-white uppercase tracking-wide">
                Ficha de Pieza Destacada
              </span>
              {partDetails && (
                <span className="text-xs font-mono font-bold text-amber-300 ml-1">
                  {partDetails.length} × {partDetails.width} × {partDetails.thickness} mm
                </span>
              )}
            </div>
            {detailsExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {detailsExpanded && (
            <div className="px-4 pb-3.5 pt-1 border-t border-slate-800 grid grid-cols-2 gap-2.5 text-xs">
              {partDetails ? (
                <>
                  <div className="bg-slate-800/70 rounded-xl p-2.5 border border-slate-700/50">
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 uppercase">
                      <Ruler className="w-3 h-3 text-amber-400" />
                      Corte y Veta
                    </div>
                    <div className="font-mono font-bold text-amber-300 mt-0.5">
                      {partDetails.length} × {partDetails.width} × {partDetails.thickness} mm
                    </div>
                    <div className="text-[11px] text-slate-300 mt-0.5">
                      {partDetails.grainDirection === 'vertical' ? '↕ Veta Vertical' : '↔ Veta Horizontal'}
                    </div>
                  </div>

                  <div className="bg-slate-800/70 rounded-xl p-2.5 border border-slate-700/50">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase">Material</div>
                    <div className="font-semibold text-white mt-0.5 truncate" title={partDetails.material}>
                      {partDetails.material}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {partDetails.drillsCount} perf. • {partDetails.groovesCount} ran.
                    </div>
                  </div>

                  <div className="col-span-2 bg-slate-800/50 rounded-xl px-3 py-2 border border-slate-700/40 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-400 font-semibold">Tapacantos:</span>
                    <div className="flex flex-wrap gap-2 font-mono text-slate-200">
                      <span>L1: <strong className={partDetails.edgeL1 ? 'text-orange-400' : 'text-slate-500'}>{partDetails.edgeL1 ? `${partDetails.edgeThicknessL1}mm` : '—'}</strong></span>
                      <span>L2: <strong className={partDetails.edgeL2 ? 'text-orange-400' : 'text-slate-500'}>{partDetails.edgeL2 ? `${partDetails.edgeThicknessL2}mm` : '—'}</strong></span>
                      <span>W1: <strong className={partDetails.edgeW1 ? 'text-orange-400' : 'text-slate-500'}>{partDetails.edgeW1 ? `${partDetails.edgeThicknessW1}mm` : '—'}</strong></span>
                      <span>W2: <strong className={partDetails.edgeW2 ? 'text-orange-400' : 'text-slate-500'}>{partDetails.edgeW2 ? `${partDetails.edgeThicknessW2}mm` : '—'}</strong></span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="col-span-2 text-slate-400 text-[11px] py-1">
                  Pieza destacada en sólido con borde naranja. Arrastra para rotar y pellizca para acercar.
                </div>
              )}

              <div className="col-span-2 flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-orange-500 inline-block" />
                  Pieza escaneada (sólida)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-sky-400/60 border border-sky-400 inline-block" />
                  Mismo módulo (Rayos X)
                </span>
                <span>1 dedo: rotar • 2 dedos: zoom</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
