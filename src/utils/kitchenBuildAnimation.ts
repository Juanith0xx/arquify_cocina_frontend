export interface CabinetBuildScheduleItem {
  startMs: number;
  durationMs: number;
}

export interface KitchenBuildAnimationPlan {
  runId: number;
  /** Reloj virtual acumulado solo con fotogramas reales pintados (evita saltos por montaje React/WebGL). */
  elapsedMs: number;
  /** Fotogramas iniciales de estabilización antes de iniciar el conteo para absorber compilación de shaders. */
  warmupFramesRemaining: number;
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

  // Ritmo claramente perceptible mueble por mueble, siempre ágil (~1.5s a ~3.0s total)
  const staggerMs =
    count > 1 ? Math.max(95, Math.min(150, Math.floor(2400 / (count - 1)))) : 0;
  const itemDurationMs = 340;

  const items = new Map<string, CabinetBuildScheduleItem>();
  uniqueIds.forEach((id, idx) => {
    items.set(id, {
      startMs: idx * staggerMs,
      durationMs: itemDurationMs,
    });
  });

  const lastCabinetEndMs = (count - 1) * staggerMs + itemDurationMs;
  const finishingDurationMs = 280;
  const finishingStartMs = Math.max(0, lastCabinetEndMs - 80);
  const totalDurationMs = animateFinishing
    ? finishingStartMs + finishingDurationMs
    : lastCabinetEndMs;

  currentRunId += 1;
  activePlan = {
    runId: currentRunId,
    elapsedMs: 0,
    warmupFramesRemaining: 3,
    items,
    finishingStartMs,
    finishingDurationMs,
    totalDurationMs,
    animateFinishing,
  };

  emitChange();
}

/**
 * Avanza el reloj virtual de la animación usando delta acotado por fotograma (máx. 33.3 ms),
 * garantizando que picos de montaje o compilación WebGL nunca salten la secuencia.
 */
export function advanceKitchenBuildAnimation(runId: number, deltaSeconds: number): number {
  if (!activePlan || activePlan.runId !== runId) return 0;

  if (activePlan.warmupFramesRemaining > 0) {
    activePlan.warmupFramesRemaining -= 1;
    return 0;
  }

  const clampedDeltaMs = Math.min(Math.max(deltaSeconds, 0) * 1000, 33.33);
  activePlan.elapsedMs += clampedDeltaMs;
  return activePlan.elapsedMs;
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
