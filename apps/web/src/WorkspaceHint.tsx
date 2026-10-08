import { useState } from "react";
import type { DiagramKind } from "./model";
import { storageGet } from "./safe-storage";

export function WorkspaceHint({ kind }: { kind: DiagramKind }) {
  const key = `plantuml-ultimate.hint.${kind}`;
  const [dismissed, setDismissed] = useState(() => storageGet(key) === "dismissed");
  if (dismissed) return null;
  const item =
    kind === "gantt"
      ? "task"
      : kind === "sequence"
        ? "participant or message"
        : kind === "wbs"
          ? "work package"
          : kind === "activity"
            ? "action"
            : kind === "usecase"
              ? "actor or use case"
              : "object";
  return (
    <span className="workspace-hint">
      Use Add for a new {item}; select an item to edit its properties.
      <button
        type="button"
        aria-label="Dismiss editing hint"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(key, "dismissed");
          } catch {
            /* Dismiss for this session. */
          }
        }}
      >
        ×
      </button>
    </span>
  );
}
