import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CabinetType, useKitchenStore } from '../../store/kitchenStore';
import {
  KitchenBuildAnimationPlan,
  advanceKitchenBuildAnimation,
  cancelKitchenBuildAnimation,
  completeKitchenBuildAnimation,
  getKitchenBuildAnimationPlan,
  subscribeKitchenBuildAnimation,
} from '../../utils/kitchenBuildAnimation';

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function useActiveBuildPlan(): KitchenBuildAnimationPlan | null {
  const [plan, setPlan] = useState<KitchenBuildAnimationPlan | null>(() =>
    getKitchenBuildAnimationPlan()
  );

  useEffect(() => {
    setPlan(getKitchenBuildAnimationPlan());
    return subscribeKitchenBuildAnimation(() => {
      setPlan(getKitchenBuildAnimationPlan());
    });
  }, []);

  return plan;
}

interface CabinetBlueprintOverlayProps {
  width: number;
  height: number;
  depth: number;
  pivotPosition: [number, number, number];
  rotationY: number;
  groupRef: React.RefObject<THREE.Group | null>;
  lineMatRef: React.RefObject<THREE.LineBasicMaterial | null>;
  fillMatRef: React.RefObject<THREE.MeshBasicMaterial | null>;
  scanMeshRef: React.RefObject<THREE.Mesh | null>;
  scanMatRef: React.RefObject<THREE.MeshBasicMaterial | null>;
}

function CabinetBlueprintOverlay({
  width,
  height,
  depth,
  pivotPosition,
  rotationY,
  groupRef,
  lineMatRef,
  fillMatRef,
  scanMeshRef,
  scanMatRef,
}: CabinetBlueprintOverlayProps) {
  const edgesGeometry = useMemo(() => {
    const box = new THREE.BoxGeometry(width, height, depth);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [width, height, depth]);

  useEffect(() => {
    return () => {
      edgesGeometry.dispose();
    };
  }, [edgesGeometry]);

  // Controlar visibilidad exclusivamente por ref (nunca como prop JSX) para que re-renders no lo apaguen
  useLayoutEffect(() => {
    if (groupRef.current) {
      groupRef.current.visible = false;
    }
  }, [groupRef]);

  return (
    <group
      ref={groupRef}
      position={pivotPosition}
      rotation={[0, rotationY, 0]}
    >
      {/* Contorno técnico CAD que se traza rápidamente desde la base */}
      <lineSegments
        position={[0, height / 2, 0]}
        geometry={edgesGeometry}
        renderOrder={900}
      >
        <lineBasicMaterial
          ref={lineMatRef}
          color="#f97316"
          transparent
          opacity={0.95}
          depthTest={true}
          toneMapped={false}
        />
      </lineSegments>

      {/* Volumen fantasma translúcido sutil tipo plano técnico */}
      <mesh position={[0, height / 2, 0]} renderOrder={899}>
        <boxGeometry args={[width, height, depth]} />
        <meshBasicMaterial
          ref={fillMatRef}
          color="#f97316"
          transparent
          opacity={0.12}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Plano fino de barrido arquitectónico acompañando el trazado vertical */}
      <mesh
        ref={scanMeshRef}
        position={[0, height, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={901}
      >
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial
          ref={scanMatRef}
          color="#fb923c"
          transparent
          opacity={0.34}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

interface CabinetRevealWrapperProps {
  cabinet: CabinetType;
  children: React.ReactNode;
}

/**
 * Envuelve un <Cabinet /> sin desmontarlo jamás ni modificar su lógica.
 * Cuando existe una animación activa para este cabinet.id, ejecuta un efecto
 * de contorno técnico + despliegue rápido desde la base a 60 FPS en GPU.
 */
export function CabinetRevealWrapper({ cabinet, children }: CabinetRevealWrapperProps) {
  const plan = useActiveBuildPlan();
  const schedule = plan?.items.get(cabinet.id) ?? null;

  const [showOverlay, setShowOverlay] = useState<boolean>(() => Boolean(schedule));

  const pivotGroupRef = useRef<THREE.Group | null>(null);
  const offsetGroupRef = useRef<THREE.Group | null>(null);
  const blueprintGroupRef = useRef<THREE.Group | null>(null);
  const lineMatRef = useRef<THREE.LineBasicMaterial | null>(null);
  const fillMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const scanMeshRef = useRef<THREE.Mesh | null>(null);
  const scanMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const finishedRunIdRef = useRef<number | null>(null);

  const safeW = Math.max(1, Number(cabinet.width) || 60);
  const safeH = Math.max(1, Number(cabinet.height) || 80);
  const safeD = Math.max(1, Number(cabinet.depth) || 60);
  const posX = Number(cabinet.position?.[0]) || 0;
  const posY = Number(cabinet.position?.[1]) || safeH / 2;
  const posZ = Number(cabinet.position?.[2]) || 0;
  const safeRot = Number(cabinet.rotation) || 0;

  const pivotX = posX;
  const pivotY = posY - safeH / 2;
  const pivotZ = posZ;

  // Inicializar estado visual antes del primer pintado para evitar parpadeo de 1 fotograma
  useLayoutEffect(() => {
    const pivot = pivotGroupRef.current;
    const offset = offsetGroupRef.current;
    if (!pivot || !offset) return;

    if (plan && schedule && plan.elapsedMs < schedule.startMs + schedule.durationMs) {
      finishedRunIdRef.current = null;
      pivot.position.set(pivotX, pivotY, pivotZ);
      offset.position.set(-pivotX, -pivotY, -pivotZ);
      pivot.scale.set(0.95, 0.001, 0.95);
      pivot.visible = false;
      setShowOverlay(true);
      return;
    }

    // Estado neutro (identidad): sin transformación ni sobrecarga
    pivot.position.set(0, 0, 0);
    pivot.scale.set(1, 1, 1);
    pivot.visible = true;
    offset.position.set(0, 0, 0);
    setShowOverlay(false);
  }, [plan, schedule, pivotX, pivotY, pivotZ]);

  useFrame(() => {
    const currentPlan = getKitchenBuildAnimationPlan();
    if (!currentPlan || !schedule || currentPlan.runId !== plan?.runId) return;
    if (finishedRunIdRef.current === currentPlan.runId) return;

    const pivot = pivotGroupRef.current;
    const offset = offsetGroupRef.current;
    if (!pivot || !offset) return;

    const elapsed = currentPlan.elapsedMs;
    const localMs = elapsed - schedule.startMs;

    if (localMs < 0) {
      pivot.visible = false;
      if (blueprintGroupRef.current) blueprintGroupRef.current.visible = false;
      return;
    }

    const t = Math.min(1, localMs / schedule.durationMs);

    if (t < 1) {
      // Fase 1: Trazado rápido del contorno CAD (0% -> 42% crece; 58% -> 100% desvanece)
      const bp = blueprintGroupRef.current;
      if (bp) {
        const bpGrow = easeOutCubic(Math.min(1, t / 0.42));
        bp.visible = true;
        bp.scale.set(1, Math.max(0.01, bpGrow), 1);

        const bpFade = t <= 0.58 ? 1 : 1 - (t - 0.58) / 0.42;
        if (lineMatRef.current) {
          lineMatRef.current.opacity = Math.max(0, 0.95 * bpFade);
        }
        if (fillMatRef.current) {
          fillMatRef.current.opacity = Math.max(0, 0.12 * bpFade);
        }
        if (scanMatRef.current) {
          const scanFade = t <= 0.48 ? 1 : Math.max(0, 1 - (t - 0.48) / 0.32);
          scanMatRef.current.opacity = 0.34 * scanFade;
        }
        if (scanMeshRef.current) {
          scanMeshRef.current.visible = t < 0.8;
        }
      }

      // Fase 2: Despliegue del volumen real del mueble desde su base (26% -> 100%)
      const solidProgress = Math.max(0, Math.min(1, (t - 0.26) / 0.74));
      if (solidProgress <= 0) {
        pivot.visible = false;
      } else {
        const eased = easeOutCubic(solidProgress);
        pivot.visible = true;
        pivot.position.set(pivotX, pivotY, pivotZ);
        offset.position.set(-pivotX, -pivotY, -pivotZ);
        pivot.scale.set(
          0.95 + 0.05 * eased,
          0.06 + 0.94 * eased,
          0.95 + 0.05 * eased
        );
      }
      return;
    }

    // Finalizado: restaurar matriz identidad exacta y retirar contorno auxiliar
    finishedRunIdRef.current = currentPlan.runId;
    pivot.position.set(0, 0, 0);
    pivot.scale.set(1, 1, 1);
    pivot.visible = true;
    offset.position.set(0, 0, 0);
    if (blueprintGroupRef.current) {
      blueprintGroupRef.current.visible = false;
    }
    setShowOverlay(false);
  });

  return (
    <group>
      <group ref={pivotGroupRef}>
        <group ref={offsetGroupRef}>{children}</group>
      </group>
      {showOverlay && (
        <CabinetBlueprintOverlay
          width={safeW}
          height={safeH}
          depth={safeD}
          pivotPosition={[pivotX, pivotY, pivotZ]}
          rotationY={safeRot}
          groupRef={blueprintGroupRef}
          lineMatRef={lineMatRef}
          fillMatRef={fillMatRef}
          scanMeshRef={scanMeshRef}
          scanMatRef={scanMatRef}
        />
      )}
    </group>
  );
}

interface KitchenFinishingRevealProps {
  children: React.ReactNode;
}

/**
 * Avanza el reloj virtual por frame, asienta las terminaciones finales (zócalo, cubierta,
 * respaldo de isla) al cierre del armado y cancela instantáneamente ante nueva interacción del usuario.
 */
export function KitchenFinishingReveal({ children }: KitchenFinishingRevealProps) {
  const plan = useActiveBuildPlan();
  const viewMode = useKitchenStore((s) => s.viewMode);
  const draggingCabinetId = useKitchenStore((s) => s.draggingCabinetId);
  const activeCabinetId = useKitchenStore((s) => s.activeCabinetId);

  const groupRef = useRef<THREE.Group | null>(null);
  const startedSnapshotRef = useRef<{
    runId: number;
    initialViewMode: string;
    initialActiveCabinetId: string | null;
  } | null>(null);

  // Registrar estado inicial del run para cancelar solo ante acciones NUEVAS del usuario
  useEffect(() => {
    if (!plan) {
      startedSnapshotRef.current = null;
      return;
    }

    if (!startedSnapshotRef.current || startedSnapshotRef.current.runId !== plan.runId) {
      startedSnapshotRef.current = {
        runId: plan.runId,
        initialViewMode: viewMode,
        initialActiveCabinetId: activeCabinetId,
      };
      return;
    }

    const snap = startedSnapshotRef.current;
    const switchedTo2D = viewMode === '2d' && snap.initialViewMode !== '2d';
    const selectedNewCabinet =
      activeCabinetId !== null && activeCabinetId !== snap.initialActiveCabinetId;

    if (draggingCabinetId || switchedTo2D || selectedNewCabinet) {
      cancelKitchenBuildAnimation();
    }
  }, [plan, viewMode, draggingCabinetId, activeCabinetId]);

  useLayoutEffect(() => {
    const grp = groupRef.current;
    if (!grp) return;

    if (plan && plan.animateFinishing && plan.elapsedMs < plan.finishingStartMs + plan.finishingDurationMs) {
      grp.visible = false;
      grp.position.set(0, 8, 0);
      return;
    }

    grp.visible = true;
    grp.position.set(0, 0, 0);
  }, [plan]);

  useFrame((_, delta) => {
    const currentPlan = getKitchenBuildAnimationPlan();
    if (!currentPlan) return;

    const elapsed = advanceKitchenBuildAnimation(currentPlan.runId, delta);

    const grp = groupRef.current;
    if (grp && currentPlan.animateFinishing) {
      const localMs = elapsed - currentPlan.finishingStartMs;
      if (localMs < 0) {
        grp.visible = false;
      } else if (localMs < currentPlan.finishingDurationMs) {
        const eased = easeOutCubic(localMs / currentPlan.finishingDurationMs);
        grp.visible = true;
        grp.position.set(0, (1 - eased) * 8, 0);
      } else {
        grp.visible = true;
        grp.position.set(0, 0, 0);
      }
    }

    if (elapsed >= currentPlan.totalDurationMs + 80) {
      completeKitchenBuildAnimation(currentPlan.runId);
    }
  });

  return <group ref={groupRef}>{children}</group>;
}
