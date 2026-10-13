// Application limits, shared by export preflight and the canvas allocation guard.
const MAX_SIDE = 16_384;
const MAX_PIXELS = 32_000_000;

export function rasterExportSize(width: number, height: number, scale: number) {
  const pixelWidth = Math.ceil(width * scale);
  const pixelHeight = Math.ceil(height * scale);
  const pixels = pixelWidth * pixelHeight;
  const supported =
    Number.isFinite(width + height + scale + pixels) &&
    width > 0 &&
    height > 0 &&
    scale > 0 &&
    scale <= 10 &&
    pixelWidth <= MAX_SIDE &&
    pixelHeight <= MAX_SIDE &&
    pixels <= MAX_PIXELS;
  return { pixelWidth, pixelHeight, memoryMiB: Math.ceil((pixels * 4) / 1_048_576), supported };
}

export function rasterExportError(width: number, height: number, scale: number): string | undefined {
  if (rasterExportSize(width, height, scale).supported) return;
  const smaller = [3, 2, 1].find((value) => value < scale && rasterExportSize(width, height, value).supported);
  return `Image export exceeds the app limit of 16,384 pixels per side or 32 million pixels in total. ${smaller ? `Choose ${smaller}× scale or export SVG.` : "Export SVG or reduce the diagram size."}`;
}

/** Known absolute SVG dimensions can be checked before the browser decodes the image. */
export function svgRasterDimensions(svg: string): { width: number; height: number } | undefined {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const dimension = (value: string | null) =>
    value && /^\s*\d+(?:\.\d+)?(?:px)?\s*$/.test(value) ? parseFloat(value) : undefined;
  const width = dimension(root.getAttribute("width"));
  const height = dimension(root.getAttribute("height"));
  if (width !== undefined && height !== undefined) return { width, height };
  // Relative sizes and physical units are resolved by the image decoder and checked again there.
  return undefined;
}
