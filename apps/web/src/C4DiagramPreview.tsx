import { PreviewRenderNotice } from "./render/PreviewRenderNotice";
import { preserveDiagramLinkHitAreas } from "./render/link-hit-areas";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import type { C4Document } from "./c4-source";
import type { RenderStatus } from "./model";
import { useDiagramNavigation, type InitialDiagramFit } from "./useDiagramNavigation";
import { MAX_DIAGRAM_ZOOM, MIN_DIAGRAM_ZOOM } from "./diagram-zoom";
import { buildC4Canvas, type C4Canvas, type C4CanvasShape } from "./features/c4/c4-canvas";
import { type C4Selection } from "./features/c4/c4-forms";

const SVG_NS = "http://www.w3.org/2000/svg";

interface Props {
  svg?: string | undefined;
  initialFit?: InitialDiagramFit | undefined;
  zoom: number;
  onZoomChange(zoom: number): void;
  renderStatus: RenderStatus;
  renderError?: string | undefined;
  onRenderRetry(): void;
  document: C4Document;
  /** The shape to draw as selected: its `data-c4-object-id`. */
  selectedKey?: string | undefined;
  /** False while the picture shows an older source than the editor: nothing can be selected or dragged then. */
  editingEnabled: boolean;
  onInlineRename?: ((key: string, anchor: Element) => boolean) | undefined;
  onSelect(selection: C4Selection): void;
  onBackgroundSelect?(): void;
  onDelete?(selection: C4Selection): void;
  onRelationshipCreate(from: string, to: string): void;
  onRelationshipReconnect(index: number, endpoint: "from" | "to", alias: string): void;
  /** Moves an element into a boundary, or out to the top level when `parent` is missing. */
  onMove(alias: string, parent: string | undefined): void;
}

type Drag = {
  kind: "connect" | "move" | "reconnect";
  key: string;
  endpoint?: "from" | "to";
  x: number;
  y: number;
  preview?: SVGLineElement;
};

/**
 * The rendered C4 diagram with zoom and fit, and the same editing gestures as the other types: select by click
 * or keyboard, drag between elements to connect, drag an end of a selected relationship to reconnect it, drag
 * the square handle of an element into or out of a boundary, and rename on the canvas. The shapes are found by
 * the aliases the engine writes into its SVG, not by their text (see `features/c4/c4-canvas.ts`).
 */
export function C4DiagramPreview({
  initialFit,
  svg,
  zoom,
  onZoomChange,
  renderStatus,
  renderError,
  onRenderRetry,
  document,
  selectedKey,
  editingEnabled,
  onInlineRename,
  onSelect,
  onBackgroundSelect,
  onDelete,
  onRelationshipCreate,
  onRelationshipReconnect,
  onMove,
}: Props) {
  const navigation = useDiagramNavigation(zoom, onZoomChange, { svg, initialFit });
  const svgMarkup = useMemo(() => ({ __html: svg ?? "" }), [svg]);
  const root = useRef<HTMLDivElement>(null);
  // The lookup from drawn shapes to source items depends on the picture and the source only, so it is built
  // once per render and reused while the selection changes.
  const canvas = useRef<{ svg: string | undefined; document: C4Document; model: C4Canvas } | undefined>(undefined);
  const drag = useRef<Drag | undefined>(undefined);
  const suppressClick = useRef(false);
  const cancelledDragClick = useRef(false);
  const [keyboardConnectFrom, setKeyboardConnectFrom] = useState<string>();

  const shapeOf = (key: string | null | undefined): C4CanvasShape | undefined =>
    key ? canvas.current?.model.byKey.get(key) : undefined;

  useLayoutEffect(() => {
    const host = root.current;
    const rendered = host?.querySelector<SVGSVGElement>("svg");
    if (!host || !rendered) return;
    // The hit areas are drawn again on every change; keep the keyboard where it was.
    const focused = window.document.activeElement;
    const focusedKey = focused && host.contains(focused) ? focused.getAttribute("data-c4-object-id") : null;
    rendered
      .querySelectorAll(
        ".c4-semantic-hit, .c4-connection-handle, .c4-move-handle, .c4-relationship-hit, .c4-relationship-endpoint, .c4-connection-preview, .c4-boundary-frame",
      )
      .forEach((item) => item.remove());
    if (!editingEnabled) return;
    if (!canvas.current || canvas.current.svg !== svg || canvas.current.document !== document)
      canvas.current = { svg, document, model: buildC4Canvas(rendered, document) };
    const model = canvas.current.model;
    // Boundaries first, so that the elements inside them are drawn (and hit) on top.
    const ordered = [...model.shapes].sort((a, b) => Number(b.kind === "boundary") - Number(a.kind === "boundary"));
    for (const shape of ordered) {
      const selected = shape.key === selectedKey;
      if (shape.kind === "relationship") {
        decorateLink(rendered, shape, selected, model, document);
        continue;
      }
      const box = shape.kind === "boundary" ? titleBox(shape.group) : safeBox(shape.group);
      if (!box) continue;
      if (shape.kind === "boundary") {
        const frame = shape.group.querySelector<SVGRectElement>(":scope > rect");
        if (frame) {
          const outline = frame.cloneNode(false) as SVGRectElement;
          outline.setAttribute("class", `c4-boundary-frame${selected ? " c4-selected-object" : ""}`);
          outline.setAttribute("aria-hidden", "true");
          if (shape.editable) outline.setAttribute("data-c4-drop-id", shape.key);
          shape.group.append(outline);
        }
      }
      const hit = window.document.createElementNS(SVG_NS, "rect");
      hit.setAttribute("class", `c4-semantic-hit${selected && shape.kind === "element" ? " c4-selected-object" : ""}`);
      hit.setAttribute("data-c4-object-id", shape.key);
      hit.setAttribute("data-c4-object-type", shape.kind);
      hit.setAttribute("data-c4-editable", String(shape.editable));
      hit.setAttribute("x", String(box.x - (shape.kind === "boundary" ? 8 : 0)));
      hit.setAttribute("y", String(box.y - (shape.kind === "boundary" ? 6 : 0)));
      hit.setAttribute("width", String(Math.max(24, box.width + (shape.kind === "boundary" ? 16 : 0))));
      hit.setAttribute("height", String(Math.max(22, box.height + (shape.kind === "boundary" ? 12 : 0))));
      hit.setAttribute("rx", "8");
      hit.setAttribute("tabindex", "0");
      hit.setAttribute("role", "button");
      hit.setAttribute("aria-label", `Select ${shape.title}`);
      if (keyboardConnectFrom && shape.editable && shape.kind === "element" && shape.key !== keyboardConnectFrom)
        hit.classList.add("c4-valid-drop");
      rendered.append(hit);
      if (!shape.editable) continue;
      if (shape.kind === "element") {
        const handle = window.document.createElementNS(SVG_NS, "circle");
        handle.setAttribute("class", "c4-connection-handle");
        handle.setAttribute("data-c4-connect-from", shape.key);
        handle.setAttribute("cx", String(box.x + box.width + 13));
        handle.setAttribute("cy", String(box.y + box.height / 2));
        handle.setAttribute("r", "8");
        handle.setAttribute("role", "button");
        handle.setAttribute("aria-label", `Drag to connect ${shape.title}`);
        rendered.append(handle);
      }
      const moveHandle = window.document.createElementNS(SVG_NS, "rect");
      moveHandle.setAttribute("class", "c4-move-handle");
      moveHandle.setAttribute("data-c4-move-id", shape.key);
      moveHandle.setAttribute("x", String(box.x - 16));
      moveHandle.setAttribute("y", String(box.y + box.height / 2 - 5));
      moveHandle.setAttribute("width", "10");
      moveHandle.setAttribute("height", "10");
      moveHandle.setAttribute("rx", "2");
      moveHandle.setAttribute("role", "button");
      moveHandle.setAttribute("aria-label", `Drag to move ${shape.title} into or out of a boundary`);
      rendered.append(moveHandle);
    }
    preserveDiagramLinkHitAreas(host, ".c4-semantic-hit");
    if (focusedKey)
      rendered
        .querySelector<SVGElement>(`.c4-semantic-hit[data-c4-object-id="${CSS.escape(focusedKey)}"]`)
        ?.focus({ preventScroll: true });
  }, [document, editingEnabled, keyboardConnectFrom, selectedKey, svg]);

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (!drag.current && !keyboardConnectFrom)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (drag.current) cancelActiveDrag();
      setKeyboardConnectFrom(undefined);
    };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  });

  const keyOf = (target: EventTarget | null) =>
    target instanceof Element
      ? target.closest<SVGElement>("[data-c4-object-id]")?.getAttribute("data-c4-object-id")
      : undefined;

  const select = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current || cancelledDragClick.current) {
      suppressClick.current = false;
      cancelledDragClick.current = false;
      event.stopPropagation();
      return;
    }
    const shape = shapeOf(keyOf(event.target));
    if (shape) onSelect(shape.selection);
    else onBackgroundSelect?.();
  };

  const keyboardSelect = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const key = keyOf(event.target);
    const shape = shapeOf(key);
    if (!key || !shape) return;
    if (event.key === "F2" && shape.editable && shape.alias && onInlineRename?.(shape.alias, event.target as Element)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const connectable = shape.kind === "element" && shape.editable;
    if (event.key.toLowerCase() === "c" && connectable && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      setKeyboardConnectFrom(key);
      onSelect(shape.selection);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && shape.editable) {
      event.preventDefault();
      event.stopPropagation();
      onDelete?.(shape.selection);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (keyboardConnectFrom && connectable && keyboardConnectFrom !== key) {
        const from = shapeOf(keyboardConnectFrom)?.alias;
        if (from && shape.alias) onRelationshipCreate(from, shape.alias);
        setKeyboardConnectFrom(undefined);
        return;
      }
      onSelect(shape.selection);
    }
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !editingEnabled) return;
    const target = event.target instanceof Element ? event.target : undefined;
    const endpointHandle = target?.closest<SVGElement>("[data-c4-relationship-endpoint]");
    const connect = target?.closest<SVGElement>("[data-c4-connect-from]")?.getAttribute("data-c4-connect-from");
    const move = target?.closest<SVGElement>("[data-c4-move-id]")?.getAttribute("data-c4-move-id");
    const hit = target?.closest<SVGElement>(".c4-semantic-hit");
    const hitShape = shapeOf(hit?.getAttribute("data-c4-object-id"));
    const reconnect = endpointHandle?.getAttribute("data-c4-relationship-id");
    const key =
      reconnect ?? connect ?? move ?? (hitShape?.kind === "element" && hitShape.editable ? hitShape.key : undefined);
    if (!key) return;
    event.stopPropagation();
    const kind = reconnect ? "reconnect" : move ? "move" : "connect";
    const start = kind === "connect" ? (hit ?? target) : target;
    const preview = kind !== "move" && start ? createConnectionPreview(start as SVGGraphicsElement) : undefined;
    drag.current = {
      kind,
      key,
      ...(endpointHandle
        ? { endpoint: endpointHandle.getAttribute("data-c4-relationship-endpoint") as "from" | "to" }
        : {}),
      x: event.clientX,
      y: event.clientY,
      ...(preview ? { preview } : {}),
    };
    root.current?.classList.toggle("c4-dragging-move", kind === "move");
    root.current?.classList.toggle("c4-dragging-connection", kind !== "move");
    if (kind !== "move") for (const item of connectableHits(root.current)) item.classList.add("c4-valid-drop");
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const updateDrag = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active?.preview) return;
    const target = hitAt(root.current, event.clientX, event.clientY, connectableHits(root.current));
    const point = target
      ? elementCenterInSvg(target, active.preview.ownerSVGElement)
      : clientPointInSvg(active.preview.ownerSVGElement, event.clientX, event.clientY);
    if (!point) return;
    active.preview.setAttribute("x2", String(point.x));
    active.preview.setAttribute("y2", String(point.y));
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active) return;
    drag.current = undefined;
    active.preview?.remove();
    clearDragPresentation();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    suppressNextClick();
    const moved = Math.hypot(event.clientX - active.x, event.clientY - active.y) > 5;
    const dragged = shapeOf(active.key);
    if (!moved) {
      if (dragged) onSelect(dragged.selection);
      return;
    }
    if (active.kind === "move") {
      if (!dragged?.alias) return;
      const frames = [
        ...(root.current?.querySelectorAll<SVGElement>(".c4-boundary-frame[data-c4-drop-id]") ?? []),
      ].filter((item) => item.getAttribute("data-c4-drop-id") !== active.key);
      const frame = hitAt(root.current, event.clientX, event.clientY, frames);
      const parent = frame?.getAttribute("data-c4-drop-id") ?? undefined;
      const current = document.elements.find((item) => item.id === dragged.alias)?.parent;
      if (parent === current) return;
      // Dropping on empty canvas takes an element out of its boundary; nothing happens for one that is not in any.
      if (!parent && !current) return;
      onMove(dragged.alias, parent);
      return;
    }
    const target = hitAt(root.current, event.clientX, event.clientY, connectableHits(root.current));
    const alias = shapeOf(target?.getAttribute("data-c4-object-id"))?.alias;
    if (!alias) return;
    if (active.kind === "connect") {
      if (dragged?.alias && dragged.alias !== alias) onRelationshipCreate(dragged.alias, alias);
      return;
    }
    const index = dragged?.index;
    if (active.kind === "reconnect" && active.endpoint && index !== undefined)
      onRelationshipReconnect(index, active.endpoint, alias);
  };

  const cancelActiveDrag = () => {
    drag.current?.preview?.remove();
    drag.current = undefined;
    clearDragPresentation();
    cancelledDragClick.current = true;
  };

  const cancelPointerDrag = () => {
    cancelActiveDrag();
    cancelledDragClick.current = false;
    suppressNextClick();
  };

  const clearDragPresentation = () => {
    root.current?.classList.remove("c4-dragging-move", "c4-dragging-connection");
    root.current?.querySelectorAll(".c4-valid-drop").forEach((item) => item.classList.remove("c4-valid-drop"));
  };

  const suppressNextClick = () => {
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };

  const renameable = document.elements.some((item) => item.id === selectedKey && !item.scope);

  return (
    <section
      className="preview c4-preview"
      aria-label="C4 diagram preview"
      data-render-status={renderStatus}
      data-keyboard-connecting={Boolean(keyboardConnectFrom)}
    >
      <div className="preview-tools">
        {onInlineRename && (
          <button
            type="button"
            disabled={!editingEnabled || !renameable || renderStatus !== "idle"}
            title="Rename selected label (F2)"
            data-inspector-trigger
            onClick={() => {
              const target = root.current?.querySelector(`[data-c4-object-id="${CSS.escape(selectedKey ?? "")}"]`);
              if (selectedKey && target) onInlineRename(selectedKey, target);
            }}
          >
            Rename label
          </button>
        )}
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
        <span className="c4-keyboard-help" role="status" aria-live="polite">
          {keyboardConnectFrom
            ? "Choose a target and press Enter · Esc cancels"
            : "Drag between elements to connect · C for keyboard"}
        </span>
      </div>
      <div
        className={`preview-viewport${renderStatus !== "idle" && svg ? " stale-preview" : ""}`}
        ref={navigation.viewportRef}
        onPointerDown={navigation.onPointerDown}
        onAuxClick={navigation.onAuxClick}
      >
        {svg ? (
          <div
            ref={root}
            className="diagram c4-diagram"
            data-inspector-trigger
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
            onClick={select}
            onKeyDown={keyboardSelect}
            onPointerDown={startDrag}
            onPointerMove={updateDrag}
            onPointerUp={finishDrag}
            onPointerCancel={cancelPointerDrag}
            dangerouslySetInnerHTML={svgMarkup}
          />
        ) : renderError ? null : (
          <div className="render-placeholder">
            {renderStatus === "rendering" ? "Rendering C4 diagram…" : "Enter C4 source to render a preview."}
          </div>
        )}
      </div>
      <PreviewRenderNotice
        status={renderStatus}
        error={renderError}
        hasPreview={Boolean(svg)}
        onRetry={onRenderRetry}
      />
    </section>
  );
}

// -- Geometry -------------------------------------------------------------------------------------

function safeBox(element: SVGGraphicsElement | Element) {
  try {
    return (element as SVGGraphicsElement).getBBox();
  } catch {
    return undefined;
  }
}

/** The area of a boundary's own text (its label and type), which is what selects it. */
function titleBox(group: Element) {
  const texts = [...group.querySelectorAll<SVGTextElement>("text")];
  const boxes = texts.map((text) => safeBox(text)).filter((box): box is DOMRect => Boolean(box));
  if (!boxes.length) return safeBox(group);
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Link hit areas, and the end handles of the selected relationship. */
function decorateLink(
  rendered: SVGSVGElement,
  shape: C4CanvasShape,
  selected: boolean,
  model: C4Canvas,
  document: C4Document,
) {
  const paths = [...shape.group.querySelectorAll<SVGPathElement>("path")];
  for (const path of paths) {
    const hit = path.cloneNode(false) as SVGPathElement;
    hit.removeAttribute("fill");
    hit.setAttribute("class", `c4-relationship-hit${selected ? " c4-selected-object" : ""}`);
    hit.setAttribute("data-c4-object-id", shape.key);
    hit.setAttribute("data-c4-object-type", "relationship");
    hit.setAttribute("data-c4-editable", String(shape.editable));
    hit.setAttribute("tabindex", "0");
    hit.setAttribute("role", "button");
    hit.setAttribute("aria-label", `Select ${shape.title}`);
    shape.group.append(hit);
  }
  const path = paths[0];
  const relationship = shape.index === undefined ? undefined : document.relationships[shape.index];
  if (
    !selected ||
    !shape.editable ||
    !path ||
    !relationship ||
    !shape.ends ||
    typeof path.getTotalLength !== "function"
  )
    return;
  const first = model.byKey.get(shape.ends.first)?.group;
  const second = model.byKey.get(shape.ends.second)?.group;
  const start = path.getPointAtLength(0);
  const end = path.getPointAtLength(path.getTotalLength());
  // The end of the line that is nearest to an element is that element's end, whichever way the engine drew it.
  const startAlias = nearer(start, first, second) === first ? shape.ends.first : shape.ends.second;
  const endAlias = startAlias === shape.ends.first ? shape.ends.second : shape.ends.first;
  const role = (alias: string, fallback: "from" | "to") =>
    shape.ends!.first === shape.ends!.second ? fallback : alias === relationship.from ? "from" : "to";
  addRelationshipEndpoint(rendered, start, shape.key, role(startAlias, "from"));
  addRelationshipEndpoint(rendered, end, shape.key, role(endAlias, "to"));
}

function distanceToBox(point: DOMPoint, group: Element | undefined) {
  const box = group ? safeBox(group) : undefined;
  if (!box) return Number.POSITIVE_INFINITY;
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
  return Math.hypot(dx, dy);
}

const nearer = (point: DOMPoint, first: Element | undefined, second: Element | undefined) =>
  distanceToBox(point, first) <= distanceToBox(point, second) ? first : second;

function addRelationshipEndpoint(svg: SVGSVGElement, point: DOMPoint, key: string, endpoint: "from" | "to") {
  const handle = window.document.createElementNS(SVG_NS, "circle");
  handle.setAttribute("class", "c4-relationship-endpoint");
  handle.setAttribute("data-c4-relationship-id", key);
  handle.setAttribute("data-c4-relationship-endpoint", endpoint);
  handle.setAttribute("cx", String(point.x));
  handle.setAttribute("cy", String(point.y));
  handle.setAttribute("r", "9");
  handle.setAttribute("fill", "#ffffff");
  handle.setAttribute("stroke", "#2563eb");
  handle.setAttribute("stroke-width", "3");
  handle.setAttribute("pointer-events", "all");
  handle.setAttribute("role", "button");
  handle.setAttribute("aria-label", `Drag ${endpoint} end to reconnect relationship`);
  svg.append(handle);
}

/** The element hit areas that a relationship may be dragged to. */
function connectableHits(root: HTMLDivElement | null): SVGElement[] {
  return [
    ...(root?.querySelectorAll<SVGElement>(
      '.c4-semantic-hit[data-c4-object-type="element"][data-c4-editable="true"]',
    ) ?? []),
  ];
}

/** The smallest of the candidates that the pointer is over. */
function hitAt(root: HTMLDivElement | null, x: number, y: number, candidates: SVGElement[]): SVGElement | undefined {
  if (!root) return undefined;
  return candidates
    .filter((item) => {
      const box = item.getBoundingClientRect();
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    })
    .sort((a, b) => {
      const first = a.getBoundingClientRect();
      const second = b.getBoundingClientRect();
      return first.width * first.height - second.width * second.height;
    })[0];
}

function createConnectionPreview(handle: Element) {
  const svg = (handle as SVGGraphicsElement).ownerSVGElement;
  const fixed = elementCenterInSvg(handle, svg);
  if (!svg || !fixed) return undefined;
  const line = window.document.createElementNS(SVG_NS, "line");
  line.setAttribute("class", "c4-connection-preview");
  line.setAttribute("x1", String(fixed.x));
  line.setAttribute("y1", String(fixed.y));
  line.setAttribute("x2", String(fixed.x));
  line.setAttribute("y2", String(fixed.y));
  svg.append(line);
  return line;
}

function elementCenterInSvg(element: Element, svg: SVGSVGElement | null) {
  const box = element.getBoundingClientRect();
  return clientPointInSvg(svg, box.left + box.width / 2, box.top + box.height / 2);
}

function clientPointInSvg(svg: SVGSVGElement | null, clientX: number, clientY: number) {
  const matrix = svg?.getScreenCTM();
  if (!svg || !matrix) return undefined;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(matrix.inverse());
}
