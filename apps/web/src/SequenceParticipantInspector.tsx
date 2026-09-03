import { useEffect, useId, useState } from "react";
import type { SequenceParticipant, SequenceParticipantKind } from "@plantuml-studio/diagram-sequence";
import { ColorField, SharedColorDatalist } from "./ColorField";
import { SequenceParticipantKindSelect } from "./SequenceParticipantKindSelect";

export interface SequenceParticipantInspectorValue {
  kind: SequenceParticipantKind;
  label: string;
  alias: string;
  color: string;
  stereotype: string;
  spotCharacter: string;
  spotColor: string;
  order: number | undefined;
}

function participantValue(participant: SequenceParticipant): SequenceParticipantInspectorValue {
  return {
    kind: participant.kind,
    label: participant.label,
    alias: participant.alias ?? "",
    color: participant.color ?? "",
    stereotype: participant.stereotype ?? "",
    spotCharacter: participant.spotCharacter ?? "",
    spotColor: participant.spotColor ?? "",
    order: participant.order,
  };
}

export function SequenceParticipantInspector({
  participant,
  onApply,
  onDelete,
  onClose,
}: {
  participant: SequenceParticipant;
  onApply(value: SequenceParticipantInspectorValue): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [value, setValue] = useState(() => participantValue(participant));
  const colorListId = useId();
  useEffect(() => setValue(participantValue(participant)), [participant]);
  const update = <K extends keyof SequenceParticipantInspectorValue>(
    key: K,
    next: SequenceParticipantInspectorValue[K],
  ) => setValue((current) => ({ ...current, [key]: next }));
  const nameMissing = !value.label.trim();
  return (
    <aside className="task-inspector sequence-participant-inspector" aria-label="Participant inspector">
      <header>
        <strong>Participant inspector</strong>
        <button onClick={onClose} aria-label="Close participant inspector">
          ×
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply(value);
        }}
      >
        <label>
          Shape
          <SequenceParticipantKindSelect value={value.kind} onChange={(kind) => update("kind", kind)} />
        </label>
        <label>
          Name
          <input
            required
            aria-invalid={nameMissing}
            aria-describedby={nameMissing ? "participant-name-error" : undefined}
            value={value.label}
            onChange={(event) => update("label", event.target.value)}
          />
          {nameMissing && (
            <span id="participant-name-error" className="field-error" role="alert">
              Enter a participant name.
            </span>
          )}
        </label>
        <label>
          Alias
          <input value={value.alias} onChange={(event) => update("alias", event.target.value)} />
        </label>
        <ColorField
          value={value.color}
          onChange={(color) => update("color", color)}
          placeholder="#LightBlue or #f97316"
          namePrefix="#"
          datalistId={colorListId}
        />
        <label>
          Stereotype
          <input
            value={value.stereotype}
            onChange={(event) => update("stereotype", event.target.value)}
            placeholder="Service"
          />
        </label>
        <label>
          Spot character
          <input
            maxLength={1}
            value={value.spotCharacter}
            onChange={(event) => update("spotCharacter", event.target.value)}
            placeholder="C"
          />
        </label>
        <ColorField
          label="Spot color"
          value={value.spotColor}
          onChange={(color) => update("spotColor", color)}
          placeholder="#LightBlue or #ADD1B2"
          namePrefix="#"
          datalistId={colorListId}
        />
        <SharedColorDatalist id={colorListId} namePrefix="#" />
        <label>
          Display order
          <input
            type="number"
            value={value.order ?? ""}
            onChange={(event) => update("order", event.target.value === "" ? undefined : Number(event.target.value))}
          />
        </label>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete participant
          </button>
          <button type="submit" className="primary" disabled={nameMissing}>
            Apply
          </button>
        </div>
      </form>
    </aside>
  );
}
