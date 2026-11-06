import { useEffect, useRef, type ReactNode } from "react";
import type { StageSelection } from "./stage-selection";

export type LensState = "strip" | "peek" | "expanded";

export interface SourceLensProps {
  state: LensState;
  selection: StageSelection | undefined;
  onExpand(): void;
  onCollapse(): void;
  /** Focus-view toggle in the header: back from the full editor to the selection's lines. */
  onFocusView(): void;
  /** The shared source editor; only mounted while the lens is open. */
  children: ReactNode;
}

/**
 * Right-hand translucent panel. A strip by default; with a selection it shows only that element's lines;
 * Ctrl/⌘+E expands it to the full editor. The editor itself is the app's CodeEditor, passed in.
 */
export function SourceLens({ state, selection, onExpand, onCollapse, onFocusView, children }: SourceLensProps) {
  const panel = useRef<HTMLElement>(null);
  const previous = useRef<LensState>(state);
  useEffect(() => {
    // Expanding to the full editor moves the caret into it; collapsing hands focus back to the canvas.
    if (previous.current !== "expanded" && state === "expanded")
      requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>(".cm-content")?.focus());
    if (previous.current === "expanded" && state !== "expanded" && panel.current?.contains(document.activeElement))
      document.querySelector<HTMLElement>(".mode-stage .preview-viewport")?.focus({ preventScroll: true });
    previous.current = state;
  }, [state]);

  if (state === "strip")
    return (
      <aside
        ref={panel}
        className="stage-lens"
        data-view-control
        data-state="strip"
        data-testid="source-lens"
        aria-label="Source lens"
      >
        <button
          type="button"
          className="stage-lens-strip"
          aria-expanded={false}
          aria-keyshortcuts="Control+E Meta+E"
          title="Open the source (Ctrl/⌘+E)"
          onClick={onExpand}
        >
          <span aria-hidden="true">‹</span>
          <span className="stage-lens-strip-text">Source</span>
        </button>
      </aside>
    );

  return (
    <aside
      ref={panel}
      className="stage-lens"
      data-view-control
      data-state={state}
      data-testid="source-lens"
      aria-label="Source lens"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          onCollapse();
        }
      }}
    >
      <header className="stage-lens-header">
        <strong>{state === "expanded" ? "Source" : (selection?.label ?? "Source")}</strong>
        <span className="stage-lens-hint">{state === "expanded" ? "Full source" : "Selected lines"}</span>
        {state === "expanded" ? (
          selection?.range && (
            <button type="button" onClick={onFocusView} title="Show only the selected element's lines">
              Selected lines
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={onExpand}
            aria-keyshortcuts="Control+E Meta+E"
            title="Open the full editor (Ctrl/⌘+E)"
          >
            Full editor ⌘E
          </button>
        )}
        <button type="button" aria-label="Collapse source lens" title="Collapse (Esc)" onClick={onCollapse}>
          ›
        </button>
      </header>
      <div className="stage-lens-body">{children}</div>
    </aside>
  );
}
