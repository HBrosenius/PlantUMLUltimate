import { useSyncExternalStore } from "react";

/** Browser storage writes whose failure means unsaved work may not be recoverable after a reload. */
export type StorageWrite = "workspace" | "project";

export interface StorageHealth {
  /** Writes whose latest attempt failed. */
  failing: readonly StorageWrite[];
  usage?: { used: number; quota: number };
  persisted?: boolean;
}

/** Usage above this share of the quota is reported before writes start failing. */
export const STORAGE_WARNING_RATIO = 0.9;

let health: StorageHealth = { failing: [] };
const listeners = new Set<() => void>();

function update(next: StorageHealth): void {
  health = next;
  listeners.forEach((listener) => listener());
}

/** Records the outcome of a browser storage write; only changes state when the outcome changes. */
export function reportStorageWrite(write: StorageWrite, ok: boolean): void {
  const failing = health.failing.includes(write);
  if (ok === !failing) return;
  update({
    ...health,
    failing: ok ? health.failing.filter((item) => item !== write) : [...health.failing, write],
  });
}

/** Refreshes usage and persistence from the Storage API where the browser supports it. */
export async function refreshStorageEstimate(): Promise<void> {
  const storage = globalThis.navigator?.storage;
  if (!storage?.estimate) return;
  try {
    const [estimate, persisted] = await Promise.all([storage.estimate(), storage.persisted?.()]);
    update({
      ...health,
      ...(estimate.quota ? { usage: { used: estimate.usage ?? 0, quota: estimate.quota } } : {}),
      ...(persisted !== undefined ? { persisted } : {}),
    });
  } catch {
    // Some privacy modes reject estimates; the indicator then relies on write outcomes only.
  }
}

/** Asks the browser to exempt this site's data from automatic eviction. Returns whether it is persisted. */
export async function requestPersistentStorage(): Promise<boolean> {
  const storage = globalThis.navigator?.storage;
  if (!storage?.persist) return false;
  try {
    const persisted = await storage.persist();
    update({ ...health, persisted });
    return persisted;
  } catch {
    return false;
  }
}

export function storageNearlyFull(value: StorageHealth): boolean {
  return Boolean(value.usage && value.usage.used / value.usage.quota >= STORAGE_WARNING_RATIO);
}

/** A one-line explanation of the current storage state for the status bar. */
export function describeStorageHealth(value: StorageHealth): string {
  const usage = value.usage
    ? `${formatBytes(value.usage.used)} of ${formatBytes(value.usage.quota)} used`
    : "Usage unavailable";
  if (value.failing.length)
    return `Browser storage could not save ${value.failing.join(", ")} data, so unsaved work may not be restored after a reload. Save your files, then free browser storage. ${usage}.`;
  if (storageNearlyFull(value))
    return `Browser storage is nearly full (${usage}). Save your files and close unused documents.`;
  return `Unsaved work is kept in browser storage (${usage}${value.persisted ? ", protected from eviction" : ""}).`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

export function getStorageHealth(): StorageHealth {
  return health;
}

export function useStorageHealth(): StorageHealth {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => health,
    () => health,
  );
}

/** Test helper: restores the initial state. */
export function resetStorageHealth(): void {
  update({ failing: [] });
}
