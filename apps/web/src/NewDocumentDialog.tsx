import { PersonalStarterLibrary } from "./PersonalStarters";
import { useRef, useState } from "react";
import type { DiagramKind } from "./model";
import { STARTER_EXAMPLES, type StarterExample } from "./starter-examples";
import { starterSource } from "./use-workspace-documents";
import { useDialogFocus } from "./use-dialog-focus";

const OPTIONS: Array<{ kind: DiagramKind; title: string; description: string }> = [
  { kind: "wbs", title: "WBS diagram", description: "Break a project into visual work packages and deliverables." },
  { kind: "gantt", title: "Gantt diagram", description: "Plan tasks, milestones, dependencies, and resources." },
  {
    kind: "activity",
    title: "Activity diagram",
    description: "Model workflows, decisions, parallel work, loops, partitions, and outcomes.",
  },
  {
    kind: "sequence",
    title: "Sequence diagram",
    description: "Model participants, messages, lifelines, and interactions.",
  },
  {
    kind: "usecase",
    title: "Use Case diagram",
    description: "Model actors, system capabilities, relationships, packages, and requirements.",
  },
  { kind: "class", title: "Class diagram", description: "Design types, members, packages, and relationships." },
  {
    kind: "component",
    title: "Component diagram",
    description: "Describe software components, infrastructure, interfaces, and dependencies.",
  },
];

export function NewDocumentDialog({
  onChoose,
  onChooseExample,
  onClose,
  onOpen,
  onOpenRecent,
  documentName,
  onAddToDocument,
}: {
  onChoose(kind: DiagramKind, name?: string, source?: string): void;
  onChooseExample(example: StarterExample, name?: string): void;
  onClose(): void;
  onOpen?: () => void;
  onOpenRecent?: () => void;
  documentName?: string | undefined;
  onAddToDocument?:
    | ((kind: DiagramKind, name: string, initialSource?: string, preserveStyles?: boolean) => Promise<boolean>)
    | undefined;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [destination, setDestination] = useState(onAddToDocument ? "document" : "separate");
  const [name, setName] = useState("");
  const [content, setContent] = useState("starter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const choose = async (kind: DiagramKind, example?: StarterExample) => {
    if (busy) return;
    const today = new Date();
    const projectStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const initialSource =
      example?.source ??
      (content === "blank"
        ? kind === "gantt"
          ? `@startgantt\nProject starts ${projectStart}\n@endgantt`
          : kind === "wbs"
            ? "@startwbs\n* Project\n@endwbs"
            : kind === "activity"
              ? "@startuml\nstart\nstop\n@enduml"
              : "@startuml\n@enduml"
        : kind === "wbs"
          ? "@startwbs\n* Project\n** Deliverable\n@endwbs"
          : starterSource(kind));
    if (destination !== "document" || !onAddToDocument) {
      if (example) onChooseExample(example, name);
      else onChoose(kind, name, initialSource);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      if (
        await onAddToDocument(
          kind,
          name.trim() || example?.title || `${kindLabel(kind)} diagram`,
          initialSource,
          example?.personal,
        )
      )
        onClose();
      else setError("The diagram could not be added. Check the document and try again.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The diagram could not be added.");
    } finally {
      setBusy(false);
    }
  };
  useDialogFocus(dialog, () => {
    if (!busy) onClose();
  });
  return (
    <div
      className="modal-backdrop"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={dialog}
        className="task-dialog new-document-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a diagram type"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="new-diagram-heading">
          <h2 id="new-document-title">Create a diagram</h2>
          <p>Choose a type or try an example. PlantUML source stays editable.</p>
          {onOpen && (
            <button className="secondary-action" type="button" onClick={onOpen} disabled={busy}>
              Open…
            </button>
          )}
        </header>
        {onOpenRecent && (
          <button type="button" onClick={onOpenRecent} disabled={busy}>
            Recent files & import…
          </button>
        )}
        <nav className="start-routes" aria-label="Start options">
          <a href="#diagram-kind-title">Create</a>
          <a href="#starter-example-title">Try an example</a>
          <a href="#personal-starters">Personal starters</a>
          <a href="#start-learning">Quick tour & what’s new</a>
        </nav>
        <p className="start-preferences">Preferences are available later in More → Settings.</p>
        <section className="diagram-creation-destination">
          <label>
            Start with
            <select value={content} onChange={(event) => setContent(event.target.value)} disabled={busy}>
              <option value="blank">Blank · minimal source</option>
              <option value="starter">Simple starter · editable sample content</option>
            </select>
          </label>
          <label>
            Create in
            <select
              data-dialog-autofocus
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              disabled={busy}
            >
              {onAddToDocument && <option value="document">Add to {documentName}</option>}
              <option value="separate">New separate file</option>
            </select>
          </label>
          <label>
            Diagram name{" "}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Use diagram type or example name"
              disabled={busy}
            />
          </label>
          <p>
            {destination === "document"
              ? `Saved with ${documentName}.`
              : "Creates a separate diagram tab. Save chooses its file name and location."}
          </p>
          {error && <p role="alert">{error}</p>}
        </section>
        <section className="diagram-kind-section" aria-labelledby="diagram-kind-title">
          <div className="diagram-kind-heading">
            <div>
              <h3 id="diagram-kind-title">Choose a diagram</h3>
              <p>The editor and visual tools will adapt to your selection.</p>
            </div>
          </div>
          <div className="diagram-kind-options">
            {OPTIONS.map((option) => (
              <button
                key={option.kind}
                aria-label={option.title}
                type="button"
                disabled={busy}
                onClick={() => void choose(option.kind)}
              >
                <DiagramKindPreview kind={option.kind} />
                <span className="diagram-kind-copy">
                  <strong>{option.title}</strong>
                  <span>{option.description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="diagram-kind-section" aria-labelledby="starter-example-title">
          <div className="diagram-kind-heading">
            <div>
              <h3 id="starter-example-title">Try an example</h3>
              <p>Open a realistic diagram and adapt it to your own project.</p>
            </div>
          </div>
          <div className="starter-example-options">
            {STARTER_EXAMPLES.map((example) => (
              <button key={example.id} type="button" disabled={busy} onClick={() => void choose(example.kind, example)}>
                <DiagramKindPreview kind={example.kind} />
                <span className="starter-example-kind">{kindLabel(example.kind)}</span>
                <strong>{example.title}</strong>
                <span>{example.description}</span>
              </button>
            ))}
          </div>
        </section>
        <PersonalStarterLibrary busy={busy} onChoose={(example) => void choose(example.kind, example)} />
        <details id="start-learning" className="start-learning">
          <summary>Quick tour & what’s new</summary>
          <p>
            Create a diagram or open a file. Use Add to build it, click an item to edit its properties, and use Code /
            Split / Diagram to choose your view.
          </p>
          <p>
            For planning, Plan contains Reports, Forecast and What-if scenarios. Commands finds actions; Outline
            navigates large diagrams.
          </p>
          <p>
            What’s new: named diagrams within documents, clearer save status, report presets for unassigned work, and
            simpler property panels.
          </p>
          <p>Reopen this guide from File → New, or More → Help for workspace and scheduling guidance.</p>
        </details>
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function kindLabel(kind: DiagramKind): string {
  return OPTIONS.find((option) => option.kind === kind)?.title.replace(/ diagram$/, "") ?? kind;
}

export function PlantUmlUltimateLogo() {
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
  if (kind === "wbs")
    return (
      <svg className="diagram-kind-preview" viewBox="0 0 240 112" aria-hidden="true">
        <rect className="preview-canvas" x="1" y="1" width="238" height="110" rx="10" />
        <g fill="none" stroke="#64748b" strokeWidth="1.5">
          <path d="M120 28V48M120 48H58V68M120 48H182V68M58 86V96M182 86V96" />
        </g>
        <g fill="#2563eb">
          <rect x="86" y="10" width="68" height="20" rx="6" />
          <rect x="28" y="67" width="60" height="20" rx="6" />
          <rect x="152" y="67" width="60" height="20" rx="6" />
        </g>
        <g fill="#fff" textAnchor="middle" className="preview-light-labels">
          <text x="120" y="24">
            Project
          </text>
          <text x="58" y="81">
            Plan
          </text>
          <text x="182" y="81">
            Deliver
          </text>
        </g>
      </svg>
    );
  if (kind === "gantt")
    return (
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
    );
  if (kind === "sequence")
    return (
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
  if (kind === "class")
    return (
      <svg className="diagram-kind-preview" viewBox="0 0 240 112" aria-hidden="true">
        <rect className="preview-canvas" x="1" y="1" width="238" height="110" rx="10" />
        <g fill="none" stroke="#64748b">
          <rect x="18" y="15" width="78" height="78" rx="4" />
          <path d="M18 38h78M18 63h78" />
          <rect x="145" y="26" width="76" height="58" rx="4" />
          <path d="M145 49h76M96 52h49m-8-5 8 5-8 5" />
        </g>
        <text x="57" y="30" textAnchor="middle">
          Order
        </text>
        <text x="25" y="53">
          -id: UUID
        </text>
        <text x="25" y="77">
          +submit()
        </text>
        <text x="183" y="42" textAnchor="middle">
          Repository
        </text>
        <text x="153" y="66">
          +save()
        </text>
      </svg>
    );
  if (kind === "component")
    return (
      <svg className="diagram-kind-preview" viewBox="0 0 240 112" aria-hidden="true">
        <rect className="preview-canvas" x="1" y="1" width="238" height="110" rx="10" />
        <g fill="none" stroke="#64748b">
          <rect x="18" y="26" width="72" height="48" rx="5" />
          <rect x="82" y="38" width="14" height="10" />
          <rect x="82" y="54" width="14" height="10" />
          <path d="M96 50h44m-8-5 8 5-8 5" />
          <path d="M148 31c0-8 70-8 70 0v40c0 8-70 8-70 0zM148 31c0 8 70 8 70 0" />
        </g>
        <text x="52" y="54" textAnchor="middle">
          Service
        </text>
        <text x="183" y="57" textAnchor="middle">
          Database
        </text>
      </svg>
    );
  if (kind === "activity")
    return (
      <svg className="diagram-kind-preview" viewBox="0 0 240 112" aria-hidden="true">
        <rect className="preview-canvas" x="1" y="1" width="238" height="110" rx="10" />
        <circle cx="34" cy="56" r="8" fill="#2563eb" />
        <path className="preview-link" d="M42 56H72M130 56h22M196 56h20" />
        <rect x="72" y="39" width="58" height="34" rx="12" fill="#60a5fa" />
        <path d="m174 32 24 24-24 24-24-24z" fill="#c084fc" />
        <circle cx="220" cy="56" r="9" fill="none" stroke="#2563eb" strokeWidth="3" />
        <circle cx="220" cy="56" r="5" fill="#2563eb" />
        <text className="preview-light-text" x="101" y="59" textAnchor="middle">
          Work
        </text>
        <text className="preview-light-text" x="174" y="59" textAnchor="middle">
          OK?
        </text>
      </svg>
    );
  return (
    <svg className="diagram-kind-preview" viewBox="0 0 240 112" aria-hidden="true">
      <defs>
        <linearGradient id="usecase-card" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#14b8a6" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect className="preview-canvas" x="1" y="1" width="238" height="110" rx="10" />
      <rect x="72" y="13" width="150" height="86" rx="8" fill="none" stroke="#94a3b8" />
      <text x="82" y="27">
        Ordering system
      </text>
      <g className="preview-person">
        <circle cx="35" cy="35" r="6" />
        <path d="M35 41v17m-11-10h22M35 58l-8 12m8-12 8 12" />
      </g>
      <text x="22" y="84">
        Customer
      </text>
      <ellipse cx="130" cy="49" rx="42" ry="14" fill="url(#usecase-card)" opacity=".9" />
      <ellipse cx="166" cy="80" rx="42" ry="14" fill="url(#usecase-card)" opacity=".72" />
      <text className="preview-light-text" x="130" y="52" textAnchor="middle">
        Place order
      </text>
      <text className="preview-light-text" x="166" y="83" textAnchor="middle">
        Payment
      </text>
      <path className="preview-message" d="M47 51 87 49m85 13-6 3 4 5m-8-8-18-5" />
      <text x="145" y="65">
        include
      </text>
    </svg>
  );
}
