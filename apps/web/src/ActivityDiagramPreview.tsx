import { useLayoutEffect, useRef } from "react";
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
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const rendered = root.current?.querySelector("svg");
    if (!rendered) return;
    rendered.querySelectorAll(".activity-semantic-hit").forEach((item) => item.remove());
    const candidates = [...document.nodes.filter((item) => item.kind === "action"), ...document.notes];
    for (const text of rendered.querySelectorAll<SVGTextElement>("text")) {
      const value = text.textContent?.trim() ?? "";
      const object = candidates.find(
        (item) =>
          ("label" in item && item.label === value) ||
          ("text" in item && item.text.split("\n").some((line) => line.trim() === value)),
      );
      if (!object) continue;
      const box = text.getBBox();
      const hit = window.document.createElementNS("http://www.w3.org/2000/svg", "rect");
      hit.setAttribute("class", `activity-semantic-hit${selectedId === object.id ? " activity-selected-object" : ""}`);
      hit.setAttribute("data-activity-object-id", object.id);
      hit.setAttribute("x", String(box.x - 9));
      hit.setAttribute("y", String(box.y - 7));
      hit.setAttribute("width", String(Math.max(34, box.width + 18)));
      hit.setAttribute("height", String(Math.max(26, box.height + 14)));
      hit.setAttribute("rx", "7");
      hit.setAttribute("role", "button");
      hit.setAttribute("tabindex", "0");
      hit.setAttribute("aria-label", `Select ${"text" in object ? "note" : "action"} ${"text" in object ? object.text : object.label}`);
      rendered.append(hit);
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
        <span className="usecase-keyboard-help">Click an action to inspect it</span>
      </div>
      <div className="preview-viewport">
        {svg ? (
          <div
            ref={root}
            className="diagram activity-diagram"
            style={{ transform: `scale(${zoom})` }}
            onClick={(event) => {
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
