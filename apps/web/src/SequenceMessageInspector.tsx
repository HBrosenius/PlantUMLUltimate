/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from "react";
import type { SequenceMessage } from "@plantuml-studio/diagram-sequence";

export const ARROW_TYPES = [
  { value: "->", label: "Solid message" },
  { value: "-->", label: "Dotted response" },
  { value: "->>", label: "Open arrowhead" },
  { value: "-->>", label: "Dotted open arrowhead" },
  { value: "->x", label: "Lost / destroy head" },
  { value: "-->x", label: "Dotted lost message" },
  { value: "o->", label: "Circle source" },
  { value: "o-->", label: "Dotted circle source" },
  { value: "<->", label: "Bidirectional" },
  { value: "<-->", label: "Dotted bidirectional" },
  { value: "-/", label: "Half head, upper" },
  { value: "-\\", label: "Half head, lower" },
] as const;

export const LIFECYCLE_TYPES = [
  { value: "", label: "No lifecycle change" },
  { value: "++", label: "Activate target" },
  { value: "--", label: "Deactivate source" },
  { value: "**", label: "Create target" },
  { value: "!!", label: "Destroy target" },
] as const;

export interface SequenceMessageInspectorValue {
  from: string;
  to: string;
  arrow: string;
  modifiers: string;
  label: string;
  anchor: string;
}

function messageValue(message: SequenceMessage): SequenceMessageInspectorValue {
  return {
    from: message.from,
    to: message.to,
    arrow: message.arrow,
    modifiers: message.modifiers ?? "",
    label: message.label,
    anchor: message.anchor ?? "",
  };
}

export function SequenceMessageInspector({
  message,
  participants,
  onApply,
  onDelete,
  onClose,
}: {
  message: SequenceMessage;
  participants: string[];
  onApply(value: SequenceMessageInspectorValue): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [value, setValue] = useState(() => messageValue(message));
  useEffect(() => setValue(messageValue(message)), [message]);
  const update = <K extends keyof SequenceMessageInspectorValue>(key: K, next: SequenceMessageInspectorValue[K]) =>
    setValue((current) => ({ ...current, [key]: next }));
  return (
    <aside className="task-inspector sequence-message-inspector" aria-label="Message inspector">
      <header>
        <strong>Message inspector</strong>
        <button onClick={onClose} aria-label="Close message inspector">
          ×
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply(value);
        }}
      >
        <datalist id="message-inspector-participants">
          {participants.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <label>
          From
          <input
            required
            list="message-inspector-participants"
            value={value.from}
            onChange={(event) => update("from", event.target.value)}
          />
        </label>
        <label>
          To
          <input
            required
            list="message-inspector-participants"
            value={value.to}
            onChange={(event) => update("to", event.target.value)}
          />
        </label>
        <label>
          Arrow
          <VisualChoiceSelect
            ariaLabel="Arrow type"
            value={value.arrow}
            choices={ARROW_TYPES}
            onChange={(arrow) => update("arrow", arrow)}
            renderPreview={(arrow) => <ArrowPreview arrow={arrow} />}
          />
        </label>
        <label>
          Lifecycle modifiers
          <VisualChoiceSelect
            ariaLabel="Lifecycle modifiers"
            value={value.modifiers}
            choices={LIFECYCLE_TYPES}
            onChange={(modifiers) => update("modifiers", modifiers)}
            renderPreview={(modifier) => <LifecyclePreview modifier={modifier} />}
          />
        </label>
        <label>
          Message text
          <textarea rows={4} value={value.label} onChange={(event) => update("label", event.target.value)} />
        </label>
        <label>
          Anchor
          <input
            value={value.anchor}
            onChange={(event) => update("anchor", event.target.value)}
            placeholder="Optional Teoz anchor"
          />
        </label>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete message
          </button>
          <button type="submit" className="primary">
            Apply
          </button>
        </div>
      </form>
    </aside>
  );
}

export function VisualChoiceSelect({
  ariaLabel,
  value,
  choices,
  onChange,
  renderPreview,
  allowCustom = true,
  showSyntax = true,
}: {
  ariaLabel: string;
  value: string;
  choices: readonly { value: string; label: string }[];
  onChange(value: string): void;
  renderPreview(value: string): React.ReactNode;
  allowCustom?: boolean | undefined;
  showSyntax?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const known = choices.find((choice) => choice.value === value);
  const [customEditing, setCustomEditing] = useState(!known);
  const selected = known ?? { value, label: value ? "Custom PlantUML syntax" : choices[0]!.label };
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>(".visual-choice-trigger")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);
  return (
    <div className={`visual-choice-select${showSyntax ? "" : " visual-choice-without-syntax"}`} ref={root}>
      <button
        type="button"
        className="visual-choice-trigger"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {renderPreview(selected.value)}
        <span>{selected.label}</span>
        {showSyntax && <code>{selected.value || "none"}</code>}
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="visual-choice-options" role="listbox" aria-label={`${ariaLabel} choices`}>
          {choices.map((choice) => (
            <button
              type="button"
              role="option"
              aria-selected={choice.value === value}
              key={choice.value || "none"}
              onClick={(event) => {
                event.preventDefault();
                onChange(choice.value);
                setCustomEditing(false);
                setOpen(false);
              }}
            >
              {renderPreview(choice.value)}
              <span>{choice.label}</span>
              {showSyntax && <code>{choice.value || "none"}</code>}
            </button>
          ))}
          {allowCustom && (
            <button
              type="button"
              role="option"
              aria-selected={!known}
              onClick={(event) => {
                event.preventDefault();
                setCustomEditing(true);
                setOpen(false);
              }}
            >
              <span className="visual-custom-icon">{`{…}`}</span>
              <span>Custom PlantUML syntax</span>
              <code>edit below</code>
            </button>
          )}
        </div>
      )}
      {allowCustom && (customEditing || !known) && (
        <input
          aria-label={`Custom ${ariaLabel}`}
          required={ariaLabel === "Arrow type"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

export function ArrowPreview({ arrow }: { arrow: string }) {
  const dotted = arrow.includes("--");
  const open = arrow.includes(">>");
  const cross = arrow.endsWith("x");
  const circle = arrow.startsWith("o");
  const bidirectional = arrow.startsWith("<");
  return (
    <svg className="message-choice-preview" viewBox="0 0 94 24" aria-hidden="true">
      {circle && <circle cx="8" cy="12" r="4" />}
      {bidirectional && <path d="M13 7 L5 12 L13 17" />}
      <line x1={circle ? 12 : 7} y1="12" x2="84" y2="12" strokeDasharray={dotted ? "5 4" : undefined} />
      {cross ? (
        <path d="M80 7 L90 17 M90 7 L80 17" />
      ) : open ? (
        <path d="M76 6 L88 12 L76 18" />
      ) : (
        <path className="filled-head" d="M76 6 L89 12 L76 18 Z" />
      )}
    </svg>
  );
}

export function LifecyclePreview({ modifier }: { modifier: string }) {
  return (
    <svg className="message-choice-preview lifecycle-choice-preview" viewBox="0 0 94 24" aria-hidden="true">
      <line x1="10" y1="12" x2="82" y2="12" />
      <path className="filled-head" d="M74 6 L87 12 L74 18 Z" />
      {modifier === "++" && <rect x="57" y="3" width="9" height="18" rx="2" />}
      {modifier === "--" && (
        <>
          <rect x="25" y="3" width="9" height="18" rx="2" />
          <line x1="22" y1="20" x2="37" y2="20" />
        </>
      )}
      {modifier === "**" && <path d="M62 3 V21 M53 12 H71 M56 6 L68 18 M68 6 L56 18" />}
      {modifier === "!!" && <path className="lifecycle-destroy" d="M55 5 L69 19 M69 5 L55 19" />}
    </svg>
  );
}
