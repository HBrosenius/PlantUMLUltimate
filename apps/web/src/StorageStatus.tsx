import { useEffect, useRef, useState } from "react";
import type { ProjectRecoveryStatus } from "./projects/use-embedded-project";
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
export function StorageStatus({
  onExplain,
  recoveryStatus,
  encrypted = false,
}: {
  onExplain(message: string): void;
  recoveryStatus?: ProjectRecoveryStatus | undefined;
  encrypted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [open]);
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
  const warning =
    failing || storageNearlyFull(health) || health.workspaceBackend === "memory" || recoveryStatus === "error";
  const description = describeStorageHealth(health);
  const backend =
    health.workspaceBackend === "localstorage"
      ? "Local recovery"
      : health.workspaceBackend === "memory"
        ? "Memory only"
        : "IndexedDB";
  const disabled = encrypted || recoveryStatus === "disabled";
  const label = disabled
    ? "Recovery disabled"
    : recoveryStatus === "saving"
      ? "Updating recovery…"
      : failing || recoveryStatus === "error"
        ? "Recovery failed"
        : health.workspaceBackend === "memory"
          ? "Recovery unavailable"
          : warning
            ? "Recovery nearly full"
            : recoveryStatus === "current"
              ? "Recovery current"
              : "Browser recovery";
  return (
    <div
      className="storage-status-root"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={`storage-status${warning ? " is-warning" : ""}`}
        title={description}
        aria-label={`Browser storage: ${description}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {warning && !disabled ? "⚠ " : ""}
        {label}
      </button>
      {open && (
        <section className="storage-details" aria-label="Browser recovery details">
          <strong>{label}</strong>
          <p>
            {disabled ? "Encrypted document recovery is disabled. Save a file copy to protect changes." : description}
          </p>
          <p>Storage engine: {backend}. Browser recovery is separate from saving a file.</p>
          {warning && <p>Save a file copy before closing this tab.</p>}
          {!disabled && !health.persisted && (
            <button
              type="button"
              onClick={() => {
                void requestPersistentStorage().then((persisted) =>
                  onExplain(
                    persisted
                      ? "Browser recovery is now protected from automatic eviction."
                      : "Persistent storage was not granted. Keep a saved file copy.",
                  ),
                );
              }}
            >
              Protect browser recovery
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            Close details
          </button>
        </section>
      )}
    </div>
  );
}
