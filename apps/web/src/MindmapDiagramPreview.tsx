import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MindmapDocument } from "@plantuml-studio/diagram-mindmap";
import { previewInteractionGuard } from "./preview-interaction-guard";
import { PreviewRenderNotice } from "./render/PreviewRenderNotice";
import type { RenderStatus } from "./model";
import { useDiagramNavigation, type InitialDiagramFit } from "./useDiagramNavigation";
import { MAX_DIAGRAM_ZOOM, MIN_DIAGRAM_ZOOM } from "./diagram-zoom";
import { mindmapRenderOrder } from "./features/mindmap/mindmap-render-order";
import {
  mindmapNodeAt,
  planMindmapDrop,
  type DropBox,
  type MindmapDropPlan,
} from "./features/mindmap/mindmap-drop-plan";
import { navigateMindmap, planMindmapKeyboardMove, type ArrowKey } from "./features/mindmap/mindmap-keyboard";
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

const ARROWS = new Set<string>(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const indexOfId = (id: string | null | undefined) => Number(id?.replace(/^mindmap-/, "")) || 0;

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
  /** Drag and keyboard moves, in the terms of the move operation. */
  onMove(nodeId: string, parentId?: string, beforeId?: string, side?: "left" | "right"): void;
  onAddChild(id: string): void;
  onAddSibling(id: string): void;
  onDelete(id: string): void;
  /** Enter on the selected node: move the focus to its label field. */
  onEditLabel(id: string): void;
}

/** The rendered mindmap with zoom and fit; nodes can be selected, dragged and moved with the keyboard. */
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
  onMove,
  onAddChild,
  onAddSibling,
  onDelete,
  onEditLabel,
}: Props) {
  const navigation = useDiagramNavigation(zoom, onZoomChange, { svg, initialFit });
  const root = useRef<HTMLDivElement>(null);
  const hitTargets = useRef(new Map<string, TreeNodeHitTarget>());
  // The focused node's label and position before the SVG is replaced, to focus it again afterwards.
  const focusBeforeRender = useRef<{ label: string; index: number } | undefined>(undefined);
  const suppressDragClick = useRef(false);
  const drag = useRef<{ id: string; pointerId: number; x: number; y: number; active: boolean } | undefined>(undefined);
  const dropPlan = useRef<MindmapDropPlan | undefined>(undefined);
  const dropTarget = useRef<SVGTextElement[]>([]);
  const [dragPreview, setDragPreview] = useState<{
    label: string;
    x: number;
    y: number;
    plan?: MindmapDropPlan;
  }>();
  const hitOptions = useMemo<TreeNodeHitTargetOptions>(
    () => ({ ...MINDMAP_HIT_TARGET_OPTIONS, order: () => mindmapRenderOrder(document) }),
    [document],
  );
  useLayoutEffect(() => {
    const host = root.current;
    if (!host || !svg) return;
    const active = globalThis.document.activeElement;
    const owner = active && host.contains(active) ? active.closest("[aria-label]") : undefined;
    focusBeforeRender.current = owner
      ? {
          label: owner.getAttribute("aria-label") ?? "",
          index: indexOfId(owner.getAttribute("data-mindmap-node-id")),
        }
      : undefined;
    host.innerHTML = svg;
  }, [svg]);
  useTreeNodeHitTargets(root, document.nodes, hitOptions, hitTargets, [document, svg]);
  useLayoutEffect(() => {
    const host = root.current;
    const previous = focusBeforeRender.current;
    if (!host || !previous) return;
    focusBeforeRender.current = undefined;
    // Labels can repeat, so of the nodes with this label take the one nearest to where the node was.
    const candidates = [...host.querySelectorAll<SVGElement>("text[aria-label]")].filter(
      (item) => item.getAttribute("aria-label") === previous.label,
    );
    candidates
      .sort(
        (left, right) =>
          Math.abs(indexOfId(left.getAttribute("data-mindmap-node-id")) - previous.index) -
          Math.abs(indexOfId(right.getAttribute("data-mindmap-node-id")) - previous.index),
      )[0]
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

  const nodeBoxes = useCallback(() => {
    const boxes = new Map<string, DropBox>();
    for (const [id, target] of hitTargets.current) {
      const rects = target.texts.map((text) => text.getBoundingClientRect());
      boxes.set(id, {
        left: Math.min(...rects.map((rect) => rect.left)),
        top: Math.min(...rects.map((rect) => rect.top)),
        right: Math.max(...rects.map((rect) => rect.right)),
        bottom: Math.max(...rects.map((rect) => rect.bottom)),
      });
    }
    return boxes;
  }, []);
  const planDrop = useCallback(
    (sourceId: string, x: number, y: number, forceBefore: boolean) => {
      // The drop zone beside the root is the whole visible pane, not just the drawing: a diagram whose
      // branches all grow to the right has no picture to the root's left, but the pane still does.
      const canvas = root.current?.closest(".preview-viewport")?.getBoundingClientRect();
      return planMindmapDrop({
        document,
        sourceId,
        point: { x, y },
        boxes: nodeBoxes(),
        canvas: canvas && { left: canvas.left, top: canvas.top, right: canvas.right, bottom: canvas.bottom },
        forceBefore,
      });
    },
    [document, nodeBoxes],
  );
  const clearDropTarget = () => {
    dropTarget.current.forEach((text) => text.classList.remove("mindmap-drop-target"));
    dropTarget.current = [];
  };
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) return;
      current.active = true;
      event.preventDefault();
      clearDropTarget();
      const plan = planDrop(current.id, event.clientX, event.clientY, event.shiftKey);
      dropPlan.current = plan;
      setDragPreview({
        label: document.nodes.find((item) => item.id === current.id)?.label ?? "Mindmap node",
        x: event.clientX + 16,
        y: event.clientY + 16,
        ...(plan ? { plan } : {}),
      });
      const over = mindmapNodeAt(document, nodeBoxes(), event.clientX, event.clientY);
      if (over && over.id !== current.id) {
        dropTarget.current = hitTargets.current.get(over.id)?.texts ?? [];
        dropTarget.current.forEach((text) => text.classList.add("mindmap-drop-target"));
      }
    };
    const end = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      drag.current = undefined;
      setDragPreview(undefined);
      const plan = dropPlan.current;
      dropPlan.current = undefined;
      clearDropTarget();
      if (!current.active) return;
      suppressDragClick.current = true;
      if (plan) onMove(current.id, plan.parentId, plan.beforeId, plan.side);
    };
    const cancel = () => {
      drag.current = undefined;
      dropPlan.current = undefined;
      setDragPreview(undefined);
      clearDropTarget();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current?.active) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("keydown", escape, true);
    };
  }, [document, nodeBoxes, onMove, planDrop]);

  const focusNode = (id: string | undefined) => {
    const text = id ? hitTargets.current.get(id)?.text : undefined;
    text?.focus();
    return Boolean(text);
  };
  const keyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const element = (event.target as Element).closest<SVGElement>("[data-mindmap-node-id]");
    const id = element?.dataset.mindmapNodeId;
    if (!id) return;
    const node = document.nodes.find((item) => item.id === id);
    if (!node) return;
    if (event.key === "F2" && onInlineRename?.(id, event.target as Element)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (ARROWS.has(event.key) && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if (event.altKey) {
        const plan = planMindmapKeyboardMove(document, id, event.key as ArrowKey);
        if (!plan) return;
        event.preventDefault();
        onMove(plan.nodeId, plan.parentId, plan.beforeId, plan.side);
        return;
      }
      const target = navigateMindmap(document, id, event.key as ArrowKey);
      if (target && focusNode(target)) event.preventDefault();
      return;
    }
    if (event.key === "Enter" && event.shiftKey && node.depth > 1) {
      event.preventDefault();
      onAddSibling(id);
      return;
    }
    // Tab stays free for moving focus, so a child is added with Alt+Enter or Insert.
    if ((event.key === "Enter" && event.altKey) || event.key === "Insert") {
      event.preventDefault();
      onAddChild(id);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDelete(id);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      // The first Enter selects the node; Enter on the selected node edits its label.
      if (event.key === "Enter" && selectedId === id) onEditLabel(id);
      else onSelect(id);
    }
  };
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
              if (suppressDragClick.current) {
                suppressDragClick.current = false;
                return;
              }
              const id = nodeIdAt(event);
              if (id) onSelect(id);
            }}
            onPointerDown={(event) => {
              suppressDragClick.current = false;
              if (event.button !== 0) return;
              const id = nodeIdAt(event);
              if (id) {
                event.preventDefault();
                drag.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false };
              } else onSelect(undefined);
            }}
            onKeyDown={keyboard}
          />
        )}
      </div>
      {dragPreview && (
        <>
          {dragPreview.plan && (
            <div
              className={`mindmap-placement-preview mindmap-placement-${dragPreview.plan.placement.mode}`}
              style={dragPreview.plan.placement}
            />
          )}
          <div
            className="mindmap-drag-preview"
            style={{ left: dragPreview.x, top: dragPreview.y }}
            role="status"
            aria-live="polite"
          >
            <strong>{dragPreview.label}</strong>
            <span>{dragPreview.plan?.destination ?? "Choose a destination"}</span>
          </div>
        </>
      )}
      <p className="preview-hint">
        Drop above or below a node to reorder, in the middle to nest, beside the root to change side · arrows move
        around, Alt+arrows move the node
      </p>
      <PreviewRenderNotice
        status={renderStatus}
        error={renderError}
        hasPreview={Boolean(svg)}
        onRetry={onRenderRetry}
      />
    </section>
  );
}
