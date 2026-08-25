import { useLayoutEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import type { UseCaseDocument } from "@plantuml-studio/diagram-usecase";
import type { RenderStatus } from "./model";

export function UseCaseDiagramPreview({
  svg,
  zoom,
  onZoomChange,
  renderStatus,
  renderError,
  onRenderRetry,
  document,
  selectedId,
  onSelect,
  onBackgroundSelect,
  onRelationshipCreate,
  onRelationshipReconnect,
  onMoveToPackage,
  onReorder,
}: {
  svg?: string | undefined;
  zoom: number;
  onZoomChange(zoom: number): void;
  renderStatus: RenderStatus;
  renderError?: string | undefined;
  onRenderRetry(): void;
  document: UseCaseDocument;
  selectedId?: string | undefined;
  onSelect(id: string): void;
  onBackgroundSelect(): void;
  onRelationshipCreate(fromId: string, toId: string): void;
  onRelationshipReconnect(relationshipId: string, endpoint: "from" | "to", targetId: string): void;
  onMoveToPackage(elementId: string, packageId: string): void;
  onReorder(elementId: string, targetId: string, placement: "before" | "after"): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | {
        kind: "connect" | "move" | "reconnect";
        id: string;
        endpoint?: "from" | "to";
        x: number;
        y: number;
        preview?: SVGLineElement;
      }
    | undefined
  >(undefined);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    const host = root.current;
    const rendered = host?.querySelector<SVGSVGElement>("svg");
    if (!host || !rendered) return;
    rendered
      .querySelectorAll(
        ".usecase-semantic-hit, .usecase-selected-object, .usecase-connection-handle, .usecase-move-handle, .usecase-relationship-hit, .usecase-relationship-endpoint, .usecase-connection-preview",
      )
      .forEach((item) => item.remove());
    const objects = [...document.elements, ...document.packages, ...document.notes, ...document.relationships];
    const renderedEntityIds = new Map<string, string>();
    for (const text of rendered.querySelectorAll<SVGTextElement>("text")) {
      const content = text.textContent?.trim() ?? "";
      const object = objects.find((item) => {
        if ("text" in item)
          return content === item.text || item.text.split("\n").some((line) => content === line.trim());
        return "label" in item && (content === item.label || ("alias" in item && content === item.alias));
      });
      if (!object) continue;
      const renderedEntityId = text.closest<SVGGElement>("g.entity")?.id;
      if (renderedEntityId && "kind" in object && (object.kind === "actor" || object.kind === "usecase"))
        renderedEntityIds.set(renderedEntityId, object.id);
      const box = text.getBBox();
      const hit = window.document.createElementNS("http://www.w3.org/2000/svg", "rect");
      hit.setAttribute("class", `usecase-semantic-hit${object.id === selectedId ? " usecase-selected-object" : ""}`);
      hit.setAttribute("data-usecase-object-id", object.id);
      hit.setAttribute("data-usecase-object-type", "text" in object ? "note" : object.kind);
      hit.setAttribute("x", String(box.x - 8));
      hit.setAttribute("y", String(box.y - 6));
      hit.setAttribute("width", String(Math.max(24, box.width + 16)));
      hit.setAttribute("height", String(Math.max(22, box.height + 12)));
      hit.setAttribute("rx", "8");
      hit.setAttribute("tabindex", "0");
      hit.setAttribute("role", "button");
      const objectKind = "kind" in object ? object.kind : "note";
      const objectLabel = "label" in object ? object.label : "text" in object ? object.text : "relationship";
      hit.setAttribute("aria-label", `Select ${objectKind} ${objectLabel}`);
      rendered.append(hit);
      if ("kind" in object && (object.kind === "actor" || object.kind === "usecase")) {
        const handle = window.document.createElementNS("http://www.w3.org/2000/svg", "circle");
        handle.setAttribute("class", "usecase-connection-handle");
        handle.setAttribute("data-usecase-connect-from", object.id);
        handle.setAttribute("cx", String(box.x + box.width + 13));
        handle.setAttribute("cy", String(box.y + box.height / 2));
        handle.setAttribute("r", "5");
        handle.setAttribute("role", "button");
        handle.setAttribute("aria-label", `Drag to connect ${object.label}`);
        rendered.append(handle);
        const moveHandle = window.document.createElementNS("http://www.w3.org/2000/svg", "rect");
        moveHandle.setAttribute("class", "usecase-move-handle");
        moveHandle.setAttribute("data-usecase-move-id", object.id);
        moveHandle.setAttribute("x", String(box.x - 16));
        moveHandle.setAttribute("y", String(box.y + box.height / 2 - 5));
        moveHandle.setAttribute("width", "10");
        moveHandle.setAttribute("height", "10");
        moveHandle.setAttribute("rx", "2");
        moveHandle.setAttribute("role", "button");
        moveHandle.setAttribute("aria-label", `Drag to move ${object.label}`);
        rendered.append(moveHandle);
      }
    }
    for (const group of rendered.querySelectorAll<SVGGElement>("g[data-entity-1][data-entity-2]")) {
      const firstId = group.getAttribute("data-entity-1") ?? "";
      const secondId = group.getAttribute("data-entity-2") ?? "";
      const first = renderedEntityIds.get(firstId) ?? normalizeRenderedId(firstId);
      const second = renderedEntityIds.get(secondId) ?? normalizeRenderedId(secondId);
      const relationship = document.relationships.find(
        (item) => (item.from === first && item.to === second) || (item.from === second && item.to === first),
      );
      if (!relationship) continue;
      const relationshipPaths = [...group.querySelectorAll<SVGPathElement>("path")];
      for (const path of relationshipPaths) {
        const hit = path.cloneNode(false) as SVGPathElement;
        hit.removeAttribute("fill");
        hit.setAttribute(
          "class",
          `usecase-relationship-hit${relationship.id === selectedId ? " usecase-selected-object" : ""}`,
        );
        hit.setAttribute("data-usecase-object-id", relationship.id);
        hit.setAttribute("data-usecase-object-type", "relationship");
        hit.setAttribute("role", "button");
        hit.setAttribute("aria-label", `Select ${relationship.kind} relationship`);
        hit.addEventListener("click", (event) => {
          event.stopPropagation();
          onSelect(relationship.id);
        });
        group.append(hit);
      }
      const path = relationshipPaths[0];
      if (path && relationship.id === selectedId) {
        const firstIsFrom = first === relationship.from;
        const length = path.getTotalLength();
        const start = path.getPointAtLength(0);
        const end = path.getPointAtLength(length);
        addRelationshipEndpoint(rendered, start, relationship.id, firstIsFrom ? "from" : "to");
        addRelationshipEndpoint(rendered, end, relationship.id, firstIsFrom ? "to" : "from");
      }
    }
  }, [document, onSelect, selectedId, svg]);

  const select = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const target =
      event.target instanceof Element ? event.target.closest<SVGElement>("[data-usecase-object-id]") : null;
    const id = target?.getAttribute("data-usecase-object-id");
    if (id) onSelect(id);
    else onBackgroundSelect();
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : undefined;
    const connection = target
      ?.closest<SVGElement>("[data-usecase-connect-from]")
      ?.getAttribute("data-usecase-connect-from");
    const moveHandle = target?.closest<SVGElement>("[data-usecase-move-id]")?.getAttribute("data-usecase-move-id");
    const reconnectHandle = target?.closest<SVGElement>("[data-usecase-relationship-endpoint]");
    const reconnectId = reconnectHandle?.getAttribute("data-usecase-relationship-id");
    const endpoint = reconnectHandle?.getAttribute("data-usecase-relationship-endpoint") as "from" | "to" | null;
    const hit = target?.closest<SVGElement>("[data-usecase-object-id]");
    const id = reconnectId ?? connection ?? moveHandle ?? hit?.getAttribute("data-usecase-object-id");
    const type = hit?.getAttribute("data-usecase-object-type");
    if (!id || (!reconnectId && !connection && !moveHandle && type !== "actor" && type !== "usecase")) return;
    const kind = reconnectId ? "reconnect" : connection ? "connect" : "move";
    const preview =
      kind === "connect" || kind === "reconnect" ? createConnectionPreview(target as SVGGraphicsElement) : undefined;
    drag.current = {
      kind,
      id,
      ...(endpoint ? { endpoint } : {}),
      x: event.clientX,
      y: event.clientY,
      ...(preview ? { preview } : {}),
    };
    if (kind !== "move")
      root.current
        ?.querySelectorAll<SVGElement>(
          '.usecase-semantic-hit[data-usecase-object-type="actor"], .usecase-semantic-hit[data-usecase-object-type="usecase"]',
        )
        .forEach((item) => item.classList.add("usecase-valid-drop"));
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const updateDrag = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active?.preview) return;
    const point = clientPointInSvg(active.preview.ownerSVGElement, event.clientX, event.clientY);
    if (!point) return;
    active.preview.setAttribute("x2", String(point.x));
    active.preview.setAttribute("y2", String(point.y));
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active) return;
    drag.current = undefined;
    active.preview?.remove();
    root.current
      ?.querySelectorAll(".usecase-valid-drop")
      .forEach((item) => item.classList.remove("usecase-valid-drop"));
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const moved = Math.hypot(event.clientX - active.x, event.clientY - active.y) > 5;
    if (!moved) {
      suppressNextClick();
      onSelect(active.id);
      return;
    }
    suppressNextClick();
    const preferredTypes =
      active.kind === "connect" || active.kind === "reconnect" ? ["actor", "usecase"] : ["package", "rectangle"];
    const preferredTarget = semanticTargetAt(root.current, event.clientX, event.clientY, preferredTypes);
    const peerTarget =
      active.kind === "move"
        ? semanticTargetAt(root.current, event.clientX, event.clientY, ["actor", "usecase"])
        : undefined;
    const target =
      preferredTarget ??
      peerTarget ??
      window.document.elementFromPoint(event.clientX, event.clientY)?.closest<SVGElement>("[data-usecase-object-id]");
    const targetId = target?.getAttribute("data-usecase-object-id");
    const targetType = target?.getAttribute("data-usecase-object-type");
    if (!target || !targetId || targetId === active.id) return;
    if (active.kind === "connect" && (targetType === "actor" || targetType === "usecase"))
      onRelationshipCreate(active.id, targetId);
    if (active.kind === "reconnect" && active.endpoint && (targetType === "actor" || targetType === "usecase"))
      onRelationshipReconnect(active.id, active.endpoint, targetId);
    if (active.kind === "move" && (targetType === "package" || targetType === "rectangle"))
      onMoveToPackage(active.id, targetId);
    if (active.kind === "move" && (targetType === "actor" || targetType === "usecase")) {
      const box = target.getBoundingClientRect();
      onReorder(active.id, targetId, event.clientY < box.top + box.height / 2 ? "before" : "after");
    }
  };

  const suppressNextClick = () => {
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };

  return (
    <section className="preview" aria-label="Use Case diagram preview">
      <div className="preview-tools">
        <button onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))} aria-label="Zoom out">
          −
        </button>
        <button onClick={() => onZoomChange(1)} aria-label="Reset zoom">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => onZoomChange(Math.min(3, zoom + 0.1))} aria-label="Zoom in">
          +
        </button>
        <span className="usecase-beta-label">Beta</span>
      </div>
      <div className={`preview-viewport${renderStatus !== "idle" && svg ? " stale-preview" : ""}`}>
        {svg ? (
          <div
            ref={root}
            className="diagram usecase-diagram"
            style={{ transform: `scale(${zoom})` }}
            onClick={select}
            onPointerDown={startDrag}
            onPointerMove={updateDrag}
            onPointerUp={finishDrag}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : renderError ? (
          <div className="render-error" role="alert">
            <strong>Could not render this Use Case diagram.</strong>
            <p>{renderError}</p>
            <button onClick={onRenderRetry}>Retry</button>
          </div>
        ) : (
          <div className="render-placeholder">
            {renderStatus === "rendering"
              ? "Rendering Use Case diagram…"
              : "Enter Use Case source to render a preview."}
          </div>
        )}
      </div>
    </section>
  );
}

const normalizeRenderedId = (value: string) =>
  value
    .trim()
    .replace(/^[:(]|[:)]$/g, "")
    .replace(/^"|"$/g, "")
    .toLowerCase();

function semanticTargetAt(root: HTMLDivElement | null, x: number, y: number, types: string[]) {
  return [...(root?.querySelectorAll<SVGElement>(".usecase-semantic-hit[data-usecase-object-id]") ?? [])]
    .filter((item) => types.includes(item.getAttribute("data-usecase-object-type") ?? ""))
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

function addRelationshipEndpoint(svg: SVGSVGElement, point: DOMPoint, relationshipId: string, endpoint: "from" | "to") {
  const handle = window.document.createElementNS("http://www.w3.org/2000/svg", "circle");
  handle.setAttribute("class", "usecase-relationship-endpoint");
  handle.setAttribute("data-usecase-relationship-id", relationshipId);
  handle.setAttribute("data-usecase-relationship-endpoint", endpoint);
  handle.setAttribute("cx", String(point.x));
  handle.setAttribute("cy", String(point.y));
  handle.setAttribute("r", "9");
  handle.setAttribute("fill", "#ffffff");
  handle.setAttribute("stroke", "#2563eb");
  handle.setAttribute("stroke-width", "3");
  handle.setAttribute("pointer-events", "all");
  handle.setAttribute("role", "button");
  handle.setAttribute("aria-label", `Drag ${endpoint} endpoint to reconnect relationship`);
  svg.append(handle);
}

function createConnectionPreview(handle: SVGGraphicsElement) {
  const svg = handle.ownerSVGElement;
  const matrix = handle.getCTM();
  if (!svg || !matrix) return undefined;
  const local = svg.createSVGPoint();
  const box = handle.getBBox();
  local.x = box.x + box.width / 2;
  local.y = box.y + box.height / 2;
  const fixed = local.matrixTransform(matrix);
  const line = window.document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("class", "usecase-connection-preview");
  line.setAttribute("x1", String(fixed.x));
  line.setAttribute("y1", String(fixed.y));
  line.setAttribute("x2", String(fixed.x));
  line.setAttribute("y2", String(fixed.y));
  svg.append(line);
  return line;
}

function clientPointInSvg(svg: SVGSVGElement | null, clientX: number, clientY: number) {
  const matrix = svg?.getScreenCTM();
  if (!svg || !matrix) return undefined;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(matrix.inverse());
}
