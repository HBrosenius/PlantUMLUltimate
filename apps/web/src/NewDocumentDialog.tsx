import { useRef } from "react";
import type { DiagramKind } from "./model";
import { useDialogFocus } from "./use-dialog-focus";

const OPTIONS: Array<{ kind: DiagramKind; title: string; description: string }> = [
  { kind: "gantt", title: "Gantt diagram", description: "Plan tasks, milestones, dependencies, and resources." },
  {
    kind: "sequence",
    title: "Sequence diagram",
    description: "Model participants, messages, lifelines, and interactions.",
  },
];

export function NewDocumentDialog({ onChoose, onClose }: { onChoose(kind: DiagramKind): void; onClose(): void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialog}
        className="task-dialog new-document-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-document-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="new-document-title">Choose a diagram type</h2>
        <p className="dialog-hint">The editor and visual tools will adapt to the selected diagram.</p>
        <div className="diagram-kind-options">
          {OPTIONS.map((option, index) => (
            <button key={option.kind} type="button" autoFocus={index === 0} onClick={() => onChoose(option.kind)}>
              {option.kind === "sequence" && <span className="diagram-kind-beta" aria-hidden="true">Beta</span>}
              <DiagramKindPreview kind={option.kind} />
              <span className="diagram-kind-copy">
                <strong>{option.title}</strong>
                <span>{option.description}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function DiagramKindPreview({ kind }: { kind: DiagramKind }) {
  return kind === "gantt" ? (
    <svg className="diagram-kind-preview" viewBox="0 0 240 112" aria-hidden="true">
      <defs>
        <linearGradient id="gantt-blue" x1="0" x2="1"><stop stopColor="#60a5fa"/><stop offset="1" stopColor="#2563eb"/></linearGradient>
        <linearGradient id="gantt-violet" x1="0" x2="1"><stop stopColor="#c084fc"/><stop offset="1" stopColor="#7c3aed"/></linearGradient>
      </defs>
      <rect className="preview-canvas" x="1" y="1" width="238" height="110" rx="10" />
      <path className="preview-grid" d="M72 18V96M112 18V96M152 18V96M192 18V96M18 42H222M18 68H222" />
      <text x="18" y="31">Research</text><text x="18" y="57">Design</text><text x="18" y="83">Build</text>
      <rect x="78" y="21" width="55" height="13" rx="6.5" fill="url(#gantt-blue)" />
      <rect x="112" y="47" width="65" height="13" rx="6.5" fill="url(#gantt-violet)" />
      <rect x="154" y="73" width="57" height="13" rx="6.5" fill="url(#gantt-blue)" />
      <path className="preview-link" d="M133 28C144 28 101 53 112 53M177 54C188 54 143 79 154 79" />
      <circle cx="218" cy="79.5" r="5" fill="#f59e0b" />
    </svg>
  ) : (
    <svg className="diagram-kind-preview" viewBox="0 0 240 112" aria-hidden="true">
      <defs><linearGradient id="sequence-card" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#38bdf8"/><stop offset="1" stopColor="#6366f1"/></linearGradient></defs>
      <rect className="preview-canvas" x="1" y="1" width="238" height="110" rx="10" />
      <g className="preview-person"><circle cx="42" cy="21" r="6"/><path d="M42 27v13m-10-7h20M42 40l-8 10m8-10 8 10"/></g>
      <rect x="92" y="13" width="56" height="18" rx="5" fill="url(#sequence-card)"/><text className="preview-light-text" x="120" y="25" textAnchor="middle">API</text>
      <path className="preview-lifeline" d="M42 53V100M120 32V100M200 32V100" />
      <path className="preview-database" d="M176 18c0-7 48-7 48 0v16c0 7-48 7-48 0zM176 18c0 7 48 7 48 0M176 27c0 7 48 7 48 0" />
      <path className="preview-message" d="M44 60H116l-8-5m8 5-8 5M124 78H196l-8-5m8 5-8 5" />
      <path className="preview-return" d="M196 92H46l8-5m-8 5 8 5" />
      <text x="66" y="56">request</text><text x="148" y="74">query</text><text x="102" y="88">result</text>
      <rect x="116" y="54" width="8" height="43" rx="3" fill="#f59e0b" />
    </svg>
  );
}
