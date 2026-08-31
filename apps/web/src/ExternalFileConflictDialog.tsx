import { useMemo, useRef } from "react";
import { diffVersionSources } from "./version-diff";
import { useDialogFocus } from "./use-dialog-focus";

export function ExternalFileConflictDialog({
  fileName,
  localSource,
  externalSource,
  onReload,
  onKeepLocal,
  onOpenCopy,
  onClose,
}: {
  fileName: string;
  localSource: string;
  externalSource: string;
  onReload(): void;
  onKeepLocal(): void;
  onOpenCopy(): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);
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
