/** Retain only the latest timing per phase; no source text or document identities enter the timeline. */
export function recordPreviewPhase(phase: string, start: number): void {
  try {
    const name = `plantuml:preview:${phase}`;
    performance.clearMeasures(name);
    performance.measure(name, { start, duration: performance.now() - start });
  } catch {
    /* Timing support must never change rendering behavior. */
  }
}
export function measurePreviewPhase<T>(phase: string, run: () => T): T {
  const start = performance.now();
  try {
    return run();
  } finally {
    recordPreviewPhase(phase, start);
  }
}

/** Records a duration measured elsewhere (the renderer worker), under the same latest-only rule. */
export function recordPreviewDuration(phase: string, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  recordPreviewPhase(phase, performance.now() - durationMs);
}
