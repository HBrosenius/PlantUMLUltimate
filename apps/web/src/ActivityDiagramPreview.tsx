import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent } from "react";
import type { ActivityDocument } from "@plantuml-studio/diagram-activity";
import type { RenderStatus } from "./model";
import { useDiagramNavigation } from "./useDiagramNavigation";

export function ActivityDiagramPreview({
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
  onReorder,
  onConnect,
  onAttachNote,
}: {
  svg?: string | undefined;
  zoom: number;
  onZoomChange(value: number): void;
  renderStatus: RenderStatus;
  renderError?: string | undefined;
  onRenderRetry(): void;
  document: ActivityDocument;
  selectedId?: string | undefined;
  onSelect(id: string): void;
  onBackgroundSelect(): void;
  onReorder(id: string, targetId: string, placement: "before" | "after"): void;
  onConnect(fromId: string, toId: string): void;
  onAttachNote(noteId: string, targetId: string): void;
}) {
  const navigation = useDiagramNavigation(zoom, onZoomChange);
  const root = useRef<HTMLDivElement>(null);
  // Preserve the SVG and its imperative interaction overlays on unrelated React renders.
  const svgMarkup = useMemo(() => ({ __html: svg ?? "" }), [svg]);
  const drag = useRef<
    { id: string; kind: "move" | "connect"; pointerId: number; x: number; y: number; line?: SVGLineElement } | undefined
  >(undefined);
  const suppressClick = useRef(false);
  const focusAfterRender = useRef<string | undefined>(undefined);
  const [dragFeedback, setDragFeedback] = useState<{
    text: string;
    x: number;
    y: number;
    placement?: { left: number; top: number; width: number };
  }>();
  useLayoutEffect(() => {
    const rendered = root.current?.querySelector("svg");
    if (!rendered) return;
    rendered
      .querySelectorAll(
        ".activity-semantic-hit,.activity-move-handle,.activity-connect-handle,.activity-connection-preview",
      )
      .forEach((item) => item.remove());
    const candidates = [
      ...document.nodes.filter((item) => item.kind === "action"),
      ...document.controls,
      ...document.notes,
      ...document.arrows.filter((item) => item.label),
    ];
    for (const text of rendered.querySelectorAll<SVGTextElement>("text")) {
      const value = text.textContent?.trim() ?? "";
      const object = candidates.find(
        (item) =>
          activityText(item).some((entry) => entry === value) ||
          ("text" in item && item.text.split("\n").some((line) => line.trim() === value)),
      );
      if (!object) continue;
      const box = text.getBBox();
      const rootTransform = rendered.getScreenCTM();
      const textTransform = text.getScreenCTM();
      const transform = rootTransform && textTransform ? rootTransform.inverse().multiply(textTransform) : null;
      const applyTextTransform = (element: SVGElement) => {
        if (transform)
          element.setAttribute(
            "transform",
            `matrix(${transform.a} ${transform.b} ${transform.c} ${transform.d} ${transform.e} ${transform.f})`,
          );
      };
      const objectType = document.arrows.some((arrow) => arrow.id === object.id)
        ? "arrow"
        : "text" in object
          ? "note"
          : "kind" in object
            ? object.kind === "action"
              ? "action"
              : "control"
            : "object";
      text.dataset.activityObjectId = object.id;
      text.dataset.activityObjectType = objectType;
      text.classList.add("activity-semantic-label");
      const hit = window.document.createElementNS("http://www.w3.org/2000/svg", "rect");
      hit.setAttribute("class", `activity-semantic-hit${selectedId === object.id ? " activity-selected-object" : ""}`);
      hit.setAttribute("data-activity-object-id", object.id);
      hit.setAttribute("data-activity-object-type", objectType);
      hit.setAttribute("x", String(box.x - 9));
      hit.setAttribute("y", String(box.y - 7));
      hit.setAttribute("width", String(Math.max(34, box.width + 18)));
      hit.setAttribute("height", String(Math.max(26, box.height + 14)));
      hit.setAttribute("rx", "7");
      applyTextTransform(hit);
      hit.setAttribute("role", "button");
      hit.setAttribute("tabindex", "0");
      hit.setAttribute(
        "aria-label",
        `Select ${"text" in object ? "note" : "kind" in object ? object.kind : "item"} ${activityText(object)[0] ?? ""}`,
      );
      rendered.append(hit);
      if ("kind" in object && object.kind === "action") {
        const connect = window.document.createElementNS("http://www.w3.org/2000/svg", "circle");
        connect.setAttribute("class", "activity-connect-handle");
        connect.setAttribute("data-activity-connect-from", object.id);
        connect.setAttribute("cx", String(box.x + box.width + 18));
        connect.setAttribute("cy", String(box.y + box.height / 2));
        connect.setAttribute("r", "8");
        applyTextTransform(connect);
        connect.setAttribute("role", "button");
        connect.setAttribute("aria-label", `Drag to connect ${activityText(object)[0] ?? "action"}`);
        rendered.append(connect);
      }
      const movable =
        "kind" in object &&
        (object.kind === "action" || ["if", "switch", "fork", "split", "repeat", "while"].includes(object.kind));
      if (!movable) continue;
      const handle = window.document.createElementNS("http://www.w3.org/2000/svg", "rect");
      handle.setAttribute("class", "activity-move-handle");
      handle.setAttribute("data-activity-move-id", object.id);
      handle.setAttribute("x", String(box.x - 20));
      handle.setAttribute("y", String(box.y + box.height / 2 - 6));
      handle.setAttribute("width", "12");
      handle.setAttribute("height", "12");
      handle.setAttribute("rx", "3");
      applyTextTransform(handle);
      handle.setAttribute("aria-label", `Drag to reorder ${activityText(object)[0] ?? "flow item"}`);
      rendered.append(handle);
    }
    const activeDrag = drag.current;
    if (activeDrag?.kind === "connect" && !activeDrag.line?.isConnected) {
      const handle = rendered.querySelector<SVGCircleElement>(
        `[data-activity-connect-from="${CSS.escape(activeDrag.id)}"]`,
      );
      if (handle) {
        const line = window.document.createElementNS("http://www.w3.org/2000/svg", "line");
        const x = handle.getAttribute("cx") ?? "0";
        const y = handle.getAttribute("cy") ?? "0";
        line.setAttribute("x1", x);
        line.setAttribute("y1", y);
        line.setAttribute("x2", x);
        line.setAttribute("y2", y);
        line.setAttribute("class", "activity-connection-preview");
        rendered.append(line);
        activeDrag.line = line;
      }
    }
    if (focusAfterRender.current && renderStatus === "idle") {
      const label = focusAfterRender.current;
      const target = [...rendered.querySelectorAll<SVGElement>("[aria-label]")].find(
        (item) => item.getAttribute("aria-label") === label,
      );
      if (target)
        window.setTimeout(() => {
          if (!target.isConnected) return;
          target.focus();
          focusAfterRender.current = undefined;
        }, 100);
    }
  }, [document, renderStatus, selectedId, svg]);
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) return;
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      const target = activityActionAt(root.current, event.clientX, event.clientY, current.id);
      if (current.line) {
        const svgRoot = current.line.ownerSVGElement;
        const point = svgRoot?.createSVGPoint();
        if (point && svgRoot) {
          point.x = event.clientX;
          point.y = event.clientY;
          const local = point.matrixTransform(svgRoot.getScreenCTM()?.inverse());
          current.line.setAttribute("x2", String(local.x));
          current.line.setAttribute("y2", String(local.y));
        }
      }
      root.current
        ?.querySelectorAll(".activity-drop-target")
        .forEach((item) => item.classList.remove("activity-drop-target"));
      if (!target) {
        setDragFeedback({
          text:
            current.kind === "connect" ? "Drop on an action in the same partition" : "Drop above or below an action",
          x: event.clientX + 16,
          y: event.clientY + 16,
        });
        return;
      }
      const box = target.element.getBoundingClientRect();
      const placement = event.clientY < box.top + box.height / 2 ? "before" : "after";
      target.element.classList.add("activity-drop-target");
      setDragFeedback({
        text:
          current.kind === "connect"
            ? `Connect to ${target.label}`
            : document.notes.some((note) => note.id === current.id)
              ? `Attach note to ${target.label}`
              : `Place ${placement} ${target.label}`,
        x: event.clientX + 16,
        y: event.clientY + 16,
        ...(current.kind === "move"
          ? {
              placement: {
                left: box.left - 10,
                top: placement === "before" ? box.top - 6 : box.bottom + 2,
                width: box.width + 20,
              },
            }
          : {}),
      });
    };
    window.addEventListener("pointermove", move, { passive: false });
    return () => window.removeEventListener("pointermove", move);
  }, [document]);
  return (
    <section className="preview activity-preview" aria-label="Activity diagram preview">
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
        {document.partitions.length > 0 && (
          <div className="class-package-tray" role="group" aria-label="Activity partitions">
            <span>Partitions</span>
            {document.partitions.map((item) => (
              <button
                key={item.id}
                type="button"
                data-activity-object-id={item.id}
                data-inspector-trigger
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(item.id);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        {document.notes.length > 0 && (
          <div className="class-package-tray" role="group" aria-label="Activity notes">
            <span>Notes</span>
            {document.notes.map((item) => (
              <button
                key={item.id}
                type="button"
                data-activity-object-id={item.id}
                data-inspector-trigger
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(item.id);
                }}
              >
                {item.text.split("\n")[0]}
              </button>
            ))}
          </div>
        )}
        {document.controls.length > 0 && (
          <div className="class-package-tray" role="group" aria-label="Activity controls">
            <span>Controls</span>
            {document.controls.map((item) => (
              <button
                key={item.id}
                type="button"
                data-activity-object-id={item.id}
                data-inspector-trigger
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(item.id);
                }}
              >
                {item.condition || item.label || item.kind.replaceAll("-", " ")}
              </button>
            ))}
          </div>
        )}
        {document.arrows.length > 0 && (
          <div className="class-package-tray" role="group" aria-label="Activity flow arrows">
            <span>Flows</span>
            {document.arrows.map((item, index) => (
              <button
                key={item.id}
                type="button"
                data-activity-object-id={item.id}
                data-inspector-trigger
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(item.id);
                }}
              >
                {item.label || `Flow ${index + 1}`}
              </button>
            ))}
          </div>
        )}
        {document.nodes.some((item) => item.kind !== "action") && (
          <div className="class-package-tray" role="group" aria-label="Activity terminals">
            <span>Terminals</span>
            {document.nodes
              .filter((item) => item.kind !== "action")
              .map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  data-activity-object-id={item.id}
                  data-inspector-trigger
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(item.id);
                  }}
                >
                  {item.kind} {index + 1}
                </button>
              ))}
          </div>
        )}
        <span className="usecase-keyboard-help">Click an action to inspect it</span>
      </div>
      <div
        className="preview-viewport"
        ref={navigation.viewportRef}
        onWheel={navigation.onWheel}
        onPointerDown={navigation.onPointerDown}
        onAuxClick={navigation.onAuxClick}
      >
        {svg ? (
          <div
            ref={root}
            className="diagram activity-diagram"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const connectHandle = (event.target as Element).closest<SVGCircleElement>("[data-activity-connect-from]");
              if (connectHandle?.ownerSVGElement) {
                event.preventDefault();
                event.stopPropagation();
                const line = window.document.createElementNS("http://www.w3.org/2000/svg", "line");
                const x = connectHandle.getAttribute("cx") ?? "0";
                const y = connectHandle.getAttribute("cy") ?? "0";
                line.setAttribute("x1", x);
                line.setAttribute("y1", y);
                line.setAttribute("x2", x);
                line.setAttribute("y2", y);
                line.setAttribute("class", "activity-connection-preview");
                connectHandle.ownerSVGElement.append(line);
                drag.current = {
                  id: connectHandle.dataset.activityConnectFrom!,
                  kind: "connect",
                  pointerId: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  line,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }
              const origin = (event.target as Element).closest(
                '[data-activity-move-id], [data-activity-object-type="action"], [data-activity-object-type="control"], [data-activity-object-type="note"]',
              );
              const id =
                origin?.getAttribute("data-activity-move-id") ?? origin?.getAttribute("data-activity-object-id");
              if (!id) return;
              drag.current = { id, kind: "move", pointerId: event.pointerId, x: event.clientX, y: event.clientY };
              event.currentTarget.classList.add("activity-dragging-move");
              if (origin?.hasAttribute("data-activity-move-id")) {
                event.currentTarget.setPointerCapture(event.pointerId);
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onPointerUp={(event) => {
              const current = drag.current;
              const target = current
                ? activityActionAt(root.current, event.clientX, event.clientY, current.id)
                : undefined;
              current?.line?.remove();
              root.current
                ?.querySelectorAll(".activity-drop-target")
                .forEach((item) => item.classList.remove("activity-drop-target"));
              setDragFeedback(undefined);
              if (current?.kind === "connect" && target) {
                onConnect(current.id, target.id);
                suppressClick.current = true;
                drag.current = undefined;
              } else if (current && target && document.notes.some((note) => note.id === current.id)) {
                onAttachNote(current.id, target.id);
                suppressClick.current = true;
                drag.current = undefined;
              } else suppressClick.current = finishReorder(event, root.current, drag, onReorder);
              window.setTimeout(() => {
                suppressClick.current = false;
              }, 0);
              event.currentTarget.classList.remove("activity-dragging-move");
            }}
            onPointerCancel={() => {
              drag.current?.line?.remove();
              drag.current = undefined;
              setDragFeedback(undefined);
              root.current
                ?.querySelectorAll(".activity-drop-target")
                .forEach((item) => item.classList.remove("activity-drop-target"));
              root.current?.classList.remove("activity-dragging-move");
            }}
            onKeyDown={(event) => {
              const id = (event.target as Element)
                .closest("[data-activity-object-id]")
                ?.getAttribute("data-activity-object-id");
              if (!id) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(id);
                return;
              }
              if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
              const timeline = [...document.nodes, ...document.controls, ...document.notes, ...document.arrows].sort(
                (left, right) => left.sourceRange.from - right.sourceRange.from,
              );
              const index = timeline.findIndex((item) => item.id === id);
              const target = timeline[index + (event.key === "ArrowUp" ? -1 : 1)];
              if (!target) return;
              event.preventDefault();
              focusAfterRender.current =
                (event.target as Element).closest("[aria-label]")?.getAttribute("aria-label") ?? undefined;
              onReorder(id, target.id, event.key === "ArrowUp" ? "before" : "after");
            }}
            onClick={(event) => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              const id = (event.target as Element)
                .closest("[data-activity-object-id]")
                ?.getAttribute("data-activity-object-id");
              if (id) onSelect(id);
              else onBackgroundSelect();
            }}
            dangerouslySetInnerHTML={svgMarkup}
          />
        ) : renderError ? (
          <div className="render-error" role="alert">
            <strong>Could not render this Activity diagram.</strong>
            <p>{renderError}</p>
            <button onClick={onRenderRetry}>Retry</button>
          </div>
        ) : (
          <div className="render-placeholder">
            {renderStatus === "rendering"
              ? "Rendering Activity diagram…"
              : "Enter Activity source to render a preview."}
          </div>
        )}
      </div>
      {dragFeedback && (
        <>
          {dragFeedback.placement && (
            <div className="activity-placement-preview" style={dragFeedback.placement} aria-hidden="true" />
          )}
          <div className="activity-drag-preview" style={{ left: dragFeedback.x, top: dragFeedback.y }} role="status">
            {dragFeedback.text}
          </div>
        </>
      )}
      <p className="preview-hint">
        Drag flow items to reorder · select an action and drag its blue handle to create a transition · Alt+↑/↓ reorders
      </p>
    </section>
  );
}

const activityText = (
  item:
    | ActivityDocument["nodes"][number]
    | ActivityDocument["controls"][number]
    | ActivityDocument["notes"][number]
    | ActivityDocument["arrows"][number],
) =>
  "text" in item
    ? item.text.split("\n").map((line) => line.trim())
    : "condition" in item
      ? [item.condition, item.label].filter((entry): entry is string => Boolean(entry))
      : [item.label];

const activityActionAt = (root: HTMLDivElement | null, x: number, y: number, excludeId?: string) => {
  const direct = globalThis.document
    .elementsFromPoint(x, y)
    .map((element) => element.closest<SVGGraphicsElement>('[data-activity-object-type="action"]'))
    .find((element) => element?.dataset.activityObjectId && element.dataset.activityObjectId !== excludeId);
  if (direct?.dataset.activityObjectId) {
    const id = direct.dataset.activityObjectId;
    const hit =
      root?.querySelector<SVGGraphicsElement>(`.activity-semantic-hit[data-activity-object-id="${CSS.escape(id)}"]`) ??
      direct;
    return {
      id,
      label: hit.getAttribute("aria-label")?.replace(/^Select action /, "") ?? direct.textContent?.trim() ?? "action",
      element: hit,
      distance: 0,
    };
  }
  const targets = [
    ...(root?.querySelectorAll<SVGGraphicsElement>('.activity-semantic-hit[data-activity-object-type="action"]') ?? []),
  ];
  let closest: { id: string; label: string; element: SVGGraphicsElement; distance: number } | undefined;
  for (const element of targets) {
    const id = element.dataset.activityObjectId;
    if (!id || id === excludeId) continue;
    const box = element.getBoundingClientRect();
    const distance = Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2));
    if (!closest || distance < closest.distance)
      closest = {
        id,
        label: element.getAttribute("aria-label")?.replace(/^Select action /, "") ?? "action",
        element,
        distance,
      };
  }
  return closest && closest.distance <= Math.max(160, closest.element.getBoundingClientRect().height)
    ? closest
    : undefined;
};

const finishReorder = (
  event: PointerEvent<HTMLDivElement>,
  root: HTMLDivElement | null,
  drag: MutableRefObject<
    { id: string; kind: "move" | "connect"; pointerId: number; x: number; y: number; line?: SVGLineElement } | undefined
  >,
  onReorder: (id: string, targetId: string, placement: "before" | "after") => void,
) => {
  const value = drag.current;
  drag.current = undefined;
  if (!value || Math.hypot(event.clientX - value.x, event.clientY - value.y) < 5) return false;
  const target = [
    ...(root?.querySelectorAll<SVGGraphicsElement>('.activity-semantic-hit[data-activity-object-type="action"]') ?? []),
  ].find((item) => {
    const box = item.getBoundingClientRect();
    return (
      event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
    );
  });
  const targetId = target?.getAttribute("data-activity-object-id");
  if (!target || !targetId || targetId === value.id) return true;
  const box = target.getBoundingClientRect();
  onReorder(value.id, targetId, event.clientY < box.top + box.height / 2 ? "before" : "after");
  return true;
};
