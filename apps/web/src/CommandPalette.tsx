import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterCommands, type Command } from "@plantuml-studio/editor-core";
import { storageGet } from "./safe-storage";
import { useDialogFocus } from "./use-dialog-focus";

const isEnabled = (command: Command | undefined) => command !== undefined && command.enabled !== false;

/** Index of the next enabled command from `from` in `direction`, or `from` when none exists. */
function nextEnabledCommandIndex(commands: Command[], from: number, direction: 1 | -1): number {
  for (let index = from + direction; index >= 0 && index < commands.length; index += direction) {
    if (isEnabled(commands[index])) return index;
  }
  return from;
}

export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [recentIds] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(storageGet("plantuml-studio.recent-commands") ?? "[]");
      return Array.isArray(saved)
        ? [...new Set(saved.filter((id): id is string => typeof id === "string"))].slice(0, 5)
        : [];
    } catch {
      return [];
    }
  });
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  useDialogFocus(dialog, onClose);
  const recent = useMemo(
    () =>
      query.trim()
        ? []
        : recentIds.flatMap((id) => {
            const command = commands.find((command) => command.id === id && isEnabled(command));
            return command ? [command] : [];
          }),
    [commands, query, recentIds],
  );
  const matches = useMemo(
    () => [...recent, ...filterCommands(commands, query).filter((command) => !recent.includes(command))],
    [commands, query, recent],
  );
  useEffect(() => input.current?.focus(), []);
  useEffect(() => setSelected(0), [query]);
  // Never highlight a disabled command: fall back to the first enabled match (or none).
  const activeIndex = isEnabled(matches[selected]) ? selected : nextEnabledCommandIndex(matches, -1, 1);
  const activeCommand = isEnabled(matches[activeIndex]) ? matches[activeIndex] : undefined;
  const activeId = activeCommand ? optionId(activeIndex) : undefined;
  useEffect(() => {
    if (!activeId) return;
    const option = list.current?.ownerDocument.getElementById(activeId);
    if (typeof option?.scrollIntoView === "function") option.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const run = (command: Command | undefined) => {
    if (!isEnabled(command) || !command) return;
    try {
      localStorage.setItem(
        "plantuml-studio.recent-commands",
        JSON.stringify([command.id, ...recentIds.filter((id) => id !== command.id)].slice(0, 5)),
      );
    } catch {
      /* Commands remain available when storage is blocked. */
    }
    onClose();
    void command.run();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        ref={dialog}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={input}
          value={query}
          placeholder="Type a command…"
          aria-label="Search commands"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            else if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected(nextEnabledCommandIndex(matches, activeIndex, 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected(nextEnabledCommandIndex(matches, activeIndex, -1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              run(activeCommand);
            }
          }}
        />
        <div ref={list} id={listId} className="command-list" role="listbox" aria-label="Commands">
          {recent.length > 0 && (
            <div role="presentation" className="command-section-label">
              Recent commands
            </div>
          )}
          {matches.map((command, index) => (
            <div key={command.id} role="presentation">
              {recent.length > 0 && index === recent.length && (
                <div role="presentation" className="command-section-label">
                  All commands
                </div>
              )}
              <button
                key={command.id}
                id={optionId(index)}
                type="button"
                tabIndex={-1}
                role="option"
                aria-selected={index === activeIndex}
                aria-disabled={command.enabled === false || undefined}
                disabled={command.enabled === false}
                className={index === activeIndex ? "selected" : ""}
                onMouseEnter={() => {
                  if (isEnabled(command)) setSelected(index);
                }}
                onClick={() => run(command)}
              >
                <span className="command-copy">
                  <small>{command.category}</small>
                  <span>{command.label}</span>
                </span>
                {command.shortcut && <kbd>{command.shortcut}</kbd>}
              </button>
            </div>
          ))}
          {!matches.length && <p>No matching commands</p>}
        </div>
      </section>
    </div>
  );
}
