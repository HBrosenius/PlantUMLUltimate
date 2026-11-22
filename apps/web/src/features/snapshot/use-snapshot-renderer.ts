import { useCallback, useEffect, useRef, useState } from "react";
import { rendererLayoutEngineForDiagramKind, useRenderer } from "../../render/use-renderer";
import { SnapshotCancelled, type QueueDiagram, type RenderOutcome } from "./render-queue";

interface Job {
  id: string;
  source: string;
  kind: string;
}

/**
 * A second, private renderer for the snapshot queue. The editor's own renderer is bound to the active
 * tab's source, so it cannot render another diagram without switching tabs. This instance runs the same
 * `useRenderer` pipeline (engine, theme loading, safety checks, sanitising, cache) for whichever diagram
 * the queue hands it, so every diagram goes through exactly the code path the preview uses. It lives only
 * while the snapshot dialog is mounted; its engine frame is removed when the dialog closes.
 */
export function useSnapshotRenderer() {
  const [job, setJob] = useState<Job | undefined>();
  const waiter = useRef<{ job: Job; settle: (outcome: RenderOutcome) => void } | undefined>(undefined);
  // Each diagram renders under its own document id, so an error never inherits another diagram's image.
  const { status, result } = useRenderer(
    job?.source ?? "",
    job !== undefined,
    rendererLayoutEngineForDiagramKind(job?.kind ?? ""),
    job?.id ?? "snapshot-idle",
    { prewarm: true },
  );

  useEffect(() => {
    const current = waiter.current;
    if (!current || !result || result.documentId !== current.job.id || result.source !== current.job.source) return;
    if (result.error) {
      if (status === "error") current.settle({ error: result.error });
    } else if (result.svg) current.settle({ svg: result.svg });
  }, [result, status]);

  const render = useCallback(
    (diagram: QueueDiagram, signal: AbortSignal) =>
      new Promise<RenderOutcome>((resolve, reject) => {
        if (signal.aborted) {
          reject(new SnapshotCancelled());
          return;
        }
        const next: Job = { id: diagram.id, source: diagram.source, kind: diagram.kind };
        const onAbort = () => {
          waiter.current = undefined;
          setJob(undefined);
          reject(new SnapshotCancelled());
        };
        signal.addEventListener("abort", onAbort, { once: true });
        waiter.current = {
          job: next,
          settle: (outcome) => {
            signal.removeEventListener("abort", onAbort);
            waiter.current = undefined;
            resolve(outcome);
          },
        };
        setJob(next);
      }),
    [],
  );
  /** Stops rendering and lets the engine idle. */
  const release = useCallback(() => {
    waiter.current = undefined;
    setJob(undefined);
  }, []);
  return { render, release };
}
