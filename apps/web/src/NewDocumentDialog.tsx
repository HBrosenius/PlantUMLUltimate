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
        aria-label="Choose a diagram type"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="welcome-splash">
          <PlantUmlUltimateLogo />
          <div className="welcome-splash-copy">
            <p className="welcome-eyebrow">Visual PlantUML workspace</p>
            <h2 id="new-document-title">PlantUML Ultimate</h2>
            <p>
              Create and maintain diagrams through source code and direct visual editing, with your PlantUML text always
              kept as the source of truth.
            </p>
            <p className="welcome-byline">Created by HBrosenius · Local-first · Runs in your browser</p>
          </div>
        </header>
        <section className="diagram-kind-section" aria-labelledby="diagram-kind-title">
          <div className="diagram-kind-heading">
            <div>
              <h3 id="diagram-kind-title">Choose a diagram</h3>
              <p>The editor and visual tools will adapt to your selection.</p>
            </div>
          </div>
          <div className="diagram-kind-options">
            {OPTIONS.map((option, index) => (
              <button key={option.kind} type="button" autoFocus={index === 0} onClick={() => onChoose(option.kind)}>
                {option.kind === "sequence" && (
                  <span className="diagram-kind-beta" aria-hidden="true">
                    Beta
                  </span>
                )}
                <DiagramKindPreview kind={option.kind} />
                <span className="diagram-kind-copy">
                  <strong>{option.title}</strong>
                  <span>{option.description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function PlantUmlUltimateLogo() {
  return (
    <svg className="welcome-logo" viewBox="0 0 104 104" role="img" aria-label="PlantUML Ultimate logo">
      <defs>
        <linearGradient id="ultimate-logo-surface" x1="12" y1="8" x2="94" y2="98" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563eb" />
          <stop offset="0.58" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="ultimate-logo-bar" x1="30" y1="0" x2="80" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="96" height="96" rx="25" fill="url(#ultimate-logo-surface)" />
      <path
        d="M31 29 20 39l11 10M73 29l11 10-11 10"
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".92"
      />
      <path
        d="M37 39h28M27 59h30M42 78h35"
        fill="none"
        stroke="url(#ultimate-logo-bar)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <circle cx="70" cy="59" r="5" fill="#fbbf24" />
      <path d="M70 64v9h7" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DiagramKindPreview({ kind }: { kind: DiagramKind }) {
  return kind === "gantt" ? (
    <svg className="diagram-kind-preview" viewBox="0 0 240 112" aria-hidden="true">
      <defs>
        <linearGradient id="gantt-blue" x1="0" x2="1">
          <stop stopColor="#60a5fa" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="gantt-violet" x1="0" x2="1">
          <stop stopColor="#c084fc" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect className="preview-canvas" x="1" y="1" width="238" height="110" rx="10" />
      <path className="preview-grid" d="M72 18V96M112 18V96M152 18V96M192 18V96M18 42H222M18 68H222" />
      <text x="18" y="31">
        Research
      </text>
      <text x="18" y="57">
        Design
      </text>
      <text x="18" y="83">
        Build
      </text>
      <rect x="78" y="21" width="55" height="13" rx="6.5" fill="url(#gantt-blue)" />
      <rect x="112" y="47" width="65" height="13" rx="6.5" fill="url(#gantt-violet)" />
      <rect x="154" y="73" width="57" height="13" rx="6.5" fill="url(#gantt-blue)" />
      <path className="preview-link" d="M133 28C144 28 101 53 112 53M177 54C188 54 143 79 154 79" />
      <circle cx="218" cy="79.5" r="5" fill="#f59e0b" />
    </svg>
  ) : (
    <svg className="diagram-kind-preview" viewBox="0 0 240 112" aria-hidden="true">
      <defs>
        <linearGradient id="sequence-card" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect className="preview-canvas" x="1" y="1" width="238" height="110" rx="10" />
      <g className="preview-person">
        <circle cx="42" cy="21" r="6" />
        <path d="M42 27v13m-10-7h20M42 40l-8 10m8-10 8 10" />
      </g>
      <rect x="92" y="13" width="56" height="18" rx="5" fill="url(#sequence-card)" />
      <text className="preview-light-text" x="120" y="25" textAnchor="middle">
        API
      </text>
      <path className="preview-lifeline" d="M42 53V100M120 32V100M200 32V100" />
      <path
        className="preview-database"
        d="M176 18c0-7 48-7 48 0v16c0 7-48 7-48 0zM176 18c0 7 48 7 48 0M176 27c0 7 48 7 48 0"
      />
      <path className="preview-message" d="M44 60H116l-8-5m8 5-8 5M124 78H196l-8-5m8 5-8 5" />
      <path className="preview-return" d="M196 92H46l8-5m-8 5 8 5" />
      <text x="66" y="56">
        request
      </text>
      <text x="148" y="74">
        query
      </text>
      <text x="102" y="88">
        result
      </text>
      <rect x="116" y="54" width="8" height="43" rx="3" fill="#f59e0b" />
    </svg>
  );
}
