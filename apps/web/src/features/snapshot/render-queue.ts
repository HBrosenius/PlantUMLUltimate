import type { SharedDocument } from "../../shared-document";
import type { SnapshotRelation } from "./snapshot-html";

export interface QueueDiagram {
  id: string;
  title: string;
  kind: string;
  source: string;
}

export type RenderOutcome = { svg: string } | { error: string };

export interface RenderedDiagram extends QueueDiagram {
  svg?: string | undefined;
  error?: string | undefined;
  /** True when a result that was already current was reused instead of rendering again. */
  reused?: boolean;
}

export interface QueueProgress {
  /** Diagrams finished so far. */
  done: number;
  total: number;
  /** The diagram being rendered now, or undefined once all are done. */
  current?: QueueDiagram | undefined;
}

export interface RenderQueueOptions {
  /** Renders one diagram with the app's normal pipeline. May reject; that becomes an error entry. */
  render: (diagram: QueueDiagram, signal: AbortSignal) => Promise<RenderOutcome>;
  /** Returns an already current SVG for the diagram (the active one), skipping the renderer. */
  reuse?: ((diagram: QueueDiagram) => string | undefined) | undefined;
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: QueueProgress) => void) | undefined;
}

export class SnapshotCancelled extends Error {
  constructor() {
    super("Snapshot cancelled");
    this.name = "SnapshotCancelled";
  }
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Renders every diagram in order, one at a time, so the single renderer is never flooded and the UI
 * stays responsive between diagrams. A diagram that fails becomes an entry with its error message;
 * only cancelling stops the queue (by throwing SnapshotCancelled).
 */
export async function renderDiagramQueue(
  diagrams: readonly QueueDiagram[],
  { render, reuse, signal, onProgress }: RenderQueueOptions,
): Promise<RenderedDiagram[]> {
  const controller = new AbortController();
  const forward = () => controller.abort();
  signal?.addEventListener("abort", forward, { once: true });
  const results: RenderedDiagram[] = [];
  try {
    for (const diagram of diagrams) {
      if (signal?.aborted) throw new SnapshotCancelled();
      onProgress?.({ done: results.length, total: diagrams.length, current: diagram });
      const current = reuse?.(diagram);
      if (current) {
        results.push({ ...diagram, svg: current, reused: true });
        continue;
      }
      try {
        const outcome = await render(diagram, controller.signal);
        if (signal?.aborted) throw new SnapshotCancelled();
        results.push("svg" in outcome ? { ...diagram, svg: outcome.svg } : { ...diagram, error: outcome.error });
      } catch (error) {
        if (error instanceof SnapshotCancelled || signal?.aborted) throw new SnapshotCancelled();
        results.push({ ...diagram, error: error instanceof Error ? error.message : String(error) });
      }
      await yieldToBrowser();
    }
    onProgress?.({ done: results.length, total: diagrams.length });
    return results;
  } finally {
    signal?.removeEventListener("abort", forward);
  }
}

/**
 * Project links between the diagrams of one document. A link joins two elements, and each element
 * belongs to a diagram by document id, so the link becomes a relation between those two diagrams.
 */
export function snapshotRelations(shared: SharedDocument): SnapshotRelation[] {
  const diagramOfElement = new Map<string, number>();
  const index = new Map(shared.diagrams.map((diagram, position) => [diagram.documentId, position]));
  for (const element of shared.elements) {
    const position = index.get(element.documentId);
    if (position !== undefined) diagramOfElement.set(element.id, position);
  }
  return shared.links.flatMap((link) => {
    const from = diagramOfElement.get(link.from);
    const to = diagramOfElement.get(link.to);
    return from === undefined || to === undefined || from === to ? [] : [{ from, to, kind: link.kind }];
  });
}
