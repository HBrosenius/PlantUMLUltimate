import { useMemo, useRef, useState } from "react";
import type { DiagramKind } from "./model";
import { formatSource } from "./source-format";
import { useDialogFocus } from "./use-dialog-focus";
const visibleIndent = (line: string) =>
  line.replace(/^[ \t]+/, (whitespace) => whitespace.replaceAll(" ", "·").replaceAll("\t", "→"));
export function FormatSourceDialog({
  source,
  kind,
  current,
  readOnly,
  onApply,
  onClose,
}: {
  source: string;
  kind: DiagramKind;
  current: boolean;
  readOnly: boolean;
  onApply(source: string): boolean;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);
  const result = useMemo(() => formatSource(kind, source), [kind, source]);
  const [limit, setLimit] = useState(200);
  const [error, setError] = useState("");
  return (
    <div className="modal-backdrop">
      <div
        ref={dialog}
        className="task-dialog format-source-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Format source preview"
      >
        <h2>Format source</h2>
        <p>
          Review two-space block indentation, leading statement whitespace and Gantt task separator spacing. Comments,
          multiline text, arrow spelling, labels, blank lines and line endings stay authored. Unsupported syntax leaves
          the whole source unchanged.
        </p>
        <p>Apply creates one change that you can Undo. Dots show leading spaces; arrows show tabs in this diff.</p>
        {!current && <p role="alert">Source or active diagram changed. Close and reopen this preview.</p>}
        {readOnly && <p role="alert">This diagram is read-only.</p>}
        {result.reason && <p role="status">{result.reason}</p>}
        {!!result.changes.length && (
          <>
            <p>{result.changes.length} changed lines</p>
            <ol className="format-source-changes" aria-label="Formatting diff">
              {result.changes.slice(0, limit).map((change) => (
                <li key={change.line}>
                  <strong>Line {change.line}</strong>
                  <pre>
                    <span className="format-removed">− {visibleIndent(change.before)}</span>
                    {"\n"}
                    <span className="format-added">+ {visibleIndent(change.after)}</span>
                  </pre>
                </li>
              ))}
            </ol>
            {result.changes.length > limit && (
              <button onClick={() => setLimit((n) => n + 200)}>Show more changes</button>
            )}
            <details>
              <summary>Full proposed source</summary>
              <pre className="format-full-source">{result.source}</pre>
            </details>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button
            disabled={!current || readOnly || !result.changes.length}
            onClick={() => {
              if (onApply(result.source)) onClose();
              else setError("Formatting could not be applied. Review the source and try again.");
            }}
          >
            Apply formatting
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
