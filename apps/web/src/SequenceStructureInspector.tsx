import { useState } from "react";
import type {
  SequenceActivation,
  SequenceFragment,
  SequenceNote,
  SequenceStructure,
  SequenceStructureInput,
  SequenceTimelineItem,
  SequenceReference,
  SequenceParticipantBox,
  SequenceAutonumber,
  SequenceCreation,
  SequenceParticipantKind,
  SequenceDuration,
} from "@plantuml-studio/diagram-sequence";

export function SequenceStructureInspector({
  structure,
  participants,
  onApply,
  onDelete,
  onClose,
}: {
  structure: SequenceStructure;
  participants: string[];
  onApply(value: SequenceStructureInput): void;
  onDelete(): void;
  onClose(): void;
}) {
  return (
    <aside className="task-inspector sequence-structure-inspector" aria-label="Sequence structure inspector">
      <header>
        <strong>Sequence structure inspector</strong>
        <button onClick={onClose} aria-label="Close Sequence structure inspector">
          ×
        </button>
      </header>
      {isFragment(structure) ? (
        <FragmentForm key={structure.id} structure={structure} onApply={onApply} onDelete={onDelete} />
      ) : isActivation(structure) ? (
        <ActivationForm
          key={structure.id}
          structure={structure}
          participants={participants}
          onApply={onApply}
          onDelete={onDelete}
        />
      ) : isNote(structure) ? (
        <NoteForm
          key={structure.id}
          structure={structure}
          participants={participants}
          onApply={onApply}
          onDelete={onDelete}
        />
      ) : isReference(structure) ? (
        <ReferenceForm structure={structure} participants={participants} onApply={onApply} onDelete={onDelete} />
      ) : isBox(structure) ? (
        <BoxForm structure={structure} participants={participants} onApply={onApply} onDelete={onDelete} />
      ) : isAutonumber(structure) ? (
        <AutonumberForm structure={structure} onApply={onApply} onDelete={onDelete} />
      ) : isCreation(structure) ? (
        <CreationForm structure={structure} onApply={onApply} onDelete={onDelete} />
      ) : isDuration(structure) ? (
        <DurationForm structure={structure} onApply={onApply} onDelete={onDelete} />
      ) : (
        <TimelineForm key={structure.id} structure={structure} onApply={onApply} onDelete={onDelete} />
      )}
    </aside>
  );
}

function DurationForm({
  structure,
  onApply,
  onDelete,
}: {
  structure: SequenceDuration;
  onApply(value: SequenceStructureInput): void;
  onDelete(): void;
}) {
  const [fromAnchor, setFromAnchor] = useState(structure.fromAnchor);
  const [toAnchor, setToAnchor] = useState(structure.toAnchor);
  const [arrow, setArrow] = useState(structure.arrow);
  const [label, setLabel] = useState(structure.label);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply({ kind: "duration", fromAnchor, toAnchor, arrow, label });
      }}
    >
      <label>
        Start anchor
        <input value={fromAnchor} onChange={(event) => setFromAnchor(event.target.value)} />
      </label>
      <label>
        End anchor
        <input value={toAnchor} onChange={(event) => setToAnchor(event.target.value)} />
      </label>
      <label>
        Arrow
        <input value={arrow} onChange={(event) => setArrow(event.target.value)} />
      </label>
      <label>
        Label
        <input value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <Actions onDelete={onDelete} />
    </form>
  );
}

function CreationForm({
  structure,
  onApply,
  onDelete,
}: {
  structure: SequenceCreation;
  onApply(value: SequenceStructureInput): void;
  onDelete(): void;
}) {
  const [participantKind, setParticipantKind] = useState(structure.participantKind);
  const [participant, setParticipant] = useState(structure.participant);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply({ kind: "create", participantKind, participant });
      }}
    >
      <label>
        Participant type
        <select
          value={participantKind}
          onChange={(event) => setParticipantKind(event.target.value as SequenceParticipantKind)}
        >
          {["participant", "actor", "boundary", "control", "entity", "database", "collections", "queue"].map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <label>
        Name
        <input value={participant} onChange={(event) => setParticipant(event.target.value)} />
      </label>
      <Actions onDelete={onDelete} />
    </form>
  );
}

function ReferenceForm({
  structure,
  participants,
  onApply,
  onDelete,
}: {
  structure: SequenceReference;
  participants: string[];
  onApply(value: SequenceStructureInput): void;
  onDelete(): void;
}) {
  const [first, setFirst] = useState(structure.participants[0] ?? participants[0] ?? "");
  const [second, setSecond] = useState(structure.participants[1] ?? "");
  const [text, setText] = useState(structure.text);
  const [color, setColor] = useState(structure.color ?? "");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply({
          kind: "reference",
          participants: [first, second].filter(Boolean),
          text,
          multiline: structure.multiline || text.includes("\n"),
          ...(color.trim() ? { color } : {}),
        });
      }}
    >
      <label>
        First participant
        <select value={first} onChange={(event) => setFirst(event.target.value)}>
          {participants.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <label>
        Second participant
        <select value={second} onChange={(event) => setSecond(event.target.value)}>
          <option value="">None</option>
          {participants.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <label>
        Text
        <textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <label>
        Color
        <input value={color} onChange={(event) => setColor(event.target.value)} />
      </label>
      <Actions onDelete={onDelete} />
    </form>
  );
}

function BoxForm({
  structure,
  participants,
  onApply,
  onDelete,
}: {
  structure: SequenceParticipantBox;
  participants: string[];
  onApply(value: SequenceStructureInput): void;
  onDelete(): void;
}) {
  const [label, setLabel] = useState(structure.label);
  const [color, setColor] = useState(structure.color ?? "");
  const [selectedParticipants, setSelectedParticipants] = useState(structure.participants);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply({ kind: "box", label, participants: selectedParticipants, ...(color.trim() ? { color } : {}) });
      }}
    >
      <label>
        Label
        <input value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <label>
        Color
        <input value={color} onChange={(event) => setColor(event.target.value)} />
      </label>
      <fieldset>
        <legend>Participants</legend>
        {participants.map((name) => (
          <label key={name} className="checkbox-row">
            <input
              type="checkbox"
              checked={selectedParticipants.includes(name)}
              onChange={() =>
                setSelectedParticipants((current) =>
                  current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
                )
              }
            />
            {name}
          </label>
        ))}
      </fieldset>
      <Actions onDelete={onDelete} />
    </form>
  );
}

function AutonumberForm({
  structure,
  onApply,
  onDelete,
}: {
  structure: SequenceAutonumber;
  onApply(value: SequenceStructureInput): void;
  onDelete(): void;
}) {
  const [command, setCommand] = useState(structure.command);
  const [value, setValue] = useState(structure.value.replace(/^inc\s*/i, ""));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply({ kind: "autonumber", command, ...(value.trim() ? { value } : {}) });
      }}
    >
      <label>
        Command
        <select value={command} onChange={(event) => setCommand(event.target.value as typeof command)}>
          <option value="start">Start</option>
          <option value="stop">Stop</option>
          <option value="resume">Resume</option>
          <option value="increment">Increment</option>
        </select>
      </label>
      {command !== "stop" && (
        <label>
          Parameters
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={command === "start" ? '10 5 "000"' : command === "increment" ? "A" : "Optional"}
          />
        </label>
      )}
      <Actions onDelete={onDelete} />
    </form>
  );
}

const Actions = ({ onDelete }: { onDelete(): void }) => (
  <div className="inspector-actions">
    <button type="button" className="danger" onClick={onDelete}>
      Delete
    </button>
    <button type="submit" className="primary">
      Apply
    </button>
  </div>
);

function FragmentForm({
  structure,
  onApply,
  onDelete,
}: {
  structure: SequenceFragment;
  onApply(value: SequenceStructureInput): void;
  onDelete(): void;
}) {
  const [kind, setKind] = useState(structure.kind);
  const [label, setLabel] = useState(structure.label);
  const [secondaryLabel, setSecondaryLabel] = useState(structure.secondaryLabel ?? "");
  const [headerColor, setHeaderColor] = useState(structure.headerColor ?? "");
  const [backgroundColor, setBackgroundColor] = useState(structure.backgroundColor ?? "");
  const [branches, setBranches] = useState<Array<{ label: string; color?: string; originalIndex?: number }>>(
    structure.branches.map((branch, originalIndex) => ({ ...branch, originalIndex })),
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply({
          kind: "fragment",
          fragmentKind: kind,
          label,
          ...(secondaryLabel.trim() ? { secondaryLabel } : {}),
          ...(headerColor.trim() ? { headerColor } : {}),
          ...(backgroundColor.trim() ? { backgroundColor } : {}),
          ...(kind === "alt" || kind === "par" ? { branches } : {}),
        });
      }}
    >
      <label>
        Fragment type
        <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
          {["alt", "opt", "loop", "par", "break", "critical", "group"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        Label
        <input value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      {kind === "group" && (
        <label>
          Secondary label
          <input value={secondaryLabel} onChange={(event) => setSecondaryLabel(event.target.value)} />
        </label>
      )}
      <label>
        Header color
        <input value={headerColor} onChange={(event) => setHeaderColor(event.target.value)} placeholder="#Gold" />
      </label>
      <label>
        Background color
        <input
          value={backgroundColor}
          onChange={(event) => setBackgroundColor(event.target.value)}
          placeholder="#LightBlue"
        />
      </label>
      {(kind === "alt" || kind === "par") && (
        <fieldset>
          <legend>Alternative branches</legend>
          {branches.map((branch, index) => (
            <div className="sequence-branch-row" key={index}>
              <input
                aria-label={`Branch ${index + 2} label`}
                value={branch.label}
                onChange={(event) =>
                  setBranches((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, label: event.target.value } : item,
                    ),
                  )
                }
                placeholder="Label"
              />
              <input
                aria-label={`Branch ${index + 2} color`}
                value={branch.color ?? ""}
                onChange={(event) =>
                  setBranches((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { label: item.label, ...(event.target.value.trim() ? { color: event.target.value } : {}) }
                        : item,
                    ),
                  )
                }
                placeholder="#Pink"
              />
              <button
                type="button"
                aria-label={`Remove branch ${index + 2}`}
                onClick={() => setBranches((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              >
                ×
              </button>
              <button
                type="button"
                aria-label={`Move branch ${index + 2} up`}
                disabled={index === 0}
                onClick={() =>
                  setBranches((current) => {
                    const next = [...current];
                    [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                    return next;
                  })
                }
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move branch ${index + 2} down`}
                disabled={index === branches.length - 1}
                onClick={() =>
                  setBranches((current) => {
                    const next = [...current];
                    [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                    return next;
                  })
                }
              >
                ↓
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setBranches((current) => [...current, { label: "alternative" }])}>
            Add branch
          </button>
        </fieldset>
      )}
      <Actions onDelete={onDelete} />
    </form>
  );
}

function ActivationForm({
  structure,
  participants,
  onApply,
  onDelete,
}: {
  structure: SequenceActivation;
  participants: string[];
  onApply(value: SequenceStructureInput): void;
  onDelete(): void;
}) {
  const [action, setAction] = useState(structure.kind);
  const [participant, setParticipant] = useState(structure.participant);
  const [color, setColor] = useState(structure.color ?? "");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply({
          kind: "activation",
          action,
          participant,
          ...(action === "activate" && color.trim() ? { color } : {}),
        });
      }}
    >
      <label>
        Action
        <select value={action} onChange={(event) => setAction(event.target.value as typeof action)}>
          <option value="activate">Activate</option>
          <option value="deactivate">Deactivate</option>
          <option value="destroy">Destroy</option>
        </select>
      </label>
      <label>
        Participant
        <select value={participant} onChange={(event) => setParticipant(event.target.value)}>
          {participants.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      {action === "activate" && (
        <label>
          Color
          <input value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
      )}
      <Actions onDelete={onDelete} />
    </form>
  );
}

function NoteForm({
  structure,
  participants,
  onApply,
  onDelete,
}: {
  structure: SequenceNote;
  participants: string[];
  onApply(value: SequenceStructureInput): void;
  onDelete(): void;
}) {
  const [placement, setPlacement] = useState(structure.placement);
  const [first, setFirst] = useState(structure.participants[0] ?? participants[0] ?? "");
  const [second, setSecond] = useState(structure.participants[1] ?? "");
  const [text, setText] = useState(structure.text);
  const [color, setColor] = useState(structure.color ?? "");
  const [shape, setShape] = useState(structure.shape);
  const [aligned, setAligned] = useState(structure.aligned);
  const hasParticipant = placement === "over" || placement === "left of" || placement === "right of";
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply({
          kind: "note",
          shape,
          aligned,
          placement,
          participants: hasParticipant ? [first, ...(placement === "over" ? [second] : [])].filter(Boolean) : [],
          text,
          ...(color.trim() ? { color } : {}),
        });
      }}
    >
      <label>
        Shape
        <select value={shape} onChange={(event) => setShape(event.target.value as typeof shape)}>
          <option value="note">Folded note</option>
          <option value="hnote">Hexagonal note</option>
          <option value="rnote">Rectangular note</option>
        </select>
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={aligned} onChange={(event) => setAligned(event.target.checked)} />
        Align with previous note
      </label>
      <label>
        Placement
        <select value={placement} onChange={(event) => setPlacement(event.target.value as typeof placement)}>
          {["left", "right", "over", "across", "left of", "right of"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      {hasParticipant && (
        <label>
          Participant
          <select value={first} onChange={(event) => setFirst(event.target.value)}>
            {participants.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      {placement === "over" && (
        <label>
          Second participant
          <select value={second} onChange={(event) => setSecond(event.target.value)}>
            <option value="">None</option>
            {participants.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        Text
        <textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <label>
        Color
        <input value={color} onChange={(event) => setColor(event.target.value)} />
      </label>
      <Actions onDelete={onDelete} />
    </form>
  );
}

function TimelineForm({
  structure,
  onApply,
  onDelete,
}: {
  structure: SequenceTimelineItem;
  onApply(value: SequenceStructureInput): void;
  onDelete(): void;
}) {
  const [label, setLabel] = useState(structure.label);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply(
          structure.kind === "space"
            ? { kind: "space", ...(Number(label) > 0 ? { pixels: Number(label) } : {}) }
            : { kind: structure.kind, label },
        );
      }}
    >
      <label>
        {structure.kind === "space" ? "Pixels" : "Label"}
        <input
          type={structure.kind === "space" ? "number" : "text"}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </label>
      <Actions onDelete={onDelete} />
    </form>
  );
}

function isFragment(value: SequenceStructure): value is SequenceFragment {
  return value.id.startsWith("fragment-");
}
function isActivation(value: SequenceStructure): value is SequenceActivation {
  return value.id.startsWith("activation-");
}
function isNote(value: SequenceStructure): value is SequenceNote {
  return value.id.startsWith("note-");
}
function isReference(value: SequenceStructure): value is SequenceReference {
  return value.id.startsWith("reference-");
}
function isBox(value: SequenceStructure): value is SequenceParticipantBox {
  return value.id.startsWith("box-");
}
function isAutonumber(value: SequenceStructure): value is SequenceAutonumber {
  return value.id.startsWith("autonumber-");
}
function isCreation(value: SequenceStructure): value is SequenceCreation {
  return value.id.startsWith("creation-");
}
function isDuration(value: SequenceStructure): value is SequenceDuration {
  return value.id.startsWith("duration-");
}
