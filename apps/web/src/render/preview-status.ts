import type { RenderResult, RenderStatus } from "../model";

/** Freshness describes the displayed SVG, independently of parser diagnostics. */
export function previewStatusLabel(
  paused: boolean,
  status: RenderStatus,
  result: RenderResult | undefined,
  source: string,
  documentId: string,
): string {
  if (paused) return "Preview paused";
  const hasPreview = Boolean(result?.svg && result.documentId === documentId);
  const current = hasPreview && result?.source === source;
  if (hasPreview && !current) return "Showing last valid preview";
  if (status === "error" || result?.error) return "Preview failed";
  if (status === "rendering" || !current) return "Rendering…";
  return "Preview current";
}
