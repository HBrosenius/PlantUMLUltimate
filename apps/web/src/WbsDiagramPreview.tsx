import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WbsDocument } from "@plantuml-studio/diagram-wbs";
import type { RenderStatus } from "./model";
import { useDiagramNavigation } from "./useDiagramNavigation";
import { MAX_DIAGRAM_ZOOM } from "./diagram-zoom";
import { appendDiagramLinkIcon } from "./render/diagram-link-icon";

interface Props {
  svg: string | undefined;
  document: WbsDocument;
  linkedNodeIds?: ReadonlySet<string>;
  nodeCompletion?: ReadonlyMap<string, number>;
  dependencyWarnings?: ReadonlyMap<string, string>;
  selectedId: string | undefined;
  selectedRelationshipId: string | undefined;
  zoom: number;
  renderStatus: RenderStatus;
  renderError: string | undefined;
  onRenderRetry(): void;
  onZoomChange(value: number): void;
  onSelect(id?: string): void;
  onRelationshipSelect(id?: string): void;
  onMove(nodeId: string, parentId?: string, beforeId?: string, side?: "left" | "right"): void;
  onRelationshipCreate(fromId: string, toId: string): void;
  onRelationshipReconnect(relationshipId: string, endpoint: "from" | "to", targetId: string): void;
}

export function WbsDiagramPreview({
  svg,
  document,
  linkedNodeIds = new Set(),
  nodeCompletion = new Map(),
  dependencyWarnings = new Map(),
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
  const dropPlan = useRef<
    | {
        parentId?: string;
        beforeId?: string;
        side?: "left" | "right";
        mode: "before" | "inside" | "after" | "side";
      }
    | undefined
  >(undefined);
  const focusAfterRender = useRef<string | undefined>(undefined);
  const [dragPreview, setDragPreview] = useState<{
    label: string;
    x: number;
    y: number;
    destination?: string;
    placement?: {
      left: number;
      top: number;
      width: number;
      height: number;
      mode: "before" | "inside" | "after" | "side";
    };
  }>();
  const [keyboardConnectFrom, setKeyboardConnectFrom] = useState<string>();
  const clearDropTarget = () => {
    dropTarget.current?.classList.remove("wbs-drop-target");
    dropTarget.current = undefined;
  };
  const nodeElementAt = useCallback((x: number, y: number) => {
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
  }, []);
  const planMove = useCallback(
    (sourceId: string, x: number, y: number, forceBefore: boolean) => {
      const source = document.nodes.find((item) => item.id === sourceId);
      const targetElement = nodeElementAt(x, y);
      const target = document.nodes.find((item) => item.id === targetElement?.dataset.wbsNodeId);
      const rootNode = document.nodes.find((item) => item.depth === 1);
      const parentNode = document.nodes.find((item) => item.id === source?.parentId);
      const parentElement = parentNode
        ? root.current?.querySelector<SVGTextElement>(`text[data-wbs-node-id="${CSS.escape(parentNode.id)}"]`)
        : undefined;
      const parentBounds = parentElement?.getBoundingClientRect();
      if (!source || !rootNode || source.id === rootNode.id) return undefined;
      if (!target && parentNode && parentBounds) {
        const svgBounds = root.current?.querySelector("svg")?.getBoundingClientRect();
        const desiredSide: "left" | "right" | undefined =
          x < parentBounds.left - 20 ? "left" : x > parentBounds.right + 20 ? "right" : undefined;
        const insideDiagram =
          svgBounds &&
          x >= svgBounds.left - 24 &&
          x <= svgBounds.right + 24 &&
          y >= svgBounds.top - 24 &&
          y <= svgBounds.bottom + 24;
        if (desiredSide && insideDiagram) {
          const sideStart = desiredSide === "left" ? svgBounds.left : parentBounds.right + 18;
          const sideEnd = desiredSide === "left" ? parentBounds.left - 18 : svgBounds.right;
          return {
            parentId: parentNode.id,
            ...(desiredSide !== source.side ? { side: desiredSide } : {}),
            mode: "side",
            destination: `Move to the ${desiredSide} side of ${parentNode.label}`,
            placement: {
              left: Math.min(sideStart, sideEnd),
              top: svgBounds.top + 8,
              width: Math.max(48, Math.abs(sideEnd - sideStart)),
              height: Math.max(40, svgBounds.height - 16),
              mode: "side",
            },
          } as const;
        }
      }
      if (!target || source.id === target.id) return undefined;
      if (target.sourceRange.from > source.sourceRange.from && target.sourceRange.from <= source.subtreeRange.to)
        return undefined;
      const bounds = targetElement!.getBoundingClientRect();
      const fraction = bounds.height ? (y - bounds.top) / bounds.height : 0.5;
      const mode = forceBefore || fraction < 0.3 ? "before" : fraction > 0.7 ? "after" : "inside";
      const targetCenter = bounds.left + bounds.width / 2;
      const desiredSide =
        source.depth <= 1
          ? undefined
          : target.id === source.parentId
            ? x < targetCenter
              ? "left"
              : "right"
            : target.side === "root"
              ? source.side === "left"
                ? "left"
                : "right"
              : target.side === "left"
                ? "left"
                : "right";
      const side = desiredSide && desiredSide !== source.side ? desiredSide : undefined;
      if (mode === "inside") {
        return {
          parentId: target.id,
          side,
          mode,
          destination: `Move inside ${target.label}${side ? ` on the ${side}` : ""}`,
          placement: {
            left: desiredSide === "left" ? bounds.left - 34 : bounds.right + 10,
            top: bounds.top + bounds.height / 2 - 13,
            width: 24,
            height: 26,
            mode,
          },
        } as const;
      }
      const siblings = document.nodes.filter(
        (item) => item.parentId === target.parentId && item.depth === target.depth && item.side === target.side,
      );
      const targetIndex = siblings.findIndex((item) => item.id === target.id);
      const beforeId = mode === "before" ? target.id : siblings[targetIndex + 1]?.id;
      return {
        parentId: target.parentId,
        ...(beforeId ? { beforeId } : {}),
        side,
        mode,
        destination: `${mode === "before" ? "Place before" : "Place after"} ${target.label}${side ? ` on the ${side}` : ""}`,
        placement: {
          left: bounds.left - 10,
          top: mode === "before" ? bounds.top - 7 : bounds.bottom + 3,
          width: bounds.width + 20,
          height: 4,
          mode,
        },
      } as const;
    },
    [document.nodes, nodeElementAt],
  );
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    host
      .querySelectorAll(
        ".wbs-node-hit, .wbs-connect-handle, .wbs-relationship-hit, .wbs-relationship-endpoint, .wbs-dependency-warning, .diagram-link-icon, .wbs-node-completion",
      )
      .forEach((item) => item.remove());
    const texts = [...host.querySelectorAll<SVGTextElement>("svg text")];
    const claimed = new Set<SVGTextElement>();
    const renderedNodes = new Map<string, SVGTextElement>();
    // PlantUML renders a multiline `*: line one\nline two;` label as one <text> per line, so a
    // node whose label contains "\n" is matched against a run of consecutive, unclaimed <text>
    // elements whose trimmed contents equal the label's lines in order.
    const findLabelTexts = (label: string): SVGTextElement[] | undefined => {
      const lines = label.split("\n");
      if (lines.length === 1) {
        const text = texts.find((candidate) => !claimed.has(candidate) && candidate.textContent?.trim() === label);
        return text ? [text] : undefined;
      }
      for (let start = 0; start + lines.length <= texts.length; start += 1) {
        const run = texts.slice(start, start + lines.length);
        if (run.some((candidate) => claimed.has(candidate))) continue;
        if (run.every((candidate, index) => candidate.textContent?.trim() === lines[index])) return run;
      }
      return undefined;
    };
    for (const node of document.nodes) {
      const matched = findLabelTexts(node.label);
      if (!matched || matched.length === 0) continue;
      const text = matched[0]!;
      matched.forEach((candidate) => {
        claimed.add(candidate);
        candidate.dataset.wbsNodeId = node.id;
        candidate.classList.toggle("wbs-selected-node", node.id === selectedId);
      });
      renderedNodes.set(node.id, text);
      text.setAttribute("tabindex", "0");
      text.setAttribute("role", "button");
      text.setAttribute("aria-label", `Select WBS node ${node.label}`);
      if (linkedNodeIds.has(node.id)) {
        const lastLine = matched.at(-1)!;
        appendDiagramLinkIcon(lastLine);
        const completion = nodeCompletion.get(node.id);
        if (completion !== undefined) {
          const box = lastLine.getBBox();
          const label = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "text");
          label.setAttribute("class", "wbs-node-completion");
          label.setAttribute("x", String(box.x + box.width + 24));
          label.setAttribute("y", String(box.y + box.height / 2 + 4));
          label.setAttribute("aria-label", `${node.label}: ${completion}% complete`);
          label.textContent = `${completion}%`;
          lastLine.parentNode?.append(label);
        }
      }
      const boxes = matched.map((candidate) => candidate.getBBox());
      const bounds = boxes.slice(1).reduce(
        (union, box) => {
          const x = Math.min(union.x, box.x);
          const y = Math.min(union.y, box.y);
          return {
            x,
            y,
            width: Math.max(union.x + union.width, box.x + box.width) - x,
            height: Math.max(union.y + union.height, box.y + box.height) - y,
          };
        },
        { x: boxes[0]!.x, y: boxes[0]!.y, width: boxes[0]!.width, height: boxes[0]!.height },
      );
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
      (element) => !element.classList.contains("wbs-connection-preview") && !element.closest(".diagram-link-icon"),
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
      const warning = dependencyWarnings.get(relationship.id);
      if (warning) {
        const [first, second] = endpoints(rendered.element);
        const marker = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "g");
        marker.setAttribute("class", "wbs-dependency-warning");
        marker.setAttribute("transform", `translate(${(first.x + second.x) / 2} ${(first.y + second.y) / 2})`);
        marker.setAttribute("role", "button");
        marker.setAttribute("tabindex", "0");
        marker.setAttribute("aria-label", `Inspect WBS dependency warning: ${warning}`);
        marker.dataset.wbsRelationshipId = relationship.id;
        const circle = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("r", "9");
        const symbol = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "text");
        symbol.setAttribute("text-anchor", "middle");
        symbol.setAttribute("y", "4");
        symbol.textContent = "!";
        marker.append(circle, symbol);
        svgRoot.append(marker);
      }
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
    if (focusAfterRender.current && renderStatus === "idle") {
      const label = focusAfterRender.current;
      const target = [...host.querySelectorAll<SVGElement>("[aria-label]")].find(
        (item) => item.getAttribute("aria-label") === label,
      );
      if (target)
        window.setTimeout(() => {
          if (!target.isConnected) return;
          target.focus();
          focusAfterRender.current = undefined;
        }, 100);
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
      const plan = planMove(current.id, event.clientX, event.clientY, event.shiftKey);
      dropPlan.current = plan
        ? {
            ...(plan.parentId ? { parentId: plan.parentId } : {}),
            ...("beforeId" in plan && plan.beforeId ? { beforeId: plan.beforeId } : {}),
            ...(plan.side ? { side: plan.side } : {}),
            mode: plan.mode,
          }
        : undefined;
      setDragPreview({
        label: sourceNode?.label ?? "WBS node",
        x: event.clientX + 16,
        y: event.clientY + 16,
        ...(plan ? { destination: plan.destination, placement: plan.placement } : {}),
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
      const plan = dropPlan.current;
      dropPlan.current = undefined;
      clearDropTarget();
      if (!current.active) return;
      if (current.kind === "reconnect" && current.endpoint) {
        if (!target) return;
        onRelationshipReconnect(current.id, current.endpoint, target);
        return;
      }
      if (current.id === target) return;
      if (current.kind === "connect") {
        if (!target) return;
        onRelationshipCreate(current.id, target);
        return;
      }
      if (plan) onMove(current.id, plan.parentId, plan.beforeId, plan.side);
    };
    const cancel = () => {
      drag.current?.line?.remove();
      drag.current = undefined;
      dropPlan.current = undefined;
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
  }, [document, nodeElementAt, onMove, onRelationshipCreate, onRelationshipReconnect, planMove, renderStatus]);
  return (
    <section className="preview wbs-preview" aria-label="WBS diagram preview" data-render-status={renderStatus}>
      <div className="preview-tools">
        <button onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))} aria-label="Zoom out">
          −
        </button>
        <button onClick={() => onZoomChange(1)} aria-label={`Reset zoom, ${Math.round(zoom * 100)}%`}>
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => onZoomChange(Math.min(MAX_DIAGRAM_ZOOM, zoom + 0.1))} aria-label="Zoom in">
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
              if (event.key === "Escape" && keyboardConnectFrom) {
                event.preventDefault();
                setKeyboardConnectFrom(undefined);
                return;
              }
              if (id && event.key.toLocaleLowerCase() === "c") {
                event.preventDefault();
                setKeyboardConnectFrom(id);
                onSelect(id);
                return;
              }
              if (id && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                if (keyboardConnectFrom && keyboardConnectFrom !== id) {
                  focusAfterRender.current =
                    (event.target as Element).closest("[aria-label]")?.getAttribute("aria-label") ?? undefined;
                  onRelationshipCreate(keyboardConnectFrom, id);
                  setKeyboardConnectFrom(undefined);
                } else onSelect(id);
                return;
              }
              if (!id || !event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
              const node = document.nodes.find((item) => item.id === id);
              if (!node) return;
              const siblings = document.nodes.filter(
                (item) => item.parentId === node.parentId && item.side === node.side && item.depth === node.depth,
              );
              const index = siblings.findIndex((item) => item.id === id);
              const direction = event.key === "ArrowUp" ? -1 : 1;
              const sibling = siblings[index + direction];
              if (!sibling) return;
              event.preventDefault();
              focusAfterRender.current =
                (event.target as Element).closest("[aria-label]")?.getAttribute("aria-label") ?? undefined;
              const before = direction < 0 ? sibling : siblings[index + 2];
              onMove(id, node.parentId, before?.id);
            }}
          />
        )}
      </div>
      {dragPreview && (
        <>
          {dragPreview.placement && (
            <div
              className={`wbs-placement-preview wbs-placement-${dragPreview.placement.mode}`}
              style={dragPreview.placement}
            />
          )}
          <div
            className="wbs-drag-preview"
            style={{ left: dragPreview.x, top: dragPreview.y }}
            role="status"
            aria-live="polite"
          >
            <strong>{dragPreview.label}</strong>
            <span>{dragPreview.destination ?? "Choose a destination"}</span>
          </div>
        </>
      )}
      <p className="preview-hint">
        {keyboardConnectFrom
          ? "Choose a target and press Enter · Esc cancels"
          : "Drop above/below to reorder · drop in the middle to nest · drop left/right of the parent to change side"}
      </p>
    </section>
  );
}
