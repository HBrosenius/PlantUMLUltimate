import { useEffect, useMemo, useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import { filterDiagramOutline, type DiagramOutlineEntry } from "./diagram-outline";

interface OutlineProps {
  entries: readonly DiagramOutlineEntry[];
  onSelect(entry: DiagramOutlineEntry): void;
  onClose(): void;
  onDock?: (() => void) | undefined;
  onMatches?(entries: readonly DiagramOutlineEntry[]): void;
  title?: string;
  hierarchical?: boolean;
}

export function DiagramOutlineDialog(props: OutlineProps) {
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, props.onClose);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section
        ref={dialog}
        tabIndex={-1}
        className="diagram-outline-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={props.title ?? "Diagram outline"}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <OutlineContent {...props} />
      </section>
    </div>
  );
}

export function DiagramOutlinePanel(props: OutlineProps & { mode: "dock" | "find" }) {
  const { mode, onClose } = props;
  useEffect(() => {
    if (mode !== "find") return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]')
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [mode, onClose]);
  return (
    <aside
      className={`diagram-outline-dialog diagram-outline-${props.mode}`}
      aria-label={props.title ?? "Docked diagram outline"}
      data-inspector-trigger
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
          event.preventDefault();
          event.currentTarget.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          props.onClose();
        }
      }}
    >
      <OutlineContent {...props} hierarchical={props.mode === "dock"} />
    </aside>
  );
}

function OutlineContent({
  entries,
  onSelect,
  onClose,
  onDock,
  onMatches,
  title = "Diagram outline",
  hierarchical = false,
}: OutlineProps) {
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
  const matches = useMemo(() => filterDiagramOutline(entries, query, kind), [entries, kind, query]);
  const [limit, setLimit] = useState(200);
  useEffect(() => setLimit(200), [kind, query]);
  useEffect(() => {
    onMatches?.(query.trim() ? matches : []);
  }, [matches, onMatches, query]);
  useEffect(() => setActiveIndex(0), [kind, query]);

  const moveActive = (next: number) => {
    if (!matches.length) return;
    const index = (next + Math.min(matches.length, limit)) % Math.min(matches.length, limit);
    setActiveIndex(index);
    resultButtons.current[index]?.scrollIntoView?.({ block: "nearest" });
  };

  return (
    <>
      <header>
        <div>
          <h2>{title}</h2>
          <p>Find an element and jump to it in the source and diagram.</p>
        </div>
        {onDock && (
          <button type="button" onClick={onDock}>
            Dock outline
          </button>
        )}
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
        {query && (
          <button
            type="button"
            aria-label="Clear outline search"
            onClick={() => {
              setQuery("");
              search.current?.focus();
            }}
          >
            Clear
          </button>
        )}
        <select aria-label="Filter diagram element type" value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="all">All types</option>
          {types.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
      <div className="diagram-outline-results" role="list" aria-label="Diagram elements">
        {matches.slice(0, limit).map((entry, index) => (
          <div key={entry.id} role="listitem">
            <button
              ref={(element) => {
                resultButtons.current[index] = element;
              }}
              style={hierarchical ? { paddingInlineStart: `${10 + Math.min(entry.depth ?? 0, 8) * 14}px` } : undefined}
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
        {matches.length === 0 && (
          <p>
            {entries.length === 0
              ? "This diagram has no indexed elements."
              : kind === "all"
                ? "No matching elements. Try another name or parent."
                : "No matching elements for this type. Try All types or clear the search."}
          </p>
        )}
        {matches.length > limit && (
          <button type="button" onClick={() => setLimit((value) => value + 200)}>
            Show more results
          </button>
        )}
      </div>
      <footer>
        {matches.length} of {entries.length} elements
      </footer>
    </>
  );
}
