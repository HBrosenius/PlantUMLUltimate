export interface PlacementRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type DockSide = "below" | "above" | "right" | "left";

const GAP = 10;
const MARGIN = 8;

function overlap(a: PlacementRect, b: PlacementRect): number {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * Chooses where the dock goes: below, above, to the right or to the left of the selection, whichever covers the
 * neighbouring elements least (and stays inside the canvas). Ties keep that order, so the usual place is below.
 * The result is clamped into the canvas.
 */
export function placeDock(
  anchor: PlacementRect,
  dock: { width: number; height: number },
  canvas: { width: number; height: number },
  neighbours: readonly PlacementRect[],
  /** Space the floating view controls need at the bottom of the canvas. */
  bottomReserve = 56,
): { left: number; top: number; side: DockSide } {
  const clampLeft = (left: number) =>
    Math.min(Math.max(MARGIN, left), Math.max(MARGIN, canvas.width - dock.width - MARGIN));
  const clampTop = (top: number) =>
    Math.min(Math.max(MARGIN, top), Math.max(MARGIN, canvas.height - dock.height - MARGIN));
  const centreX = anchor.left + anchor.width / 2 - dock.width / 2;
  const centreY = anchor.top + anchor.height / 2 - dock.height / 2;
  const candidates: Array<{ side: DockSide; left: number; top: number; fits: boolean }> = [
    {
      side: "below",
      left: centreX,
      top: anchor.top + anchor.height + GAP,
      fits: anchor.top + anchor.height + GAP + dock.height + bottomReserve <= canvas.height,
    },
    {
      side: "above",
      left: centreX,
      top: anchor.top - dock.height - GAP,
      fits: anchor.top - dock.height - GAP >= MARGIN,
    },
    {
      side: "right",
      left: anchor.left + anchor.width + GAP,
      top: centreY,
      fits: anchor.left + anchor.width + GAP + dock.width + MARGIN <= canvas.width,
    },
    {
      side: "left",
      left: anchor.left - dock.width - GAP,
      top: centreY,
      fits: anchor.left - dock.width - GAP >= MARGIN,
    },
  ];
  let best: { side: DockSide; left: number; top: number; score: number } | undefined;
  for (const candidate of candidates) {
    const left = clampLeft(candidate.left);
    const top = clampTop(candidate.top);
    const box = { left, top, width: dock.width, height: dock.height };
    // Covering the selection itself is worse than covering a neighbour.
    const score =
      neighbours.reduce((total, rect) => total + overlap(box, rect), 0) +
      overlap(box, anchor) * 4 +
      (candidate.fits ? 0 : 1e6);
    if (!best || score < best.score - 0.5) best = { side: candidate.side, left, top, score };
  }
  return { left: best!.left, top: best!.top, side: best!.side };
}
