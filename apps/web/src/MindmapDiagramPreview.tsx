import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import type { MindmapDocument } from "@plantuml-studio/diagram-mindmap";
import { previewInteractionGuard } from "./preview-interaction-guard";
import { PreviewRenderNotice } from "./render/PreviewRenderNotice";
import type { RenderStatus } from "./model";
import { useDiagramNavigation, type InitialDiagramFit } from "./useDiagramNavigation";
import { MAX_DIAGRAM_ZOOM, MIN_DIAGRAM_ZOOM } from "./diagram-zoom";
import { mindmapRenderOrder } from "./features/mindmap/mindmap-render-order";
import {
  useTreeNodeHitTargets,
  type TreeNodeHitTarget,
  type TreeNodeHitTargetOptions,
} from "./tree-preview/use-tree-node-hit-targets";

const MINDMAP_HIT_TARGET_OPTIONS: Omit<TreeNodeHitTargetOptions, "order"> = {
  attribute: "data-mindmap-node-id",
  hitClass: "mindmap-node-hit",
  selectedClass: "mindmap-selected-node",
  staleSelector: ".mindmap-node-hit",
  ariaLabel: (node) => `Select mindmap node ${node.label}`,
  // Node labels are direct children of the engine's top group. Title, legend and the like sit in nested
  // groups, so a node called "Title" cannot take the diagram title.
  textSelector: "svg > g > text",
  matchRuns: true,
};

interface Props {
  svg?: string | undefined;
  document: MindmapDocument;
  editingEnabled?: boolean | undefined;
  selectedId?: string | undefined;
  initialFit?: InitialDiagramFit | undefined;
  zoom: number;
  onZoomChange(zoom: number): void;
  renderStatus: RenderStatus;
  renderError?: string | undefined;
  onRenderRetry(): void;
  onSelect(id?: string): void;
  /** F2 on a node: rename it in place. Returns false when it could not start. */
  onInlineRename?: ((id: string, anchor: Element) => boolean) | undefined;
}

/** The rendered mindmap with zoom and fit, and nodes that can be selected. */
export function MindmapDiagramPreview({
  initialFit,
  svg,
  document,
  editingEnabled = true,
  selectedId,
  zoom,
  onZoomChange,
  renderStatus,
  renderError,
  onRenderRetry,
  onSelect,
  onInlineRename,
}: Props) {
  const navigation = useDiagramNavigation(zoom, onZoomChange, { svg, initialFit });
  const root = useRef<HTMLDivElement>(null);
  const hitTargets = useRef(new Map<string, TreeNodeHitTarget>());
  const focusBeforeRender = useRef<string | undefined>(undefined);
  const hitOptions = useMemo<TreeNodeHitTargetOptions>(
    () => ({ ...MINDMAP_HIT_TARGET_OPTIONS, order: () => mindmapRenderOrder(document) }),
    [document],
  );
  useLayoutEffect(() => {
    const host = root.current;
    if (!host || !svg) return;
    const active = globalThis.document.activeElement;
    focusBeforeRender.current =
      active && host.contains(active) ? (active.getAttribute("aria-label") ?? undefined) : undefined;
    host.innerHTML = svg;
  }, [svg]);
  useTreeNodeHitTargets(root, document.nodes, hitOptions, hitTargets, [document, svg]);
  useLayoutEffect(() => {
    const host = root.current;
    const previousLabel = focusBeforeRender.current;
    if (!host || !previousLabel) return;
    focusBeforeRender.current = undefined;
    [...host.querySelectorAll<SVGElement>("[aria-label]")]
      .find((item) => item.getAttribute("aria-label") === previousLabel)
      ?.focus();
  }, [document, svg]);
  useLayoutEffect(() => {
    root.current
      ?.querySelectorAll<SVGElement>("text[data-mindmap-node-id]")
      .forEach((element) =>
        element.classList.toggle("mindmap-selected-node", element.getAttribute("data-mindmap-node-id") === selectedId),
      );
  }, [document, svg, selectedId]);
  // The label closest to a point, for a click on a node's box rather than on its text.
  const nodeElementAt = useCallback((x: number, y: number) => {
    let closest: SVGTextElement | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const node of root.current?.querySelectorAll<SVGTextElement>("text[data-mindmap-node-id]") ?? []) {
      const bounds = node.getBoundingClientRect();
      const distance = Math.hypot(x - (bounds.left + bounds.width / 2), y - (bounds.top + bounds.height / 2));
      if (distance < closestDistance) {
        closest = node;
        closestDistance = distance;
      }
    }
    return closestDistance <= 48 ? closest : undefined;
  }, []);
  const nodeIdAt = (event: { target: EventTarget; clientX: number; clientY: number }) =>
    (event.target as Element).closest<SVGElement>("[data-mindmap-node-id]")?.dataset.mindmapNodeId ??
    nodeElementAt(event.clientX, event.clientY)?.dataset.mindmapNodeId;
  return (
    <section className="preview mindmap-preview" aria-label="Mindmap diagram preview" data-render-status={renderStatus}>
      <div className="preview-tools">
        <button
          type="button"
          data-view-control
          onClick={navigation.fit}
          aria-label="Fit diagram"
          title="Fit the diagram in the visible canvas"
        >
          Fit
        </button>
        <button
          onClick={() => onZoomChange(Math.max(MIN_DIAGRAM_ZOOM, zoom - 0.1))}
          data-view-control
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          onClick={() => onZoomChange(1)}
          data-view-control
          aria-label={`Reset zoom, ${Math.round(zoom * 100)}%`}
          title="Reset canvas zoom to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => onZoomChange(Math.min(MAX_DIAGRAM_ZOOM, zoom + 0.1))}
          data-view-control
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
      <div
        className={`preview-viewport${renderStatus !== "idle" && svg ? " stale-preview" : ""}`}
        ref={navigation.viewportRef}
        onPointerDown={navigation.onPointerDown}
        onAuxClick={navigation.onAuxClick}
      >
        {!svg && !renderError && (
          <div className="render-placeholder">
            {renderStatus === "rendering" ? "Rendering Mindmap…" : "Enter Mindmap source to render a preview."}
          </div>
        )}
        {svg && (
          <div
            {...previewInteractionGuard(editingEnabled)}
            ref={root}
            className="diagram mindmap-diagram"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
            onClick={(event) => {
              const id = nodeIdAt(event);
              if (id) onSelect(id);
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const id = nodeIdAt(event);
              if (id) event.preventDefault();
              else onSelect(undefined);
            }}
            onKeyDown={(event) => {
              const element = (event.target as Element).closest<SVGElement>("[data-mindmap-node-id]");
              const id = element?.dataset.mindmapNodeId;
              if (!id) return;
              if (event.key === "F2" && onInlineRename?.(id, event.target as Element)) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(id);
              }
            }}
          />
        )}
      </div>
      <p className="preview-hint">Click a node to edit it</p>
      <PreviewRenderNotice
        status={renderStatus}
        error={renderError}
        hasPreview={Boolean(svg)}
        onRetry={onRenderRetry}
      />
    </section>
  );
}
