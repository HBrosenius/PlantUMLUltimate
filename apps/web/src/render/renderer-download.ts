import { useSyncExternalStore } from "react";

/** Live progress of the renderer asset downloads, shown while the first preview is still starting. */
export interface RendererDownloadSnapshot {
  /** At least one renderer asset is downloading. */
  active: boolean;
  /** Decoded bytes received across active and finished downloads of the current attempt. */
  loadedBytes: number;
}

let snapshot: RendererDownloadSnapshot = { active: false, loadedBytes: 0 };
const listeners = new Set<() => void>();
const perAsset = new Map<string, number>();
let activeCount = 0;
let notifyTimer: ReturnType<typeof setTimeout> | undefined;

function publish() {
  notifyTimer = undefined;
  const loadedBytes = [...perAsset.values()].reduce((total, bytes) => total + bytes, 0);
  if (snapshot.active === activeCount > 0 && snapshot.loadedBytes === loadedBytes) return;
  snapshot = { active: activeCount > 0, loadedBytes };
  for (const listener of listeners) listener();
}

// Progress events can arrive for every network chunk; React only needs a few updates a second.
const scheduleNotify = () => {
  notifyTimer ??= setTimeout(publish, 150);
};

export function rendererDownloadStarted(id: string) {
  perAsset.set(id, 0);
  activeCount += 1;
  publish();
}
export function rendererDownloadProgress(id: string, loadedBytes: number) {
  perAsset.set(id, loadedBytes);
  scheduleNotify();
}
export function rendererDownloadFinished(id: string, ok: boolean) {
  activeCount = Math.max(0, activeCount - 1);
  // A failed asset is fetched again from the start, so its partial count is dropped.
  if (!ok) perAsset.delete(id);
  clearTimeout(notifyTimer);
  if (activeCount === 0 && ok) perAsset.clear();
  publish();
}
export const subscribeRendererDownload = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
export const getRendererDownload = () => snapshot;
export const useRendererDownload = () => useSyncExternalStore(subscribeRendererDownload, getRendererDownload);

export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
