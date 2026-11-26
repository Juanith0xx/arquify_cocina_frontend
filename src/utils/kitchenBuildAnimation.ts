export interface CabinetBuildScheduleItem {
  startMs: number;
  durationMs: number;
}

export interface KitchenBuildAnimationPlan {
  runId: number;
  startedAtMs: number;
  items: Map<string, CabinetBuildScheduleItem>;
  finishingStartMs: number;
  finishingDurationMs: number;
  totalDurationMs: number;
  animateFinishing: boolean;
}

let currentRunId = 0;
let activePlan: KitchenBuildAnimationPlan | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener errors to avoid disrupting render loop
    }
  });
}

/**
 * Registra una secuencia visual de armado progresivo para los módulos recién generados por el agente IA.
 * Es puramente visual (fuera de Zustand) para no afectar despiece, precios, colisiones ni historial undo.
 */
export function startKitchenBuildAnimation(
  cabinetIds: string[],
  options?: { animateFinishing?: boolean }
): void {
  const uniqueIds = Array.from(new Set(cabinetIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    cancelKitchenBuildAnimation();
    return;
  }

  const count = uniqueIds.length;
  const animateFinishing = Boolean(options?.animateFinishing);

  // Tiempos adaptativos: siempre ágil (~1.2s a ~2.0s total) sin importar cuántos módulos tenga el proyecto
  const staggerMs =
    count > 1 ? Math.max(45, Math.min(115, Math.floor(1450 / (count - 1)))) : 0;
  const itemDurationMs = count > 12 ? 225 : 260;

  const items = new Map<string, CabinetBuildScheduleItem>();
  uniqueIds.forEach((id, idx) => {
    items.set(id, {
      startMs: idx * staggerMs,
      durationMs: itemDurationMs,
    });
  });

  const lastCabinetEndMs = (count - 1) * staggerMs + itemDurationMs;
  const finishingDurationMs = 260;
  const finishingStartMs = Math.max(0, lastCabinetEndMs - 100);
  const totalDurationMs = animateFinishing
    ? finishingStartMs + finishingDurationMs
    : lastCabinetEndMs;

  currentRunId += 1;
  activePlan = {
    runId: currentRunId,
    startedAtMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    items,
    finishingStartMs,
    finishingDurationMs,
    totalDurationMs,
    animateFinishing,
  };

  emitChange();
}

export function cancelKitchenBuildAnimation(): void {
  if (!activePlan) return;
  activePlan = null;
  emitChange();
}

export function completeKitchenBuildAnimation(runId: number): void {
  if (!activePlan || activePlan.runId !== runId) return;
  activePlan = null;
  emitChange();
}

export function getKitchenBuildAnimationPlan(): KitchenBuildAnimationPlan | null {
  return activePlan;
}

export function subscribeKitchenBuildAnimation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
