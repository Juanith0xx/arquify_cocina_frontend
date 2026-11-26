import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CabinetType, useKitchenStore } from '../../store/kitchenStore';
import {
  KitchenBuildAnimationPlan,
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

  return (
    <group
      ref={groupRef}
      position={pivotPosition}
      rotation={[0, rotationY, 0]}
      visible={false}
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
          opacity={0.28}
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

    if (plan && schedule) {
      const elapsed = performance.now() - plan.startedAtMs;
      if (elapsed < schedule.startMs + schedule.durationMs) {
        finishedRunIdRef.current = null;
        pivot.position.set(pivotX, pivotY, pivotZ);
        offset.position.set(-pivotX, -pivotY, -pivotZ);
        pivot.scale.set(0.96, 0.001, 0.96);
        pivot.visible = false;
        setShowOverlay(true);
        return;
      }
    }

    // Estado neutro (identidad): sin transformación ni sobrecarga
    pivot.position.set(0, 0, 0);
    pivot.scale.set(1, 1, 1);
    pivot.visible = true;
    offset.position.set(0, 0, 0);
    setShowOverlay(false);
  }, [plan, schedule, pivotX, pivotY, pivotZ]);

  useFrame(() => {
    if (!plan || !schedule) return;
    if (finishedRunIdRef.current === plan.runId) return;

    const pivot = pivotGroupRef.current;
    const offset = offsetGroupRef.current;
    if (!pivot || !offset) return;

    const elapsed = performance.now() - plan.startedAtMs;
    const localMs = elapsed - schedule.startMs;

    if (localMs < 0) {
      pivot.visible = false;
      if (blueprintGroupRef.current) blueprintGroupRef.current.visible = false;
      return;
    }

    const t = Math.min(1, localMs / schedule.durationMs);

    if (t < 1) {
      // Fase 1: Trazado rápido del contorno arquitectónico (0% -> 38% crece; 55% -> 100% desvanece)
      const bp = blueprintGroupRef.current;
      if (bp) {
        const bpGrow = easeOutCubic(Math.min(1, t / 0.38));
        bp.visible = true;
        bp.scale.set(1, Math.max(0.01, bpGrow), 1);

        const bpFade = t <= 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
        if (lineMatRef.current) {
          lineMatRef.current.opacity = Math.max(0, 0.95 * bpFade);
        }
        if (scanMatRef.current) {
          const scanFade = t <= 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.3);
          scanMatRef.current.opacity = 0.28 * scanFade;
        }
        if (scanMeshRef.current) {
          scanMeshRef.current.visible = t < 0.75;
        }
      }

      // Fase 2: Despliegue del volumen real del mueble desde su base (20% -> 100%)
      const solidProgress = Math.max(0, Math.min(1, (t - 0.2) / 0.8));
      if (solidProgress <= 0) {
        pivot.visible = false;
      } else {
        const eased = easeOutCubic(solidProgress);
        pivot.visible = true;
        pivot.position.set(pivotX, pivotY, pivotZ);
        offset.position.set(-pivotX, -pivotY, -pivotZ);
        pivot.scale.set(
          0.96 + 0.04 * eased,
          0.08 + 0.92 * eased,
          0.96 + 0.04 * eased
        );
      }
      return;
    }

    // Finalizado: restaurar matriz identidad exacta y retirar contorno auxiliar
    finishedRunIdRef.current = plan.runId;
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
 * Envuelve las terminaciones finales (zócalo, cubierta, respaldo de isla) para que
 * se asienten suavemente como remate al concluir la secuencia de módulos, y además
 * cancela instantáneamente la animación si el usuario interactúa o cambia a vista 2D.
 */
export function KitchenFinishingReveal({ children }: KitchenFinishingRevealProps) {
  const plan = useActiveBuildPlan();
  const viewMode = useKitchenStore((s) => s.viewMode);
  const draggingCabinetId = useKitchenStore((s) => s.draggingCabinetId);
  const activeCabinetId = useKitchenStore((s) => s.activeCabinetId);

  const groupRef = useRef<THREE.Group | null>(null);

  // Cancelación instantánea si el usuario cambia a vista 2D, selecciona o arrastra un mueble
  useEffect(() => {
    if (!plan) return;
    if (viewMode === '2d' || draggingCabinetId || activeCabinetId) {
      cancelKitchenBuildAnimation();
    }
  }, [plan, viewMode, draggingCabinetId, activeCabinetId]);

  useLayoutEffect(() => {
    const grp = groupRef.current;
    if (!grp) return;

    if (plan && plan.animateFinishing) {
      const elapsed = performance.now() - plan.startedAtMs;
      if (elapsed < plan.finishingStartMs + plan.finishingDurationMs) {
        grp.visible = false;
        grp.position.set(0, 6, 0);
        return;
      }
    }

    grp.visible = true;
    grp.position.set(0, 0, 0);
  }, [plan]);

  useFrame(() => {
    if (!plan) return;
    const elapsed = performance.now() - plan.startedAtMs;

    const grp = groupRef.current;
    if (grp && plan.animateFinishing) {
      const localMs = elapsed - plan.finishingStartMs;
      if (localMs < 0) {
        grp.visible = false;
      } else if (localMs < plan.finishingDurationMs) {
        const eased = easeOutCubic(localMs / plan.finishingDurationMs);
        grp.visible = true;
        grp.position.set(0, (1 - eased) * 6, 0);
      } else {
        grp.visible = true;
        grp.position.set(0, 0, 0);
      }
    }

    if (elapsed >= plan.totalDurationMs + 60) {
      completeKitchenBuildAnimation(plan.runId);
    }
  });

  return <group ref={groupRef}>{children}</group>;
}
