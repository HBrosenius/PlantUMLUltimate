import { useEffect } from "react";
import {
  describeStorageHealth,
  refreshStorageEstimate,
  requestPersistentStorage,
  storageNearlyFull,
  useStorageHealth,
} from "./storage-health";

/** How often usage is re-estimated while the editor is open. */
const ESTIMATE_INTERVAL_MS = 60_000;

/** Status-bar indicator for browser storage; warns when recovery data can no longer be saved. */
export function StorageStatus({ onExplain }: { onExplain(message: string): void }) {
  const health = useStorageHealth();
  useEffect(() => {
    void refreshStorageEstimate();
    const timer = window.setInterval(() => void refreshStorageEstimate(), ESTIMATE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);
  // A failed write usually means the quota changed; refresh the numbers shown in the explanation.
  useEffect(() => {
    if (health.failing.length) void refreshStorageEstimate();
  }, [health.failing.length]);

  const failing = health.failing.length > 0;
  const warning = failing || storageNearlyFull(health);
  const description = describeStorageHealth(health);
  const backend =
    health.workspaceBackend === "localstorage"
      ? "Local recovery"
      : health.workspaceBackend === "memory"
        ? "Memory only"
        : "IndexedDB";
  return (
    <button
      type="button"
      className={`storage-status${warning ? " is-warning" : ""}`}
      title={description}
      aria-label={`Browser storage: ${description}`}
      onClick={() => {
        onExplain(description);
        // Only ask for persistence on request: Firefox shows a permission prompt for it.
        if (!health.persisted)
          void requestPersistentStorage().then((persisted) => {
            if (persisted) onExplain(`${description} This site's data is now protected from automatic eviction.`);
          });
      }}
    >
      {failing ? `⚠ ${backend} not saving` : warning ? `⚠ ${backend} nearly full` : backend}
    </button>
  );
}
