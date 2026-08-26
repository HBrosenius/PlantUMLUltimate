import { useLayoutEffect, useRef, type MutableRefObject, type PointerEvent } from "react";
import type { ActivityDocument } from "@plantuml-studio/diagram-activity";
import type { RenderStatus } from "./model";

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
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number } | undefined>(undefined);
  const suppressClick = useRef(false);
  useLayoutEffect(() => {
    const rendered = root.current?.querySelector("svg");
    if (!rendered) return;
    rendered.querySelectorAll(".activity-semantic-hit,.activity-move-handle").forEach((item) => item.remove());
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
      const hit = window.document.createElementNS("http://www.w3.org/2000/svg", "rect");
      hit.setAttribute("class", `activity-semantic-hit${selectedId === object.id ? " activity-selected-object" : ""}`);
      hit.setAttribute("data-activity-object-id", object.id);
      hit.setAttribute("data-activity-object-type", document.arrows.some((arrow) => arrow.id === object.id) ? "arrow" : "text" in object ? "note" : "kind" in object ? object.kind === "action" ? "action" : "control" : "object");
      hit.setAttribute("x", String(box.x - 9));
      hit.setAttribute("y", String(box.y - 7));
      hit.setAttribute("width", String(Math.max(34, box.width + 18)));
      hit.setAttribute("height", String(Math.max(26, box.height + 14)));
      hit.setAttribute("rx", "7");
      hit.setAttribute("role", "button");
      hit.setAttribute("tabindex", "0");
      hit.setAttribute("aria-label", `Select ${"text" in object ? "note" : "kind" in object ? object.kind : "item"} ${activityText(object)[0] ?? ""}`);
      rendered.append(hit);
      const movable = "kind" in object && (object.kind === "action" || ["if", "switch", "fork", "split", "repeat", "while"].includes(object.kind));
      if (!movable) continue;
      const handle = window.document.createElementNS("http://www.w3.org/2000/svg", "rect");
      handle.setAttribute("class", "activity-move-handle");
      handle.setAttribute("data-activity-move-id", object.id);
      handle.setAttribute("x", String(box.x - 20));
      handle.setAttribute("y", String(box.y + box.height / 2 - 6));
      handle.setAttribute("width", "12");
      handle.setAttribute("height", "12");
      handle.setAttribute("rx", "3");
      handle.setAttribute("aria-label", `Drag to reorder ${activityText(object)[0] ?? "flow item"}`);
      rendered.append(handle);
    }
  }, [document, selectedId, svg]);
  return (
    <section className="preview activity-preview" aria-label="Activity diagram preview">
      <div className="preview-tools">
        <button onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))} aria-label="Zoom out">−</button>
        <button onClick={() => onZoomChange(1)} aria-label="Reset zoom">{Math.round(zoom * 100)}%</button>
        <button onClick={() => onZoomChange(Math.min(3, zoom + 0.1))} aria-label="Zoom in">+</button>
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
              <button key={item.id} type="button" data-activity-object-id={item.id} data-inspector-trigger onClick={(event) => { event.stopPropagation(); onSelect(item.id); }}>
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
            {document.nodes.filter((item) => item.kind !== "action").map((item, index) => (
              <button key={item.id} type="button" data-activity-object-id={item.id} data-inspector-trigger onClick={(event) => { event.stopPropagation(); onSelect(item.id); }}>
                {item.kind} {index + 1}
              </button>
            ))}
          </div>
        )}
        <span className="usecase-keyboard-help">Click an action to inspect it</span>
      </div>
      <div className="preview-viewport">
        {svg ? (
          <div
            ref={root}
            className="diagram activity-diagram"
            style={{ transform: `scale(${zoom})` }}
            onPointerDown={(event) => {
              const origin = (event.target as Element).closest('[data-activity-move-id], [data-activity-object-type="action"]');
              const id = origin?.getAttribute("data-activity-move-id") ?? origin?.getAttribute("data-activity-object-id");
              if (!id) return;
              drag.current = { id, x: event.clientX, y: event.clientY };
              event.currentTarget.classList.add("activity-dragging-move");
              if (origin?.hasAttribute("data-activity-move-id")) {
                event.currentTarget.setPointerCapture(event.pointerId);
                event.preventDefault();
              }
            }}
            onPointerUp={(event) => {
              suppressClick.current = finishReorder(event, root.current, drag, onReorder);
              window.setTimeout(() => {
                suppressClick.current = false;
              }, 0);
              event.currentTarget.classList.remove("activity-dragging-move");
            }}
            onPointerCancel={() => {
              drag.current = undefined;
              root.current?.classList.remove("activity-dragging-move");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              const id = (event.target as Element).closest("[data-activity-object-id]")?.getAttribute("data-activity-object-id");
              if (!id) return;
              event.preventDefault();
              onSelect(id);
            }}
            onClick={(event) => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              const id = (event.target as Element).closest("[data-activity-object-id]")?.getAttribute("data-activity-object-id");
              if (id) onSelect(id);
              else onBackgroundSelect();
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : renderError ? (
          <div className="render-error" role="alert">
            <strong>Could not render this Activity diagram.</strong>
            <p>{renderError}</p>
            <button onClick={onRenderRetry}>Retry</button>
          </div>
        ) : (
          <div className="render-placeholder">{renderStatus === "rendering" ? "Rendering Activity diagram…" : "Enter Activity source to render a preview."}</div>
        )}
      </div>
    </section>
  );
}

const activityText = (item: ActivityDocument["nodes"][number] | ActivityDocument["controls"][number] | ActivityDocument["notes"][number] | ActivityDocument["arrows"][number]) =>
  "text" in item
    ? item.text.split("\n").map((line) => line.trim())
    : "condition" in item
      ? [item.condition, item.label].filter((entry): entry is string => Boolean(entry))
      : [item.label];

const finishReorder = (
  event: PointerEvent<HTMLDivElement>,
  root: HTMLDivElement | null,
  drag: MutableRefObject<{ id: string; x: number; y: number } | undefined>,
  onReorder: (id: string, targetId: string, placement: "before" | "after") => void,
) => {
  const value = drag.current;
  drag.current = undefined;
  if (!value || Math.hypot(event.clientX - value.x, event.clientY - value.y) < 5) return false;
  const target = [...(root?.querySelectorAll<SVGGraphicsElement>('[data-activity-object-type="action"]') ?? [])].find((item) => {
    const box = item.getBoundingClientRect();
    return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
  });
  const targetId = target?.getAttribute("data-activity-object-id");
  if (!target || !targetId || targetId === value.id) return true;
  const box = target.getBoundingClientRect();
  onReorder(value.id, targetId, event.clientY < box.top + box.height / 2 ? "before" : "after");
  return true;
};
