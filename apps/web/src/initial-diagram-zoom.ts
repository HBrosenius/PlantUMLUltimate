import { MAX_DIAGRAM_ZOOM, MIN_DIAGRAM_ZOOM } from "./diagram-zoom";

/** Fit compact diagrams at natural size; prefer scrolling to making tall timelines or wide diagrams illegible. */
export function initialDiagramZoom(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  intrinsicWidth = width,
): number {
  const naturalZoom = Math.min(MAX_DIAGRAM_ZOOM, intrinsicWidth / width);
  const widthFit = (viewportWidth - 32) / width;
  const heightFit = (viewportHeight - 32) / height;
  const tall = height > width * 2 && heightFit < widthFit * 0.7;
  return Math.max(MIN_DIAGRAM_ZOOM, naturalZoom * 0.75, Math.min(naturalZoom, widthFit, ...(tall ? [] : [heightFit])));
}
