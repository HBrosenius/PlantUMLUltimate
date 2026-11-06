import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { MAX_DIAGRAM_ZOOM, MIN_DIAGRAM_ZOOM } from "../diagram-zoom";
import type { DiagramKind } from "../model";
import { SelectionDock } from "./SelectionDock";
import { SourceLens, type LensState } from "./SourceLens";
import { DIAGRAM_NOUN, type AddItem, type DockAction, type StageSelection, type TextRange } from "./stage-selection";
import "./stage.css";

const IDLE_MS = 3000;

export interface StageViewProps {
  /** The `<main class="workspace mode-stage">` element this overlay sits in. */
  containerRef: RefObject<HTMLElement | null>;
  documentId: string;
  diagramKind: DiagramKind;
  selection: StageSelection | undefined;
  zoom: number;
  onZoomChange(zoom: number): void;
  lensExpanded: boolean;
  onLensExpandedChange(expanded: boolean): void;
  /** The app's own CodeEditor, mounted inside the lens (lens options narrow it to the selected lines). */
  renderSourceEditor(lens: { visibleRange?: TextRange | undefined; revealWithoutFocus?: boolean }): ReactNode;
  dockActions: DockAction[];
  addItems: AddItem[];
  readOnly: boolean;
  inspectorOpen: boolean;
  onToggleInspector(): void;
}

/** Click an existing (hidden) preview control so Stage reuses each family's own navigation logic. */
function clickPreviewControl(container: HTMLElement | null, label: string) {
  container?.querySelector<HTMLButtonElement>(`.preview [aria-label="${label}"]`)?.click();
}

export function StageView({
  containerRef,
  documentId,
  diagramKind,
  selection,
  zoom,
  onZoomChange,
  lensExpanded,
  onLensExpandedChange,
  renderSourceEditor,
  dockActions,
  addItems,
  readOnly,
  inspectorOpen,
  onToggleInspector,
}: StageViewProps) {
  // Keep the last selection while the lens has focus: renaming a task in the lens changes its id, and the
  // lens must not vanish under the caret while the source is briefly unparsable.
  const [lensFocused, setLensFocused] = useState(false);
  const lastSelection = useRef<StageSelection | undefined>(undefined);
  if (selection) lastSelection.current = selection;
  if (!selection && !lensFocused) lastSelection.current = undefined;
  const effective = selection ?? (lensFocused ? lastSelection.current : undefined);

  const [dismissedFor, setDismissedFor] = useState<string>();
  const selectionKey = effective ? `${effective.kind}:${effective.id}` : undefined;
  useEffect(() => {
    if (dismissedFor && dismissedFor !== selectionKey) setDismissedFor(undefined);
  }, [dismissedFor, selectionKey]);
  const lensState: LensState = lensExpanded
    ? "expanded"
    : effective?.range && dismissedFor !== selectionKey
      ? "peek"
      : "strip";

  // Fit and centre on open; the shared preview navigation then keeps the diagram fitted on resize until the
  // user zooms or pans.
  const fit = useCallback((follow: boolean) => {
    window.dispatchEvent(new CustomEvent("fit-active-diagram", { detail: { follow } }));
  }, []);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => fit(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [documentId, diagramKind, fit]);

  // Centre the (scaled) diagram in the canvas. Zoom is a CSS transform, so centring uses viewport padding.
  useEffect(() => {
    let frame = 0;
    let last = "";
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const viewport = containerRef.current?.querySelector<HTMLElement>(".preview-viewport");
      const svg = viewport?.querySelector<SVGSVGElement>(".diagram svg");
      if (!viewport || !svg) return;
      const box = svg.getBoundingClientRect();
      const key = `${viewport.clientWidth}:${viewport.clientHeight}:${Math.round(box.width)}:${Math.round(box.height)}`;
      if (key === last) return;
      last = key;
      const left = Math.max(16, (viewport.clientWidth - box.width) / 2);
      const top = Math.max(16, (viewport.clientHeight - box.height) / 2);
      viewport.style.paddingLeft = `${left}px`;
      viewport.style.paddingRight = "16px";
      viewport.style.paddingTop = `${top}px`;
    };
    tick();
    const container = containerRef.current;
    return () => {
      cancelAnimationFrame(frame);
      const viewport = container?.querySelector<HTMLElement>(".preview-viewport");
      viewport?.style.removeProperty("padding-left");
      viewport?.style.removeProperty("padding-right");
      viewport?.style.removeProperty("padding-top");
    };
  }, [containerRef, documentId]);

  // Floating view controls fade when the pointer has been idle.
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    container.addEventListener("pointermove", wake);
    container.addEventListener("pointerdown", wake);
    container.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(timer);
      container.removeEventListener("pointermove", wake);
      container.removeEventListener("pointerdown", wake);
      container.removeEventListener("keydown", wake);
    };
  }, [containerRef]);

  const percent = Math.round(zoom * 100);
  return (
    <div className="stage-overlay" data-testid="stage-overlay">
      <SelectionDock
        container={containerRef}
        selection={selection}
        actions={dockActions}
        addItems={addItems}
        addLabel={`Add to ${DIAGRAM_NOUN[diagramKind]} diagram`}
        addDisabled={readOnly}
        inspectorOpen={inspectorOpen}
        onToggleInspector={onToggleInspector}
      />
      <div
        className="stage-cluster"
        role="toolbar"
        aria-label="View controls"
        data-idle={idle ? "true" : undefined}
        data-testid="stage-cluster"
      >
        {diagramKind === "gantt" && (
          <>
            <button
              type="button"
              aria-label="Previous task"
              title="Select the previous task"
              onClick={() => clickPreviewControl(containerRef.current, "Previous task")}
            >
              ◂
            </button>
            <button
              type="button"
              title="Jump to today"
              onClick={() => clickPreviewControl(containerRef.current, "Jump to today")}
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next task"
              title="Select the next task"
              onClick={() => clickPreviewControl(containerRef.current, "Next task")}
            >
              ▸
            </button>
            <span className="stage-cluster-sep" aria-hidden="true" />
          </>
        )}
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => onZoomChange(Math.max(MIN_DIAGRAM_ZOOM, zoom - 0.1))}
        >
          −
        </button>
        <button
          type="button"
          className="stage-cluster-zoom"
          aria-label={`Reset zoom, ${percent}%`}
          title="Reset to 100%"
          onClick={() => onZoomChange(1)}
        >
          {percent}%
        </button>
        <button type="button" aria-label="Zoom in" onClick={() => onZoomChange(Math.min(MAX_DIAGRAM_ZOOM, zoom + 0.1))}>
          +
        </button>
        <button type="button" aria-label="Fit diagram" title="Fit and centre the diagram" onClick={() => fit(true)}>
          ⤢
        </button>
      </div>
      <SourceLens
        state={lensState}
        selection={effective}
        onExpand={() => onLensExpandedChange(true)}
        onCollapse={() => {
          if (lensExpanded) onLensExpandedChange(false);
          else setDismissedFor(selectionKey);
        }}
        onFocusView={() => onLensExpandedChange(false)}
      >
        <div
          className="stage-lens-editor"
          onFocusCapture={() => setLensFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setLensFocused(false);
          }}
        >
          {lensState !== "strip" &&
            renderSourceEditor(
              lensState === "peek" ? { visibleRange: effective?.range, revealWithoutFocus: true } : {},
            )}
        </div>
      </SourceLens>
    </div>
  );
}
