import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WbsDocument } from "@plantuml-studio/diagram-wbs";
import type { RenderStatus } from "./model";
import { useDiagramNavigation } from "./useDiagramNavigation";

interface Props {
  svg: string | undefined;
  document: WbsDocument;
  selectedId: string | undefined;
  selectedRelationshipId: string | undefined;
  zoom: number;
  renderStatus: RenderStatus;
  renderError: string | undefined;
  onRenderRetry(): void;
  onZoomChange(value: number): void;
  onSelect(id?: string): void;
  onRelationshipSelect(id?: string): void;
  onMove(nodeId: string, parentId?: string, beforeId?: string): void;
  onRelationshipCreate(fromId: string, toId: string): void;
  onRelationshipReconnect(relationshipId: string, endpoint: "from" | "to", targetId: string): void;
}

export function WbsDiagramPreview({
  svg,
  document,
  selectedId,
  selectedRelationshipId,
  zoom,
  renderStatus,
  renderError,
  onRenderRetry,
  onZoomChange,
  onSelect,
  onRelationshipSelect,
  onMove,
  onRelationshipCreate,
  onRelationshipReconnect,
}: Props) {
  const navigation = useDiagramNavigation(zoom, onZoomChange);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | {
        id: string;
        kind: "move" | "connect" | "reconnect";
        endpoint?: "from" | "to";
        pointerId: number;
        x: number;
        y: number;
        active: boolean;
        line?: SVGLineElement;
      }
    | undefined
  >(undefined);
  const dropTarget = useRef<Element | undefined>(undefined);
  const [dragPreview, setDragPreview] = useState<{
    label: string;
    x: number;
    y: number;
    destination?: string;
  }>();
  const clearDropTarget = () => {
    dropTarget.current?.classList.remove("wbs-drop-target");
    dropTarget.current = undefined;
  };
  const nodeElementAt = (x: number, y: number) => {
    const nodes = [...(root.current?.querySelectorAll<SVGTextElement>("text[data-wbs-node-id]") ?? [])];
    let closest: SVGTextElement | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const node of nodes) {
      const bounds = node.getBoundingClientRect();
      const distance = Math.hypot(x - (bounds.left + bounds.width / 2), y - (bounds.top + bounds.height / 2));
      if (distance < closestDistance) {
        closest = node;
        closestDistance = distance;
      }
    }
    return closestDistance <= 80 ? closest : undefined;
  };
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    host
      .querySelectorAll(".wbs-node-hit, .wbs-connect-handle, .wbs-relationship-hit, .wbs-relationship-endpoint")
      .forEach((item) => item.remove());
    const texts = [...host.querySelectorAll<SVGTextElement>("svg text")];
    const claimed = new Set<SVGTextElement>();
    const renderedNodes = new Map<string, SVGTextElement>();
    for (const node of document.nodes) {
      const text = texts.find((candidate) => !claimed.has(candidate) && candidate.textContent?.trim() === node.label);
      if (!text) continue;
      claimed.add(text);
      renderedNodes.set(node.id, text);
      text.dataset.wbsNodeId = node.id;
      text.setAttribute("tabindex", "0");
      text.setAttribute("role", "button");
      text.setAttribute("aria-label", `Select WBS node ${node.label}`);
      text.classList.toggle("wbs-selected-node", node.id === selectedId);
      const bounds = text.getBBox();
      const hit = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "rect");
      hit.setAttribute("x", String(bounds.x - 12));
      hit.setAttribute("y", String(bounds.y - 8));
      hit.setAttribute("width", String(bounds.width + 24));
      hit.setAttribute("height", String(bounds.height + 16));
      hit.setAttribute("rx", "7");
      hit.setAttribute("class", "wbs-node-hit");
      hit.setAttribute("aria-hidden", "true");
      hit.dataset.wbsNodeId = node.id;
      text.parentNode?.insertBefore(hit, text);
      if (node.id === selectedId) {
        const handle = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "circle");
        handle.setAttribute("cx", String(bounds.x + bounds.width + 18));
        handle.setAttribute("cy", String(bounds.y + bounds.height / 2));
        handle.setAttribute("r", "8");
        handle.setAttribute("class", "wbs-connect-handle");
        handle.setAttribute("role", "button");
        handle.setAttribute("aria-label", `Drag to connect ${node.label}`);
        handle.dataset.wbsConnectFrom = node.id;
        text.ownerSVGElement?.append(handle);
      }
    }
    const svgRoot = host.querySelector<SVGSVGElement>("svg");
    const candidates = [...(svgRoot?.querySelectorAll<SVGGeometryElement>("line, path") ?? [])].filter(
      (element) => !element.classList.contains("wbs-connection-preview"),
    );
    const distanceToBox = (point: DOMPoint, box: DOMRect) =>
      Math.hypot(
        point.x < box.x ? box.x - point.x : point.x > box.x + box.width ? point.x - box.x - box.width : 0,
        point.y < box.y ? box.y - point.y : point.y > box.y + box.height ? point.y - box.y - box.height : 0,
      );
    const endpoints = (element: SVGGeometryElement) => {
      if (element instanceof SVGLineElement)
        return [
          new DOMPoint(element.x1.baseVal.value, element.y1.baseVal.value),
          new DOMPoint(element.x2.baseVal.value, element.y2.baseVal.value),
        ] as const;
      const length = element.getTotalLength();
      return [element.getPointAtLength(0), element.getPointAtLength(length)] as const;
    };
    for (const relationship of document.relationships) {
      const from = document.nodes.find((node) => node.alias === relationship.from);
      const to = document.nodes.find((node) => node.alias === relationship.to);
      const fromText = from ? renderedNodes.get(from.id) : undefined;
      const toText = to ? renderedNodes.get(to.id) : undefined;
      if (!fromText || !toText || !svgRoot) continue;
      const fromBox = fromText.getBBox();
      const toBox = toText.getBBox();
      const ranked = candidates
        .map((element) => {
          const [first, second] = endpoints(element);
          const score = Math.min(
            distanceToBox(first, fromBox) + distanceToBox(second, toBox),
            distanceToBox(second, fromBox) + distanceToBox(first, toBox),
          );
          return { element, score };
        })
        .sort((left, right) => left.score - right.score);
      const rendered = ranked[0];
      if (!rendered || rendered.score > 60) continue;
      const hit = rendered.element.cloneNode(false) as SVGGeometryElement;
      hit.removeAttribute("fill");
      hit.setAttribute(
        "class",
        `wbs-relationship-hit${relationship.id === selectedRelationshipId ? " wbs-selected-relationship" : ""}`,
      );
      hit.dataset.wbsRelationshipId = relationship.id;
      hit.setAttribute("tabindex", "0");
      hit.setAttribute("role", "button");
      hit.setAttribute("aria-label", `Select WBS arrow from ${relationship.from} to ${relationship.to}`);
      svgRoot.append(hit);
      if (relationship.id === selectedRelationshipId) {
        const [first, second] = endpoints(rendered.element);
        const direct = distanceToBox(first, fromBox) + distanceToBox(second, toBox);
        const reverse = distanceToBox(second, fromBox) + distanceToBox(first, toBox);
        const points = direct <= reverse ? { from: first, to: second } : { from: second, to: first };
        for (const endpoint of ["from", "to"] as const) {
          const handle = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "circle");
          handle.setAttribute("cx", String(points[endpoint].x));
          handle.setAttribute("cy", String(points[endpoint].y));
          handle.setAttribute("r", "7");
          handle.setAttribute("class", "wbs-relationship-endpoint");
          handle.dataset.wbsRelationshipId = relationship.id;
          handle.dataset.wbsRelationshipEndpoint = endpoint;
          const fixed = points[endpoint === "from" ? "to" : "from"];
          handle.dataset.wbsRelationshipFixedX = String(fixed.x);
          handle.dataset.wbsRelationshipFixedY = String(fixed.y);
          handle.setAttribute("role", "button");
          handle.setAttribute("aria-label", `Drag ${endpoint} end of WBS arrow`);
          svgRoot.append(handle);
        }
      }
    }
  });
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) return;
      current.active = true;
      event.preventDefault();
      const target = nodeElementAt(event.clientX, event.clientY);
      clearDropTarget();
      if ((current.kind === "connect" || current.kind === "reconnect") && current.line) {
        const svg = current.line.ownerSVGElement;
        if (!svg) return;
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const local = point.matrixTransform(svg.getScreenCTM()?.inverse());
        current.line.setAttribute("x2", String(local.x));
        current.line.setAttribute("y2", String(local.y));
        if (target?.dataset.wbsNodeId && (current.kind === "reconnect" || target.dataset.wbsNodeId !== current.id)) {
          target.classList.add("wbs-drop-target");
          dropTarget.current = target;
        }
        return;
      }
      const sourceNode = document.nodes.find((item) => item.id === current.id);
      const targetNode = document.nodes.find((item) => item.id === target?.dataset.wbsNodeId);
      setDragPreview({
        label: sourceNode?.label ?? "WBS node",
        x: event.clientX + 16,
        y: event.clientY + 16,
        ...(targetNode
          ? {
              destination: event.shiftKey ? `Place before ${targetNode.label}` : `Move inside ${targetNode.label}`,
            }
          : {}),
      });
      if (target?.dataset.wbsNodeId && target.dataset.wbsNodeId !== current.id) {
        target.classList.add("wbs-drop-target");
        dropTarget.current = target;
      }
    };
    const end = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      drag.current = undefined;
      current.line?.remove();
      setDragPreview(undefined);
      const target = nodeElementAt(event.clientX, event.clientY)?.dataset.wbsNodeId;
      clearDropTarget();
      if (!current.active || !target) return;
      if (current.kind === "reconnect" && current.endpoint) {
        onRelationshipReconnect(current.id, current.endpoint, target);
        return;
      }
      if (current.id === target) return;
      if (current.kind === "connect") {
        onRelationshipCreate(current.id, target);
        return;
      }
      const targetNode = document.nodes.find((item) => item.id === target);
      if (event.shiftKey) onMove(current.id, targetNode?.parentId, target);
      else onMove(current.id, target);
    };
    const cancel = () => {
      drag.current?.line?.remove();
      drag.current = undefined;
      setDragPreview(undefined);
      clearDropTarget();
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", cancel, true);
    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", cancel, true);
    };
  }, [document, onMove, onRelationshipCreate, onRelationshipReconnect]);
  return (
    <section className="preview wbs-preview" aria-label="WBS diagram preview" data-render-status={renderStatus}>
      <div className="preview-tools">
        <button onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))} aria-label="Zoom out">
          −
        </button>
        <button onClick={() => onZoomChange(1)} aria-label={`Reset zoom, ${Math.round(zoom * 100)}%`}>
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => onZoomChange(Math.min(3, zoom + 0.1))} aria-label="Zoom in">
          +
        </button>
      </div>
      <div
        className={`preview-viewport${renderStatus !== "idle" && svg ? " stale-preview" : ""}`}
        ref={navigation.viewportRef}
        onWheel={navigation.onWheel}
        onPointerDown={navigation.onPointerDown}
        onAuxClick={navigation.onAuxClick}
      >
        {renderError && (
          <div className="render-error" role="alert">
            <span>{renderError}</span>
            <button onClick={onRenderRetry}>Retry</button>
          </div>
        )}
        {!svg && !renderError && (
          <div className="render-loading">{renderStatus === "rendering" ? "Rendering WBS…" : "No WBS preview"}</div>
        )}
        {svg && (
          <div
            ref={root}
            className="diagram wbs-diagram"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
            dangerouslySetInnerHTML={{ __html: svg }}
            onClick={(event) => {
              const target = event.target as Element;
              const relationshipId =
                target.closest<SVGElement>("[data-wbs-relationship-id]")?.dataset.wbsRelationshipId;
              if (relationshipId) {
                onRelationshipSelect(relationshipId);
                return;
              }
              const id =
                target.closest<SVGElement>("[data-wbs-node-id]")?.dataset.wbsNodeId ??
                nodeElementAt(event.clientX, event.clientY)?.dataset.wbsNodeId;
              if (id) onSelect(id);
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const target = event.target as Element;
              const endpointHandle = target.closest<SVGCircleElement>("[data-wbs-relationship-endpoint]");
              const endpoint = endpointHandle?.dataset.wbsRelationshipEndpoint as "from" | "to" | undefined;
              const endpointRelationshipId = endpointHandle?.dataset.wbsRelationshipId;
              if (endpointHandle && endpoint && endpointRelationshipId && endpointHandle.ownerSVGElement) {
                event.preventDefault();
                const line = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "line");
                const x = endpointHandle.dataset.wbsRelationshipFixedX ?? endpointHandle.getAttribute("cx") ?? "0";
                const y = endpointHandle.dataset.wbsRelationshipFixedY ?? endpointHandle.getAttribute("cy") ?? "0";
                line.setAttribute("x1", x);
                line.setAttribute("y1", y);
                line.setAttribute("x2", x);
                line.setAttribute("y2", y);
                line.setAttribute("class", "wbs-connection-preview");
                endpointHandle.ownerSVGElement.append(line);
                drag.current = {
                  id: endpointRelationshipId,
                  kind: "reconnect",
                  endpoint,
                  pointerId: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  active: false,
                  line,
                };
                return;
              }
              const relationshipId =
                target.closest<SVGElement>("[data-wbs-relationship-id]")?.dataset.wbsRelationshipId;
              if (relationshipId) {
                event.preventDefault();
                onRelationshipSelect(relationshipId);
                return;
              }
              const handle = target.closest<SVGCircleElement>("[data-wbs-connect-from]");
              const id =
                handle?.dataset.wbsConnectFrom ??
                target.closest<SVGElement>("[data-wbs-node-id]")?.dataset.wbsNodeId ??
                nodeElementAt(event.clientX, event.clientY)?.dataset.wbsNodeId;
              if (id) {
                event.preventDefault();
                let line: SVGLineElement | undefined;
                if (handle?.ownerSVGElement) {
                  line = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "line");
                  const x = handle.getAttribute("cx") ?? "0";
                  const y = handle.getAttribute("cy") ?? "0";
                  line.setAttribute("x1", x);
                  line.setAttribute("y1", y);
                  line.setAttribute("x2", x);
                  line.setAttribute("y2", y);
                  line.setAttribute("class", "wbs-connection-preview");
                  handle.ownerSVGElement.append(line);
                }
                drag.current = {
                  id,
                  kind: handle ? "connect" : "move",
                  pointerId: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  active: false,
                  ...(line ? { line } : {}),
                };
                if (!handle) onSelect(id);
              } else {
                onSelect(undefined);
                onRelationshipSelect(undefined);
              }
            }}
            onKeyDown={(event) => {
              const id = (event.target as Element).closest<SVGTextElement>("[data-wbs-node-id]")?.dataset.wbsNodeId;
              const relationshipId = (event.target as Element).closest<SVGElement>("[data-wbs-relationship-id]")
                ?.dataset.wbsRelationshipId;
              if (relationshipId && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onRelationshipSelect(relationshipId);
                return;
              }
              if (id && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onSelect(id);
              }
            }}
          />
        )}
      </div>
      {dragPreview && (
        <div
          className="wbs-drag-preview"
          style={{ left: dragPreview.x, top: dragPreview.y }}
          role="status"
          aria-live="polite"
        >
          <strong>{dragPreview.label}</strong>
          <span>{dragPreview.destination ?? "Choose a destination"}</span>
        </div>
      )}
      <p className="preview-hint">Drag a node to move it. Select a node and drag its blue anchor to create an arrow.</p>
    </section>
  );
}
