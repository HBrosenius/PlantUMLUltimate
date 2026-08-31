import { useEffect, useMemo, useRef, useState } from "react";
import { resolveThreeWayMerge, threeWayMerge } from "./external-file-merge";
import { diffVersionSources } from "./version-diff";
import { useDialogFocus } from "./use-dialog-focus";

export function ExternalFileConflictDialog({
  fileName,
  baseSource,
  localSource,
  externalSource,
  onMerge,
  onReload,
  onKeepLocal,
  onOpenCopy,
  onClose,
}: {
  fileName: string;
  baseSource: string;
  localSource: string;
  externalSource: string;
  onMerge(source: string): void;
  onReload(): void;
  onKeepLocal(): void;
  onOpenCopy(): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);
  const merge = useMemo(
    () => threeWayMerge(baseSource, localSource, externalSource),
    [baseSource, externalSource, localSource],
  );
  const [choices, setChoices] = useState<("local" | "external")[]>(() => merge.conflicts.map(() => "local"));
  const [editedSource, setEditedSource] = useState<string>();
  useEffect(() => {
    setChoices(merge.conflicts.map(() => "local"));
    setEditedSource(undefined);
  }, [merge]);
  const mergedSource = editedSource ?? resolveThreeWayMerge(merge, choices);
  const differences = useMemo(
    () => diffVersionSources(localSource, externalSource).filter((line) => line.kind !== "equal"),
    [externalSource, localSource],
  );

  return (
    <div className="modal-backdrop external-conflict-backdrop" role="presentation">
      <div
        ref={dialog}
        className="external-conflict-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="External file changes"
      >
        <header>
          <div>
            <h2>External changes detected</h2>
            <p>
              <strong>{fileName}</strong> changed outside PlantUML Ultimate while this tab also has local changes.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Check external changes again later">
            ×
          </button>
        </header>
        <div className="external-conflict-labels" aria-hidden="true">
          <strong>Local working copy</strong>
          <strong>External file</strong>
        </div>
        <div className="version-diff external-conflict-diff" role="table" aria-label="External file differences">
          {differences.length ? (
            differences.map((line, index) => (
              <div className={`version-diff-line ${line.kind}`} role="row" key={`${index}-${line.kind}`}>
                <span>{line.leftNumber ?? ""}</span>
                <code>{line.left ?? ""}</code>
                <span>{line.rightNumber ?? ""}</span>
                <code>{line.right ?? ""}</code>
              </div>
            ))
          ) : (
            <p>The file contents are now identical.</p>
          )}
        </div>
        <section className="external-merge" aria-label="Merge external changes">
          <header>
            <div>
              <h3>{merge.conflicts.length ? "Resolve overlapping changes" : "Changes can be merged automatically"}</h3>
              <p>
                {merge.conflicts.length
                  ? `${merge.conflicts.length} overlapping section${merge.conflicts.length === 1 ? "" : "s"} need a choice. You can also edit the final merged source directly.`
                  : "Local and external edits affect different sections. Review the combined source before applying it."}
              </p>
            </div>
          </header>
          {merge.conflicts.map((conflict, index) => (
            <article className="external-merge-conflict" key={index}>
              <strong>Conflict {index + 1}</strong>
              <div>
                <section>
                  <span>Local</span>
                  <pre>{conflict.local.join("\n") || "(deleted)"}</pre>
                  <button
                    type="button"
                    aria-pressed={choices[index] === "local"}
                    onClick={() => {
                      setChoices((current) => current.map((choice, item) => (item === index ? "local" : choice)));
                      setEditedSource(undefined);
                    }}
                  >
                    Use local
                  </button>
                </section>
                <section>
                  <span>External</span>
                  <pre>{conflict.external.join("\n") || "(deleted)"}</pre>
                  <button
                    type="button"
                    aria-pressed={choices[index] === "external"}
                    onClick={() => {
                      setChoices((current) => current.map((choice, item) => (item === index ? "external" : choice)));
                      setEditedSource(undefined);
                    }}
                  >
                    Use external
                  </button>
                </section>
              </div>
            </article>
          ))}
          <label>
            Merged source
            <textarea
              aria-label="Merged source"
              spellCheck={false}
              value={mergedSource}
              onChange={(event) => setEditedSource(event.target.value)}
            />
          </label>
          <button type="button" className="primary external-merge-apply" onClick={() => onMerge(mergedSource)}>
            Apply merged version
          </button>
        </section>
        <p className="external-conflict-warning">
          Reloading saves the local working copy in Version History first. Keeping local changes means the next Save
          will overwrite the external file.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Check again later
          </button>
          <button type="button" onClick={onOpenCopy}>
            Open external as copy
          </button>
          <button type="button" onClick={onKeepLocal}>
            Keep local changes
          </button>
          <button type="button" className="primary" onClick={onReload}>
            Reload external version
          </button>
        </div>
      </div>
    </div>
  );
}
