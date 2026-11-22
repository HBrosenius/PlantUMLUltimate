import { useEffect, useRef, useState } from "react";
import type { RenderResult } from "../../model";
import type { SharedDocument } from "../../shared-document";
import { useDialogFocus } from "../../use-dialog-focus";
import { renderDiagramQueue, SnapshotCancelled, type QueueProgress, type RenderedDiagram } from "./render-queue";
import { useSnapshotRenderer } from "./use-snapshot-renderer";

type Scope = "document" | "diagram";

export function SnapshotDialog({
  document: shared,
  activeDiagramId,
  activeResult,
  onThisDiagram,
  onDocument,
  onClose,
}: {
  /** The document's diagrams; absent or single when only this diagram can be exported. */
  document: SharedDocument | undefined;
  /** The diagram open in the editor; its current preview is reused instead of rendering it again. */
  activeDiagramId: string | undefined;
  activeResult: RenderResult | undefined;
  onThisDiagram(includeSource: boolean): Promise<void>;
  onDocument(rendered: readonly RenderedDiagram[], includeSource: boolean): Promise<void>;
  onClose(): void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const abort = useRef<AbortController | undefined>(undefined);
  const latestResult = useRef(activeResult);
  latestResult.current = activeResult;
  const { render, release } = useSnapshotRenderer();
  const count = shared?.diagrams.length ?? 1;
  const [scope, setScope] = useState<Scope>(count > 1 ? "document" : "diagram");
  const [includeSource, setIncludeSource] = useState(false);
  const [progress, setProgress] = useState<QueueProgress | undefined>();
  const [error, setError] = useState<string | undefined>();
  const running = progress !== undefined;
  const cancel = () => {
    abort.current?.abort();
    abort.current = undefined;
    release();
    setProgress(undefined);
  };
  const close = () => {
    cancel();
    onClose();
  };
  useDialogFocus(form, close);
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );

  const create = async () => {
    setError(undefined);
    if (scope === "diagram" || !shared) {
      await onThisDiagram(includeSource);
      onClose();
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setProgress({ done: 0, total: shared.diagrams.length });
    try {
      const rendered = await renderDiagramQueue(
        shared.diagrams.map((diagram) => ({
          id: diagram.id,
          title: diagram.name,
          kind: diagram.kind,
          source: diagram.source,
        })),
        {
          render,
          reuse: (diagram) => {
            const current = latestResult.current;
            return diagram.id === activeDiagramId && current?.svg && !current.error && current.source === diagram.source
              ? current.svg
              : undefined;
          },
          signal: controller.signal,
          onProgress: setProgress,
        },
      );
      await onDocument(rendered, includeSource);
      release();
      onClose();
    } catch (cause) {
      if (cause instanceof SnapshotCancelled) return;
      release();
      setProgress(undefined);
      setError(cause instanceof Error ? cause.message : "The snapshot could not be created");
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <form
        ref={form}
        className="task-dialog snapshot-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="snapshot-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (!running) void create();
        }}
      >
        <h2 id="snapshot-dialog-title">Snapshot (HTML)</h2>
        {count > 1 && (
          <fieldset disabled={running}>
            <legend>Include</legend>
            <label>
              <input
                type="radio"
                name="snapshot-scope"
                checked={scope === "document"}
                onChange={() => setScope("document")}
              />
              Whole document ({count} diagrams)
            </label>
            <label>
              <input
                type="radio"
                name="snapshot-scope"
                checked={scope === "diagram"}
                onChange={() => setScope("diagram")}
              />
              This diagram
            </label>
          </fieldset>
        )}
        <label className="snapshot-source-option">
          <input
            type="checkbox"
            checked={includeSource}
            disabled={running}
            onChange={(event) => setIncludeSource(event.target.checked)}
          />
          Include PlantUML source
        </label>
        <p className="fieldset-help">
          {includeSource
            ? "Anyone with the file can download each diagram's source, including notes and comments, and open it in PlantUML Ultimate."
            : "The file holds only the rendered diagrams and a fingerprint of the source, not the source itself."}
        </p>
        {running && progress && (
          <div className="snapshot-progress" role="status" aria-live="polite">
            <progress max={progress.total} value={progress.done} aria-label="Snapshot progress" />
            <p>
              {progress.current
                ? `Rendering diagram ${Math.min(progress.done + 1, progress.total)} of ${progress.total}: ${progress.current.title}`
                : "Building the snapshot"}
            </p>
          </div>
        )}
        {error && (
          <p className="snapshot-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" onClick={running ? cancel : close}>
            Cancel
          </button>
          <button type="submit" disabled={running}>
            Create snapshot
          </button>
        </footer>
      </form>
    </div>
  );
}
