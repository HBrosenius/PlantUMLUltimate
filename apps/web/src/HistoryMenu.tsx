import { useEffect, useRef, useState } from "react";

/** Most steps shown in each section; older steps stay reachable with repeated undo. */
const VISIBLE_STEPS = 25;

/**
 * Lists recent undo and redo steps. Choosing a step undoes (or redoes) everything up to and including it.
 */
export function HistoryMenu({
  undoSteps,
  redoSteps,
  onUndo,
  onRedo,
}: {
  undoSteps: readonly string[];
  redoSteps: readonly string[];
  onUndo(steps: number): void;
  onRedo(steps: number): void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) toggle.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", keyboard, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", keyboard, true);
    };
  }, [open]);

  const moveFocus = (direction: 1 | -1) => {
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(current + direction + items.length) % items.length]?.focus();
  };
  const choose = (action: () => void) => {
    close(true);
    action();
  };
  const empty = !undoSteps.length && !redoSteps.length;

  return (
    <div className="history-menu" ref={root}>
      <button
        ref={toggle}
        type="button"
        aria-label="Recent changes"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={empty}
        onClick={() => setOpen((value) => !value)}
      >
        ▾
      </button>
      {open && (
        <div
          className="application-menu-panel history-menu-panel"
          role="menu"
          aria-label="Recent changes"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              moveFocus(event.key === "ArrowDown" ? 1 : -1);
            }
          }}
        >
          {redoSteps.length > 0 && <p className="history-menu-heading">Redo</p>}
          {redoSteps
            .slice(0, VISIBLE_STEPS)
            .map((description, index) => ({ description, index }))
            .reverse()
            .map(({ description, index }) => (
              <button
                key={`redo-${index}`}
                type="button"
                role="menuitem"
                className="history-menu-redo"
                title={`Redo ${index + 1} step${index ? "s" : ""}`}
                onClick={() => choose(() => onRedo(index + 1))}
              >
                {description}
              </button>
            ))}
          {undoSteps.length > 0 && <p className="history-menu-heading">Undo</p>}
          {undoSteps.slice(0, VISIBLE_STEPS).map((description, index) => (
            <button
              key={`undo-${index}`}
              type="button"
              role="menuitem"
              title={`Undo ${index + 1} step${index ? "s" : ""}`}
              onClick={() => choose(() => onUndo(index + 1))}
            >
              {description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
