import { useEffect, useMemo, useRef, useState } from "react";
import type { SemanticSymbolOccurrence } from "./semantic-symbol-provider";
import { useDialogFocus } from "./use-dialog-focus";
import { buildDiagramOutlineEntries } from "./diagram-outline";
import type { DiagramKind } from "./model";

export function DiagramOutlineDialog({
  source,
  diagramKind,
  occurrences,
  onSelect,
  onClose,
}: {
  source: string;
  diagramKind: DiagramKind;
  occurrences: readonly SemanticSymbolOccurrence[];
  onSelect(occurrence: SemanticSymbolOccurrence): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const entries = useMemo(
    () => buildDiagramOutlineEntries(source, occurrences, diagramKind),
    [diagramKind, occurrences, source],
  );
  const types = useMemo(
    () =>
      [...new Map(entries.map((entry) => [entry.kind, entry.typeLabel])).entries()].map(([value, label]) => ({
        value,
        label,
      })),
    [entries],
  );
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return entries.filter(
      (entry) =>
        (kind === "all" || entry.kind === kind) &&
        (!normalized || `${entry.label} ${entry.typeLabel}`.toLocaleLowerCase().includes(normalized)),
    );
  }, [entries, kind, query]);
  useDialogFocus(dialog, onClose);
  useEffect(() => search.current?.focus(), []);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialog}
        tabIndex={-1}
        className="diagram-outline-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagram-outline-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="diagram-outline-title">Diagram outline</h2>
            <p>Find an element and jump to it in the source and diagram.</p>
          </div>
          <button type="button" aria-label="Close diagram outline" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="diagram-outline-search">
          <input
            ref={search}
            type="search"
            aria-label="Search diagram elements"
            placeholder="Search elements…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label="Filter diagram element type"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">All types</option>
            {types.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div className="diagram-outline-results" role="list" aria-label="Diagram elements">
          {matches.map((entry) => (
            <div key={entry.id} role="listitem">
              <button type="button" onClick={() => onSelect(entry.occurrence)}>
                <span>
                  <strong>{entry.label}</strong>
                  <small>
                    {entry.typeLabel} · Line {entry.line}
                  </small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          ))}
          {matches.length === 0 && <p>No matching elements.</p>}
        </div>
        <footer>
          {matches.length} of {entries.length} elements
        </footer>
      </section>
    </div>
  );
}
