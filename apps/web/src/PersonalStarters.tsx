import { useEffect, useMemo, useRef, useState } from "react";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import {
  defaultStarterChoices,
  exportPersonalStarters,
  importPersonalStarters,
  loadPersonalStarters,
  prepareStarterSource,
  removePersonalStarter,
  savePersonalStarter,
  type PersonalStarter,
} from "./personal-starters";
import { downloadText } from "./file-service";
import { useDialogFocus } from "./use-dialog-focus";
import type { DiagramKind } from "./model";
import type { StarterExample } from "./starter-examples";

function StarterReview({
  kind,
  source,
  action,
  onAccept,
  busy = false,
  actionError,
}: {
  kind: DiagramKind;
  source: string;
  action: string;
  onAccept(source: string): void;
  busy?: boolean;
  actionError?: string | undefined;
}) {
  const [draft, setDraft] = useState(source);
  const errorElement = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (actionError) errorElement.current?.scrollIntoView({ block: "center" });
  }, [actionError]);
  const [choices, setChoices] = useState(defaultStarterChoices);
  const prepared = useMemo(() => {
    try {
      return { source: prepareStarterSource(kind, draft, choices) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Invalid starter source." };
    }
  }, [choices, draft, kind]);
  const dates = [...new Set(draft.match(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/g) ?? [])];
  const resources =
    kind === "gantt"
      ? [
          ...new Set(
            parseGantt(draft).document.tasks.flatMap((task) =>
              (task.resources ?? []).map((resource) => resource.value),
            ),
          ),
        ]
      : [];
  const links = draft.match(/\[\[[\s\S]*?\]\]/g) ?? [];
  return (
    <section className="starter-review" aria-label="Review starter content">
      <h4>Review what carries over</h4>
      <p>
        New diagram and document identities. File access, history, collaboration and integration bindings are not
        copied. Source aliases stay local to the new diagram.
      </p>
      <p>
        Styles and authored content are preserved. Edit the source below to change labels, dates, people, links, or
        other content before continuing.
      </p>
      <dl>
        <dt>Authored dates</dt>
        <dd>{dates.join(", ") || "None"}</dd>
        <dt>Authored task resources</dt>
        <dd>{resources.join(", ") || "None"}</dd>
        <dt>Source links</dt>
        <dd>{links.length ? links.join(" · ") : "None"}</dd>
      </dl>
      {kind === "gantt" && (
        <fieldset>
          <legend>Gantt reuse options</legend>
          <label>
            <input
              type="checkbox"
              checked={choices.keepResources}
              onChange={(event) => setChoices({ ...choices, keepResources: event.target.checked })}
            />
            Keep task resource assignments
          </label>
          <label>
            <input
              type="checkbox"
              checked={choices.keepLinks}
              onChange={(event) => setChoices({ ...choices, keepLinks: event.target.checked })}
            />
            Keep task links
          </label>
          <label>
            New project start (optional)
            <input
              type="date"
              value={choices.projectStart}
              onChange={(event) => setChoices({ ...choices, projectStart: event.target.value })}
            />
          </label>
          <p>
            Changing project start changes only that declaration. Fixed task dates, calendar exceptions and dates in
            text stay as authored. Uncheck options to remove supported task assignments or task links; other links
            remain visible in the preview.
          </p>
        </fieldset>
      )}
      <label>
        Editable starter source
        <textarea
          aria-label="Editable starter source"
          rows={8}
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <details>
        <summary>Source to use</summary>
        <pre>{prepared.source ?? "Correct the source to see the result."}</pre>
      </details>
      {prepared.error && <p role="alert">{prepared.error}</p>}
      {actionError && (
        <p role="alert" ref={errorElement}>
          {actionError}
        </p>
      )}
      <button
        type="button"
        disabled={busy || !prepared.source}
        onClick={() => prepared.source && onAccept(prepared.source)}
      >
        {action}
      </button>
    </section>
  );
}

export function SaveStarterDialog({
  kind,
  source,
  name,
  onClose,
}: {
  kind: DiagramKind;
  source: string;
  name: string;
  onClose(): void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const [title, setTitle] = useState(name);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string>();
  useDialogFocus(dialog, onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Save as personal starter"
        className="task-dialog personal-starter-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>Save as personal starter</h2>
        <p>Stored in this browser. Export the library from File → New to keep a portable copy.</p>
        <label>
          Starter name
          <input
            autoFocus
            data-dialog-autofocus
            value={title}
            maxLength={100}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Description
          <input value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <StarterReview
          kind={kind}
          source={source}
          action="Save starter"
          actionError={error}
          onAccept={(prepared) => {
            try {
              savePersonalStarter({ title, description, kind, source: prepared });
              onClose();
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : "Could not save starter.");
            }
          }}
        />
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

export function PersonalStarterLibrary({ onChoose, busy }: { onChoose(example: StarterExample): void; busy: boolean }) {
  const [library, setLibrary] = useState(() => {
    try {
      return { entries: loadPersonalStarters(), error: "" };
    } catch (error) {
      return {
        entries: [] as PersonalStarter[],
        error: error instanceof Error ? error.message : "Could not load starters.",
      };
    }
  });
  const [selected, setSelected] = useState<PersonalStarter>();
  const input = useRef<HTMLInputElement>(null);
  const attempt = (action: () => PersonalStarter[]) => {
    try {
      setLibrary({ entries: action(), error: "" });
    } catch (error) {
      setLibrary((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Could not update starters.",
      }));
    }
  };
  return (
    <section
      id="personal-starters"
      className="diagram-kind-section personal-starter-library"
      aria-label="Personal starters"
    >
      <h3>Personal starters</h3>
      <p>
        Save the current diagram through File → Save as starter…. Review a saved source before creating an independent
        diagram.
      </p>
      <div className="starter-library-actions">
        <button type="button" disabled={busy} onClick={() => input.current?.click()}>
          Import starters…
        </button>
        <button
          type="button"
          disabled={busy || !library.entries.length}
          onClick={() =>
            downloadText(exportPersonalStarters(library.entries), "personal-starters.json", "application/json")
          }
        >
          Export starters
        </button>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept=".json,application/json"
        aria-label="Import starter library"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          try {
            if (file.size > 2_000_000) throw new Error("Starter library exceeds the 2 MB limit.");
            const text = await file.text();
            attempt(() => importPersonalStarters(text));
          } catch (error) {
            setLibrary((current) => ({
              ...current,
              error: error instanceof Error ? error.message : "Could not read starter library.",
            }));
          }
        }}
      />
      {library.error && <p role="alert">{library.error}</p>}
      {!library.entries.length && <p>No personal starters saved yet.</p>}
      <div className="starter-example-options">
        {library.entries.map((entry) => (
          <article key={entry.id}>
            <strong>{entry.title}</strong>
            <span>
              {entry.kind} · {entry.description}
            </span>
            <button type="button" disabled={busy} onClick={() => setSelected(entry)}>
              Review {entry.title}
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`Remove starter ${entry.title}`}
              onClick={() => {
                attempt(() => removePersonalStarter(entry.id));
                setSelected(undefined);
              }}
            >
              Remove
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <StarterReview
          key={selected.id}
          kind={selected.kind}
          source={selected.source}
          busy={busy}
          action="Create from starter"
          onAccept={(source) => onChoose({ ...selected, source, personal: true })}
        />
      )}
    </section>
  );
}
