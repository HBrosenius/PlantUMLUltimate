import { useEffect, useId, useState } from "react";
import type { UseCaseNote, UseCaseNoteInput } from "@plantuml-studio/diagram-usecase";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";

const valueOf = (note: UseCaseNote): UseCaseNoteInput => ({
  text: note.text,
  placement: note.placement ?? "right",
  ...(note.targetIds[0] ? { targetId: note.targetIds[0] } : {}),
  ...(note.color ? { color: note.color } : {}),
});
export function UseCaseNoteInspector({
  note,
  elements,
  onChange,
  onDelete,
  onClose,
}: {
  note: UseCaseNote;
  elements: Array<{ id: string; label: string }>;
  onChange(value: UseCaseNoteInput): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [value, setValue] = useState(() => valueOf(note));
  const colorListId = useId();
  useEffect(() => setValue(valueOf(note)), [note]);
  const change = <K extends keyof UseCaseNoteInput>(key: K, next: UseCaseNoteInput[K]) => {
    const updated = { ...value, [key]: next };
    setValue(updated);
    onChange(updated);
  };
  return (
    <aside className="task-inspector usecase-note-inspector" aria-label="Use Case note inspector">
      <header>
        <strong>Note inspector</strong>
        <button onClick={onClose} aria-label="Close note inspector">
          ×
        </button>
      </header>
      <form onSubmit={(event) => event.preventDefault()}>
        <label>
          Attached to
          <select value={value.targetId ?? ""} onChange={(event) => change("targetId", event.target.value)}>
            {elements.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Position
          <select
            value={value.placement}
            onChange={(event) => change("placement", event.target.value as UseCaseNoteInput["placement"])}
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </select>
        </label>
        <label>
          Text
          <textarea
            rows={6}
            value={value.text}
            onChange={(event) => setValue((current) => ({ ...current, text: event.target.value }))}
            onBlur={() => value.text.trim() && onChange(value)}
          />
        </label>
        <label>
          Color
          <input
            list={colorListId}
            value={value.color ?? ""}
            onChange={(event) => setValue((current) => ({ ...current, color: event.target.value }))}
            onBlur={() => onChange(value)}
          />
        </label>
        <datalist id={colorListId}>
          {PLANTUML_COLOR_NAMES.map((name) => (
            <option key={name} value={`#${name}`} />
          ))}
        </datalist>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete note
          </button>
        </div>
      </form>
    </aside>
  );
}
