import { useId, useRef, useState } from "react";
import type { SequenceParticipantKind } from "@plantuml-studio/diagram-sequence";
import { useDialogFocus } from "./use-dialog-focus";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";
import { SequenceParticipantKindSelect } from "./SequenceParticipantKindSelect";

export interface AddSequenceParticipantValue {
  kind: SequenceParticipantKind;
  label: string;
  alias?: string;
  color?: string;
  stereotype?: string;
  spotCharacter?: string;
  spotColor?: string;
  order?: number;
}

export function AddSequenceParticipantDialog({
  onAdd,
  onClose,
}: {
  onAdd(value: AddSequenceParticipantValue): void;
  onClose(): void;
}) {
  const [kind, setKind] = useState<SequenceParticipantKind>("participant");
  const [label, setLabel] = useState("");
  const [alias, setAlias] = useState("");
  const [color, setColor] = useState("");
  const [stereotype, setStereotype] = useState("");
  const [spotCharacter, setSpotCharacter] = useState("");
  const [spotColor, setSpotColor] = useState("");
  const [order, setOrder] = useState("");
  const colorListId = useId();
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={dialog}
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add participant"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onAdd({
            kind,
            label,
            ...(alias.trim() ? { alias } : {}),
            ...(color.trim() ? { color } : {}),
            ...(stereotype.trim() ? { stereotype } : {}),
            ...(spotCharacter.trim() && spotColor.trim() ? { spotCharacter, spotColor } : {}),
            ...(order !== "" ? { order: Number(order) } : {}),
          });
        }}
      >
        <h2>Add participant</h2>
        <label>
          Shape
          <SequenceParticipantKindSelect value={kind} onChange={setKind} />
        </label>
        <label>
          Name
          <input required value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          Alias
          <input
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            placeholder="Optional source identifier"
          />
        </label>
        <label>
          Color
          <input
            list={colorListId}
            autoComplete="off"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            placeholder="#LightBlue or #f97316"
          />
        </label>
        <label>
          Stereotype
          <input value={stereotype} onChange={(event) => setStereotype(event.target.value)} placeholder="Service" />
        </label>
        <label>
          Spot character
          <input
            maxLength={1}
            value={spotCharacter}
            onChange={(event) => setSpotCharacter(event.target.value)}
            placeholder="C"
          />
        </label>
        <label>
          Spot color
          <input
            list={colorListId}
            autoComplete="off"
            value={spotColor}
            onChange={(event) => setSpotColor(event.target.value)}
            placeholder="#LightBlue or #ADD1B2"
          />
        </label>
        <datalist id={colorListId}>
          {PLANTUML_COLOR_NAMES.map((name) => (
            <option key={name} value={`#${name}`} />
          ))}
        </datalist>
        <label>
          Display order
          <input
            type="number"
            value={order}
            onChange={(event) => setOrder(event.target.value)}
            placeholder="Optional"
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Add participant
          </button>
        </div>
      </form>
    </div>
  );
}
