import { useRef } from "react";
import { useDialogFocus } from "../use-dialog-focus";
import { diffVersionSources } from "../version-diff";

export interface LinkedWorkPreview {
  label: string;
  diagrams: { id: string; name: string; before: string; after: string }[];
  warnings: readonly string[];
  apply(): boolean;
}

export function LinkedWorkPreviewDialog({
  preview,
  current,
  onClose,
}: {
  preview: LinkedWorkPreview;
  current: boolean;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);
  return (
    <div className="modal-backdrop">
      <div
        ref={dialog}
        tabIndex={-1}
        className="task-dialog format-source-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="linked-work-preview-title"
      >
        <h2 id="linked-work-preview-title">Review linked work</h2>
        <p>Add {preview.label} and connect its counterpart. Only the diagrams listed below can change.</p>
        {preview.diagrams.map((diagram) => (
          <section key={diagram.id}>
            <h3>{diagram.name}</h3>
            {diagram.before === diagram.after ? (
              <p>Source unchanged</p>
            ) : (
              <div className="version-diff" aria-label={`Changes to ${diagram.name}`}>
                {diffVersionSources(diagram.before, diagram.after)
                  .filter((line) => line.kind !== "equal")
                  .map((line, index) => (
                    <div className={`version-diff-line ${line.kind}`} key={index}>
                      <span>{line.leftNumber ?? ""}</span>
                      <code>{line.left ?? ""}</code>
                      <span>{line.rightNumber ?? ""}</span>
                      <code>{line.right ?? ""}</code>
                    </div>
                  ))}
              </div>
            )}
          </section>
        ))}
        {preview.warnings.map((warning, index) => (
          <p key={index}>{warning}</p>
        ))}
        {!current && <p role="alert">The connected document changed. Cancel and create a fresh preview.</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!current}
            onClick={() => {
              if (preview.apply()) onClose();
            }}
          >
            Apply linked work
          </button>
        </div>
      </div>
    </div>
  );
}
