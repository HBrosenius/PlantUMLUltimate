import { useEffect, useMemo, useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import type { DiagramOutlineEntry } from "./diagram-outline";

export function DiagramOutlineDialog({
  entries,
  onSelect,
  onClose,
}: {
  entries: readonly DiagramOutlineEntry[];
  onSelect(entry: DiagramOutlineEntry): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const resultButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [activeIndex, setActiveIndex] = useState(0);
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
  useEffect(() => setActiveIndex(0), [kind, query]);

  const moveActive = (next: number) => {
    if (!matches.length) return;
    const index = (next + matches.length) % matches.length;
    setActiveIndex(index);
    resultButtons.current[index]?.scrollIntoView?.({ block: "nearest" });
  };

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
            autoFocus
            data-dialog-autofocus
            type="search"
            aria-label="Search diagram elements"
            placeholder="Search elements…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveActive(activeIndex + 1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveActive(activeIndex - 1);
              } else if (event.key === "Enter" && matches[activeIndex]) {
                event.preventDefault();
                onSelect(matches[activeIndex]);
              }
            }}
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
          {matches.map((entry, index) => (
            <div key={entry.id} role="listitem">
              <button
                ref={(element) => {
                  resultButtons.current[index] = element;
                }}
                data-inspector-trigger
                data-active={index === activeIndex || undefined}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => onSelect(entry)}
              >
                <span>
                  <strong>{entry.label}</strong>
                  <small>
                    {entry.typeLabel}
                    {entry.group ? ` · ${entry.group}` : ""} · Line {entry.line}
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
