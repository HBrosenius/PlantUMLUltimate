import { useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import {
  ARROW_TYPES,
  ArrowPreview,
  LIFECYCLE_TYPES,
  LifecyclePreview,
  VisualChoiceSelect,
} from "./SequenceMessageInspector";

export interface AddSequenceMessageValue {
  from: string;
  to: string;
  label: string;
  arrow: string;
  modifiers?: string;
  anchor?: string;
}

export function AddSequenceMessageDialog({
  participants,
  onAdd,
  onClose,
}: {
  participants: string[];
  onAdd(value: AddSequenceMessageValue): void;
  onClose(): void;
}) {
  const [from, setFrom] = useState(participants[0] ?? "");
  const [to, setTo] = useState(participants[1] ?? participants[0] ?? "");
  const [label, setLabel] = useState("");
  const [arrow, setArrow] = useState("->");
  const [modifiers, setModifiers] = useState("");
  const [messageKind, setMessageKind] = useState<"standard" | "incoming" | "outgoing" | "found" | "lost">("standard");
  const [anchor, setAnchor] = useState("");
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={dialog}
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add message"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onAdd({
            from: messageKind === "incoming" ? "[" : messageKind === "found" ? "?" : from,
            to: messageKind === "outgoing" ? "]" : messageKind === "lost" ? "?" : to,
            label,
            arrow,
            ...(modifiers ? { modifiers } : {}),
            ...(anchor.trim() ? { anchor } : {}),
          });
        }}
      >
        <h2>Add message</h2>
        <label>
          Message type
          <select
            autoFocus
            value={messageKind}
            onChange={(event) => setMessageKind(event.target.value as typeof messageKind)}
          >
            <option value="standard">Between participants</option>
            <option value="incoming">Incoming from diagram edge</option>
            <option value="outgoing">Outgoing to diagram edge</option>
            <option value="found">Found message</option>
            <option value="lost">Lost message</option>
          </select>
        </label>
        {messageKind !== "incoming" && messageKind !== "found" && (
          <label>
            From
            <input
              required
              list="sequence-participants"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
        )}
        {messageKind !== "outgoing" && messageKind !== "lost" && (
          <label>
            To
            <input required list="sequence-participants" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        )}
        <datalist id="sequence-participants">
          {participants.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <label>
          Arrow
          <VisualChoiceSelect
            ariaLabel="Arrow type"
            value={arrow}
            choices={ARROW_TYPES}
            onChange={setArrow}
            renderPreview={(choice) => <ArrowPreview arrow={choice} />}
          />
        </label>
        <label>
          Lifecycle modifiers
          <VisualChoiceSelect
            ariaLabel="Lifecycle modifiers"
            value={modifiers}
            choices={LIFECYCLE_TYPES}
            onChange={setModifiers}
            renderPreview={(choice) => <LifecyclePreview modifier={choice} />}
          />
        </label>
        <label>
          Message
          <input value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          Anchor
          <input
            value={anchor}
            onChange={(event) => setAnchor(event.target.value)}
            placeholder="Optional Teoz anchor"
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Add message
          </button>
        </div>
      </form>
    </div>
  );
}
