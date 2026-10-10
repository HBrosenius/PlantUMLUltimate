import { useState } from "react";
import type { DiagramKind } from "./model";
import { storageGet } from "./safe-storage";

export function WorkspaceHint({ kind }: { kind: DiagramKind }) {
  const key = `plantuml-ultimate.hint.${kind}`;
  const [open, setOpen] = useState(() => storageGet(key) !== "dismissed");
  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(key, "dismissed");
    } catch {
      /* Keep dismissal for this mounted diagram. */
    }
  };
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
    <span className="workspace-hint" data-inspector-trigger>
      <button type="button" aria-expanded={open} onClick={() => (open ? dismiss() : setOpen(true))}>
        Editing help
      </button>
      {open && (
        <span className="workspace-hint-content" role="note">
          Use Add for a new {item}; click an item once to edit its properties.
          {kind === "sequence" && " Drag participants sideways and timeline elements vertically to reorder them."}
          <button type="button" aria-label="Dismiss editing hint" onClick={dismiss}>
            ×
          </button>
        </span>
      )}
    </span>
  );
}
