import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import type { ClassDocument } from "@plantuml-studio/diagram-class";
import type { RenderStatus } from "./model";
export function ClassDiagramPreview({
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
  onZoomChange(v: number): void;
  renderStatus: RenderStatus;
  renderError?: string | undefined;
  onRenderRetry(): void;
  document: ClassDocument;
  selectedId?: string | undefined;
  onSelect(id: string): void;
  onBackgroundSelect(): void;
  onRelationshipCreate(from: string, to: string): void;
  onRelationshipReconnect(id: string, endpoint: "from" | "to", targetId: string): void;
  onMoveToPackage(id: string, packageId?: string): void;
  onReorder(id: string, targetId: string, placement: "before" | "after"): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const [renderRevision, setRenderRevision] = useState(0);
  const [keyboardConnectFrom, setKeyboardConnectFrom] = useState<string>();
  const drag = useRef<
    | {
        id: string;
        kind: "connect" | "move" | "reconnect";
        endpoint?: "from" | "to";
        x: number;
        y: number;
        line?: SVGLineElement;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const observer = new MutationObserver(() => setRenderRevision((value) => value + 1));
    observer.observe(host, { childList: true });
    setRenderRevision((value) => value + 1);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setKeyboardConnectFrom(undefined);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);
  useEffect(() => {
    const retry = window.setTimeout(() => {
      const host = root.current;
      if (host?.querySelector("svg") && !host.querySelector(".class-semantic-hit"))
        setRenderRevision((value) => value + 1);
    }, 150);
    return () => window.clearTimeout(retry);
  }, [document, selectedId, svg]);
  useLayoutEffect(() => {
    const host = root.current,
      rendered = host?.querySelector("svg");
    if (!host || !rendered) return;
    rendered
      .querySelectorAll(
        ".class-semantic-hit,.class-connect-handle,.class-move-handle,.class-relationship-hit,.class-relationship-endpoint,.class-connection-preview,.class-package-drop-hit",
      )
      .forEach((x) => x.remove());
    const entityMap = new Map<string, string>();
    for (const text of rendered.querySelectorAll<SVGTextElement>("text")) {
      const value = text.textContent?.trim() ?? "";
      const entity = document.entities.find((x) => value === x.label || value === (x.alias ?? x.label));
      const note = document.notes.find(
        (x) => value === x.text || x.text.split("\n").some((line) => value === line.trim()),
      );
      const pkg = document.packages.find((x) => value === x.label || value === (x.alias ?? x.label));
      const object = entity ?? note ?? pkg;
      if (!object) continue;
      const group = text.closest<SVGGElement>("g.entity[data-qualified-name]");
      if (group?.id && entity) entityMap.set(group.id, entity.id);
      const b = text.getBBox(),
        hit = documentNode("rect");
      hit.setAttribute("class", `class-semantic-hit${selectedId === object.id ? " class-selected-object" : ""}`);
      attrs(hit, {
        "data-class-object-id": object.id,
        "data-class-object-type": entity ? "entity" : note ? "note" : "package",
        x: b.x - 8,
        y: b.y - 6,
        width: Math.max(30, b.width + 16),
        height: Math.max(24, b.height + 12),
        rx: 5,
        tabindex: 0,
        role: "button",
        "aria-label": `Select ${entity ? entity.kind : note ? "note" : "package"} ${entity?.label ?? note?.text ?? pkg?.label}`,
      });
      hit.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        event.preventDefault();
        const id = (event.currentTarget as Element).getAttribute("data-class-object-id");
        if (id) selectRef.current(id);
      });
      rendered.append(hit);
      if (entity && keyboardConnectFrom && entity.id !== keyboardConnectFrom) hit.classList.add("class-valid-drop");
      if (!entity) continue;
      const h = documentNode("circle");
      h.setAttribute("class", "class-connect-handle");
      attrs(h, { "data-class-connect-from": entity.id, cx: b.x + b.width + 14, cy: b.y + b.height / 2, r: 8 });
      rendered.append(h);
      const moveHandle = documentNode("rect");
      moveHandle.setAttribute("class", "class-move-handle");
      attrs(moveHandle, {
        "data-class-move-id": entity.id,
        x: b.x - 17,
        y: b.y + b.height / 2 - 5,
        width: 10,
        height: 10,
        rx: 2,
        role: "button",
        "aria-label": `Drag to move ${entity.label}`,
      });
      rendered.append(moveHandle);
    }
    for (const pkg of document.packages) {
      const group = [...rendered.querySelectorAll<SVGGElement>("g.cluster[data-qualified-name]")].find((candidate) => {
        const name = norm(candidate.getAttribute("data-qualified-name") ?? "");
        return name === pkg.id || name === norm(pkg.label) || name === norm(pkg.alias ?? "");
      });
      const boundary = group?.querySelector<SVGGraphicsElement>(":scope > rect, :scope > path");
      if (!group || !boundary) continue;
      const drop = boundary.cloneNode(false) as SVGGraphicsElement;
      drop.setAttribute("class", "class-package-drop-hit");
      attrs(drop, { "data-class-object-id": pkg.id, "data-class-object-type": "package", "aria-hidden": "true" });
      group.append(drop);
    }
    for (const group of rendered.querySelectorAll<SVGGElement>("g[data-entity-1][data-entity-2]")) {
      const a =
          entityMap.get(group.getAttribute("data-entity-1") ?? "") ?? norm(group.getAttribute("data-entity-1") ?? ""),
        b = entityMap.get(group.getAttribute("data-entity-2") ?? "") ?? norm(group.getAttribute("data-entity-2") ?? "");
      const relation = document.relationships.find((x) => (x.from === a && x.to === b) || (x.from === b && x.to === a));
      if (!relation) continue;
      for (const path of group.querySelectorAll("path")) {
        const hit = path.cloneNode(false) as SVGPathElement;
        hit.removeAttribute("fill");
        hit.setAttribute(
          "class",
          `class-relationship-hit${selectedId === relation.id ? " class-selected-object" : ""}`,
        );
        attrs(hit, {
          "data-class-object-id": relation.id,
          tabindex: 0,
          role: "button",
          "aria-label": `Select ${relation.kind} relationship`,
        });
        group.append(hit);
      }
      const path = group.querySelector<SVGPathElement>("path");
      if (path && selectedId === relation.id) {
        const length = path.getTotalLength(),
          start = path.getPointAtLength(0),
          end = path.getPointAtLength(length);
        const firstIsFrom = a === relation.from;
        addEndpoint(rendered, start, relation.id, firstIsFrom ? "from" : "to");
        addEndpoint(rendered, end, relation.id, firstIsFrom ? "to" : "from");
      }
    }
  }, [document, keyboardConnectFrom, renderRevision, renderStatus, selectedId, svg]);
  const select = (e: MouseEvent<HTMLDivElement>) => {
    const id = (e.target as Element).closest("[data-class-object-id]")?.getAttribute("data-class-object-id");
    if (id) onSelect(id);
    else onBackgroundSelect();
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    const reconnect = target.closest<SVGGraphicsElement>("[data-class-relationship-endpoint]");
    const h = target.closest<SVGGraphicsElement>("[data-class-connect-from]");
    const moveHandle = target.closest<SVGGraphicsElement>("[data-class-move-id]");
    const id =
        reconnect?.getAttribute("data-class-relationship-id") ??
        h?.getAttribute("data-class-connect-from") ??
        moveHandle?.getAttribute("data-class-move-id"),
      kind = reconnect ? "reconnect" : h ? "connect" : "move";
    const svgRoot = (reconnect ?? h ?? moveHandle)?.ownerSVGElement;
    if (!id || !svgRoot) return;
    const p = center((reconnect ?? h ?? moveHandle)!, svgRoot),
      line = documentNode("line");
    if (kind !== "move") {
      line.setAttribute("class", "class-connection-preview");
      attrs(line, { x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      svgRoot.append(line);
    }
    drag.current = {
      id,
      kind,
      ...(reconnect ? { endpoint: reconnect.getAttribute("data-class-relationship-endpoint") as "from" | "to" } : {}),
      x: e.clientX,
      y: e.clientY,
      ...(kind !== "move" ? { line } : {}),
    };
    root.current?.classList.toggle("class-dragging-move", kind === "move");
    root.current?.classList.toggle("class-dragging-connection", kind !== "move");
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const keyboardSelect = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = (event.target as Element).closest<SVGElement>("[data-class-object-id]");
    const id = target?.getAttribute("data-class-object-id");
    const type = target?.getAttribute("data-class-object-type");
    if (!id) return;
    if (event.key.toLowerCase() === "c" && type === "entity") {
      event.preventDefault();
      setKeyboardConnectFrom(id);
      onSelect(id);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (keyboardConnectFrom && type === "entity" && keyboardConnectFrom !== id) {
        onRelationshipCreate(keyboardConnectFrom, id);
        setKeyboardConnectFrom(undefined);
      } else onSelect(id);
      return;
    }
    if (!event.altKey || type !== "entity" || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    const current = document.entities.find((item) => item.id === id);
    if (!current) return;
    const peers = document.entities.filter((item) => item.packageId === current.packageId);
    const index = peers.findIndex((item) => item.id === id);
    const peer = peers[index + (event.key === "ArrowUp" ? -1 : 1)];
    if (!peer) return;
    event.preventDefault();
    onReorder(id, peer.id, event.key === "ArrowUp" ? "before" : "after");
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    window.document
      .querySelectorAll(".class-active-drop")
      .forEach((item) => item.classList.remove("class-active-drop"));
    const hovered = targetAt(root.current, e.clientX, e.clientY);
    if (d?.kind === "move") hovered?.classList.add("class-active-drop");
    if (!d?.line) return;
    const s = d.line.ownerSVGElement;
    const target = targetAt(root.current, e.clientX, e.clientY),
      id = target?.getAttribute("data-class-object-id"),
      anchor = id
        ? root.current?.querySelector<SVGGraphicsElement>(`[data-class-connect-from="${CSS.escape(id)}"]`)
        : undefined,
      p = anchor ? center(anchor, s) : client(s, e.clientX, e.clientY);
    attrs(d.line, { x2: p.x, y2: p.y });
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = undefined;
    d.line?.remove();
    clearDragPresentation();
    const target = targetAt(root.current, e.clientX, e.clientY),
      id = target?.getAttribute("data-class-object-id");
    if (!id || id === d.id || Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 5) return;
    const type = target?.getAttribute("data-class-object-type");
    if (d.kind === "connect" && type === "entity") onRelationshipCreate(d.id, id);
    else if (d.kind === "reconnect" && d.endpoint && type === "entity") onRelationshipReconnect(d.id, d.endpoint, id);
    else if (d.kind === "move" && type === "package") onMoveToPackage(d.id, id);
    else if (d.kind === "move" && type === "entity") {
      const box = target!.getBoundingClientRect();
      onReorder(d.id, id, e.clientY < box.top + box.height / 2 ? "before" : "after");
    }
  };
  const clearDragPresentation = () => {
    root.current?.classList.remove("class-dragging-move", "class-dragging-connection");
    window.document
      .querySelectorAll(".class-active-drop")
      .forEach((item) => item.classList.remove("class-active-drop"));
  };
  return (
    <section className="preview class-preview" aria-label="Class diagram preview">
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
        {document.packages.length > 0 && (
          <div className="class-package-tray" role="group" aria-label="Class containers">
            <span>Containers</span>
            {document.packages.map((item) => (
              <button
                key={item.id}
                type="button"
                data-class-object-id={item.id}
                data-class-object-type="package"
                data-inspector-trigger
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelect(item.id);
                }}
                onClick={(event) => event.stopPropagation()}
              >
                {packagePath(document, item.id)}
              </button>
            ))}
          </div>
        )}
        <span className="usecase-keyboard-help">
          {keyboardConnectFrom
            ? "Choose another class and press Enter · Esc cancels"
            : "Drag an anchor or press C to connect"}
        </span>
      </div>
      <div className="preview-viewport">
        {svg ? (
          <div
            ref={root}
            className="diagram class-diagram"
            style={{ transform: `scale(${zoom})` }}
            onClick={select}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => {
              drag.current?.line?.remove();
              drag.current = undefined;
              clearDragPresentation();
            }}
            onKeyDown={keyboardSelect}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : renderError ? (
          <div className="render-error" role="alert">
            <strong>Could not render this Class diagram.</strong>
            <p>{renderError}</p>
            <button onClick={onRenderRetry}>Retry</button>
          </div>
        ) : (
          <div className="render-placeholder">
            {renderStatus === "rendering" ? "Rendering Class diagram…" : "Enter Class source to render a preview."}
          </div>
        )}
      </div>
    </section>
  );
}
const documentNode = <K extends keyof SVGElementTagNameMap>(n: K) =>
  window.document.createElementNS("http://www.w3.org/2000/svg", n);
const attrs = (e: Element, a: Record<string, string | number>) =>
  Object.entries(a).forEach(([k, v]) => e.setAttribute(k, String(v)));
const norm = (v: string) => v.trim().replace(/^"|"$/g, "").toLowerCase();
const packagePath = (document: ClassDocument, id: string): string => {
  const item = document.packages.find((candidate) => candidate.id === id);
  if (!item) return id;
  return item.parentId ? `${packagePath(document, item.parentId)} / ${item.label}` : item.label;
};
const client = (s: SVGSVGElement | null, x: number, y: number) => {
  const p = s!.createSVGPoint();
  p.x = x;
  p.y = y;
  return p.matrixTransform(s!.getScreenCTM()!.inverse());
};
const center = (e: SVGGraphicsElement, s: SVGSVGElement | null) => {
  const b = e.getBoundingClientRect();
  return client(s, b.left + b.width / 2, b.top + b.height / 2);
};
const targetAt = (_r: HTMLDivElement | null, x: number, y: number) =>
  [
    ...window.document.querySelectorAll<Element>(
      ".class-diagram .class-semantic-hit,.class-diagram .class-package-drop-hit,.class-package-tray [data-class-object-id]",
    ),
  ]
    .reverse()
    .find((e) => {
      const b = e.getBoundingClientRect();
      return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    });
const addEndpoint = (svg: SVGSVGElement, point: DOMPoint, id: string, endpoint: "from" | "to") => {
  const handle = documentNode("circle");
  handle.setAttribute("class", "class-relationship-endpoint");
  attrs(handle, {
    "data-class-relationship-id": id,
    "data-class-relationship-endpoint": endpoint,
    cx: point.x,
    cy: point.y,
    r: 8,
    role: "button",
    "aria-label": `Reconnect ${endpoint} endpoint`,
  });
  svg.append(handle);
};
