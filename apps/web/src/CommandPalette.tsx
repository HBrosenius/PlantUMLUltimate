import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterCommands, type Command } from "@plantuml-studio/editor-core";
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
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  useDialogFocus(dialog, onClose);
  const matches = useMemo(() => filterCommands(commands, query), [commands, query]);
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
          {matches.map((command, index) => (
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
              <span>
                <small>{command.category}</small>
                {command.label}
              </span>
              {command.shortcut && <kbd>{command.shortcut}</kbd>}
            </button>
          ))}
          {!matches.length && <p>No matching commands</p>}
        </div>
      </section>
    </div>
  );
}
