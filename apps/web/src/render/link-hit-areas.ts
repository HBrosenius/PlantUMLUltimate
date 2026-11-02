interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Non-overlapping pieces prevent overlapping link cutouts from reopening a hit area. */
export function subtractLinkBounds(bounds: Bounds, holes: readonly Bounds[]): Bounds[] {
  let pieces = [bounds];
  for (const hole of holes)
    pieces = pieces.flatMap((part) => {
      const left = Math.max(part.x, hole.x),
        top = Math.max(part.y, hole.y);
      const right = Math.min(part.x + part.width, hole.x + hole.width);
      const bottom = Math.min(part.y + part.height, hole.y + hole.height);
      if (right <= left || bottom <= top) return [part];
      return [
        { x: part.x, y: part.y, width: part.width, height: top - part.y },
        { x: part.x, y: bottom, width: part.width, height: part.y + part.height - bottom },
        { x: part.x, y: top, width: left - part.x, height: bottom - top },
        { x: right, y: top, width: part.x + part.width - right, height: bottom - top },
      ].filter((piece) => piece.width > 0 && piece.height > 0);
    });
  return pieces;
}
let instance = 0;
const SVG = "http://www.w3.org/2000/svg";

/** Keep links clickable through broad transparent drag targets; retain dedicated edit handles. */
export function preserveDiagramLinkHitAreas(root: Element, hitSelector: string): void {
  for (const svg of root.querySelectorAll<SVGSVGElement>("svg")) {
    const previous = [...svg.querySelectorAll("clipPath[data-diagram-link-hit]")];
    const oldPaths = new Set(previous.map((clip) => `url(#${clip.id})`));
    for (const target of svg.querySelectorAll("[clip-path]")) {
      if (oldPaths.has(target.getAttribute("clip-path")!)) target.removeAttribute("clip-path");
    }
    previous.forEach((clip) => clip.remove());
    const shapes = [
      ...svg.querySelectorAll<SVGGraphicsElement>(
        "a[href] text, a[href] rect, a[href] path, a[href] circle, a[href] ellipse, a[href] line, a[href] polygon, a[href] polyline, a[href] image",
      ),
    ];
    if (!shapes.length) continue;
    const linkedPoints = shapes.flatMap((shape) => {
      try {
        if (!shape.getClientRects().length) return [];
        const matrix = shape.getScreenCTM();
        if (!matrix) return [];
        const b = shape.getBBox();
        return [
          [
            [b.x, b.y],
            [b.x + b.width, b.y],
            [b.x, b.y + b.height],
            [b.x + b.width, b.y + b.height],
          ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix)),
        ];
      } catch {
        return [];
      }
    });
    for (const hit of svg.querySelectorAll<SVGRectElement>(hitSelector)) {
      try {
        const matrix = hit.getScreenCTM();
        if (!matrix) continue;
        const inverse = matrix.inverse(),
          bounds = hit.getBBox();
        const holes = linkedPoints.map((screenPoints) => {
          const points = screenPoints.map((point) => point.matrixTransform(inverse));
          const x = Math.min(...points.map((p) => p.x)) - 1,
            y = Math.min(...points.map((p) => p.y)) - 1;
          return {
            x,
            y,
            width: Math.max(...points.map((p) => p.x)) - x + 1,
            height: Math.max(...points.map((p) => p.y)) - y + 1,
          };
        });
        const pieces = subtractLinkBounds(bounds, holes);
        if (pieces.length === 1 && pieces[0] === bounds) continue;
        let defs = svg.querySelector("defs");
        if (!defs) {
          defs = document.createElementNS(SVG, "defs");
          svg.prepend(defs);
        }
        const clip = document.createElementNS(SVG, "clipPath"),
          id = `diagram-link-hit-${++instance}`;
        clip.setAttribute("id", id);
        clip.setAttribute("data-diagram-link-hit", "true");
        clip.setAttribute("clipPathUnits", "userSpaceOnUse");
        for (const piece of pieces) {
          const rect = document.createElementNS(SVG, "rect");
          for (const [key, value] of Object.entries(piece)) rect.setAttribute(key, String(value));
          clip.append(rect);
        }
        defs.append(clip);
        hit.setAttribute("clip-path", `url(#${id})`);
      } catch {
        /* Some SVG hosts cannot measure geometry until their first layout. */
      }
    }
  }
}
