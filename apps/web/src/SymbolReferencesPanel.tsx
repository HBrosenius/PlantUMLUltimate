export interface SymbolReferenceOccurrence {
  value: string;
  range: { from: number; to: number };
  role: "declaration" | "reference";
}

export function SymbolReferencesPanel({
  label,
  source,
  occurrences,
  onSelect,
  onClose,
}: {
  label: string;
  source: string;
  occurrences: readonly SymbolReferenceOccurrence[];
  onSelect(occurrence: SymbolReferenceOccurrence): void;
  onClose(): void;
}) {
  const lines = source.split(/\r?\n/);
  return (
    <aside className="task-inspector symbol-references-panel" aria-label={`References for ${label}`}>
      <header>
        <div>
          <strong>References</strong>
          <small>{label}</small>
        </div>
        <button onClick={onClose} aria-label="Close references">
          ×
        </button>
      </header>
      <p className="reference-count">
        {occurrences.length} occurrence{occurrences.length === 1 ? "" : "s"}
      </p>
      <div className="reference-results" role="list">
        {occurrences.map((occurrence) => {
          const lineNumber = source.slice(0, occurrence.range.from).split(/\r?\n/).length;
          return (
            <button
              type="button"
              role="listitem"
              key={`${occurrence.range.from}:${occurrence.range.to}`}
              onClick={() => onSelect(occurrence)}
            >
              <span>
                Line {lineNumber} · {occurrence.role}
              </span>
              <code>{lines[lineNumber - 1]?.trim() || occurrence.value}</code>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
