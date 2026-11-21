import { useMemo } from "react";
import { rendererLayoutEngineForDiagramKind, useRenderer } from "../../render/use-renderer";
import { sanitizeSvg } from "../../render/sanitize-svg";
import type { DiagramKind, RenderResult } from "../../model";
import { MAX_AI_SOURCE_BYTES, utf8Length } from "./prompt";

/** A rendered proposal larger than this is refused rather than handed to the page. */
export const MAX_PROPOSAL_SVG_BYTES = 5 * 1024 * 1024;

export type ProposalRenderState =
  { state: "idle" } | { state: "rendering" } | { state: "ok"; svg: string } | { state: "failed"; message: string };

/**
 * Pure interpretation of one render result for `source`. Only a result for exactly this source counts, an
 * oversize SVG fails, and the SVG that is returned has been through the normal sanitiser.
 */
export function interpretProposalRender(
  source: string,
  status: "idle" | "rendering" | "error",
  result: RenderResult | undefined,
): ProposalRenderState {
  if (utf8Length(source) > MAX_AI_SOURCE_BYTES * 2)
    return { state: "failed", message: "The proposal is too large to render." };
  const current = result?.source === source;
  if (current && result?.error) return { state: "failed", message: "The proposal could not be rendered." };
  if (current && result?.svg) {
    if (utf8Length(result.svg) > MAX_PROPOSAL_SVG_BYTES)
      return { state: "failed", message: "The rendered proposal is too large to show." };
    const svg = sanitizeSvg(result.svg);
    if (!svg.includes("<svg")) return { state: "failed", message: "The proposal did not produce a diagram." };
    return { state: "ok", svg };
  }
  if (status === "error") return { state: "failed", message: "The proposal could not be rendered." };
  return { state: status === "rendering" || source ? "rendering" : "idle" };
}

/**
 * Renders a source that is not on screen through its own renderer frame (`useRenderer` creates one per
 * hook instance), so the visible preview is untouched. A new source or `enabled = false` cancels the
 * request in flight through the hook's own request ids and unmount cleanup.
 */
export function useProposalRenderCheck(source: string | undefined, kind: DiagramKind): ProposalRenderState {
  const enabled = source !== undefined;
  const text = source ?? "";
  const { status, result } = useRenderer(text, enabled, rendererLayoutEngineForDiagramKind(kind), "ai-proposal-check");
  return useMemo(
    () => (enabled ? interpretProposalRender(text, status, result) : { state: "idle" as const }),
    [enabled, text, status, result],
  );
}
