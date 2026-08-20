import { useEffect, useMemo, useRef, useState } from "react";
import { filterCommands, type Command } from "@plantuml-studio/editor-core";
import { useDialogFocus } from "./use-dialog-focus";

export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, onClose);
  const matches = useMemo(() => filterCommands(commands, query), [commands, query]);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => setSelected(0), [query]);

  const run = (command: Command | undefined) => {
    if (!command || command.enabled === false) return;
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
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            else if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected((value) => Math.min(matches.length - 1, value + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((value) => Math.max(0, value - 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              run(matches[selected]);
            }
          }}
        />
        <div className="command-list" role="listbox">
          {matches.map((command, index) => (
            <button
              key={command.id}
              role="option"
              aria-selected={index === selected}
              disabled={command.enabled === false}
              className={index === selected ? "selected" : ""}
              onMouseEnter={() => setSelected(index)}
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
