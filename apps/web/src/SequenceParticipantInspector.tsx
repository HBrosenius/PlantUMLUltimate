import { useEffect, useId, useState } from "react";
import type { SequenceParticipant, SequenceParticipantKind } from "@plantuml-studio/diagram-sequence";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";

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
          <select
            value={value.kind}
            onChange={(event) => update("kind", event.target.value as SequenceParticipantKind)}
          >
            {(
              ["participant", "actor", "boundary", "control", "entity", "database", "collections", "queue"] as const
            ).map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input required value={value.label} onChange={(event) => update("label", event.target.value)} />
        </label>
        <label>
          Alias
          <input value={value.alias} onChange={(event) => update("alias", event.target.value)} />
        </label>
        <label>
          Color
          <input
            list={colorListId}
            autoComplete="off"
            value={value.color}
            onChange={(event) => update("color", event.target.value)}
            placeholder="#LightBlue or #f97316"
          />
        </label>
        <label>Stereotype<input value={value.stereotype} onChange={(event) => update("stereotype", event.target.value)} placeholder="Service" /></label>
        <label>Spot character<input maxLength={1} value={value.spotCharacter} onChange={(event) => update("spotCharacter", event.target.value)} placeholder="C" /></label>
        <label>Spot color<input list={colorListId} autoComplete="off" value={value.spotColor} onChange={(event) => update("spotColor", event.target.value)} placeholder="#LightBlue or #ADD1B2" /></label>
        <datalist id={colorListId}>
          {PLANTUML_COLOR_NAMES.map((name) => <option key={name} value={`#${name}`} />)}
        </datalist>
        <label>Display order<input type="number" value={value.order ?? ""} onChange={(event) => update("order", event.target.value === "" ? undefined : Number(event.target.value))} /></label>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete participant
          </button>
          <button type="submit" className="primary">
            Apply
          </button>
        </div>
      </form>
    </aside>
  );
}
