import { MAX_DIAGRAM_ZOOM, MIN_DIAGRAM_ZOOM } from "./diagram-zoom";

/** Small diagrams grow to fill the pane, but not into a few giant cells. */
const MAX_AUTO_FIT_ENLARGEMENT = 1.5;

/**
 * Fit compact diagrams at natural size; prefer scrolling to making tall timelines or wide diagrams illegible.
 * With `enlarge`, compact diagrams grow to fill the pane (as the Fit button does; tall timelines keep natural size) instead of stopping at natural size.
 */
export function initialDiagramZoom(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  intrinsicWidth = width,
  enlarge = false,
): number {
  const naturalZoom = Math.min(MAX_DIAGRAM_ZOOM, intrinsicWidth / width);
  const widthFit = (viewportWidth - 32) / width;
  const heightFit = (viewportHeight - 32) / height;
  const tall = height > width * 2 && heightFit < widthFit * 0.7;
  return Math.max(
    MIN_DIAGRAM_ZOOM,
    naturalZoom * 0.75,
    Math.min(
      enlarge && !tall ? Math.max(naturalZoom, MAX_AUTO_FIT_ENLARGEMENT) : naturalZoom,
      widthFit,
      ...(tall ? [] : [heightFit]),
    ),
  );
}
