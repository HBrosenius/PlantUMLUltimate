import { useRef, useState } from "react";
import type {
  SequenceFragmentKind,
  SequenceNote,
  SequenceParticipantKind,
  SequenceStructureInput,
} from "@plantuml-studio/diagram-sequence";
import { useDialogFocus } from "./use-dialog-focus";

export type SequenceStructureKind = SequenceStructureInput["kind"];

export function AddSequenceStructureDialog({
  initialKind,
  participants,
  onAdd,
  onClose,
}: {
  initialKind: SequenceStructureKind;
  participants: string[];
  onAdd(value: SequenceStructureInput): void;
  onClose(): void;
}) {
  const [kind, setKind] = useState(initialKind);
  const [label, setLabel] = useState("");
  const [secondary, setSecondary] = useState("");
  const [fragmentKind, setFragmentKind] = useState<SequenceFragmentKind>("alt");
  const [action, setAction] = useState<"activate" | "deactivate" | "destroy">("activate");
  const [participant, setParticipant] = useState(participants[0] ?? "");
  const [secondParticipant, setSecondParticipant] = useState("");
  const [placement, setPlacement] = useState<SequenceNote["placement"]>("over");
  const [color, setColor] = useState("");
  const [pixels, setPixels] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(participants.slice(0, 2));
  const [autonumberCommand, setAutonumberCommand] = useState<"start" | "stop" | "resume" | "increment">("start");
  const [participantKind, setParticipantKind] = useState<SequenceParticipantKind>("participant");
  const [backgroundColor, setBackgroundColor] = useState("");
  const [branchColor, setBranchColor] = useState("");
  const [noteShape, setNoteShape] = useState<SequenceNote["shape"]>("note");
  const [aligned, setAligned] = useState(false);
  const [durationArrow, setDurationArrow] = useState("<->");
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);
  const submit = (): SequenceStructureInput => {
    if (kind === "fragment")
      return {
        kind,
        fragmentKind,
        label,
        ...(fragmentKind === "group" && secondary.trim() ? { secondaryLabel: secondary } : {}),
        ...(color.trim() ? { headerColor: color } : {}),
        ...(backgroundColor.trim() ? { backgroundColor } : {}),
        ...(fragmentKind === "alt" || fragmentKind === "par"
          ? {
              branches: [
                { label: secondary.trim() || "alternative", ...(branchColor.trim() ? { color: branchColor } : {}) },
              ],
            }
          : {}),
      };
    if (kind === "activation")
      return { kind, action, participant, ...(action === "activate" && color.trim() ? { color } : {}) };
    if (kind === "note")
      return {
        kind,
        shape: noteShape,
        aligned,
        placement,
        participants:
          placement === "over"
            ? [participant, secondParticipant].filter(Boolean)
            : placement === "left of" || placement === "right of"
              ? [participant].filter(Boolean)
              : [],
        text: label,
        ...(color.trim() ? { color } : {}),
      };
    if (kind === "space") return { kind, ...(Number(pixels) > 0 ? { pixels: Number(pixels) } : {}) };
    if (kind === "reference")
      return {
        kind,
        participants: [participant, secondParticipant].filter(Boolean),
        text: label,
        multiline: label.includes("\n"),
        ...(color.trim() ? { color } : {}),
      };
    if (kind === "box") return { kind, label, participants: selectedParticipants, ...(color.trim() ? { color } : {}) };
    if (kind === "autonumber")
      return {
        kind,
        command: autonumberCommand,
        ...(Number(pixels) > 0 ? { start: Number(pixels) } : {}),
        ...(secondary.trim() ? { format: secondary } : {}),
      };
    if (kind === "create") return { kind, participantKind, participant: label };
    if (kind === "duration")
      return { kind, fromAnchor: participant, toAnchor: secondParticipant, arrow: durationArrow, label };
    return { kind, label };
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={dialog}
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Add Sequence ${kind}`}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onAdd(submit());
        }}
      >
        <h2>Add Sequence structure</h2>
        <label>
          Structure
          <select autoFocus value={kind} onChange={(event) => setKind(event.target.value as SequenceStructureKind)}>
            <option value="fragment">Combined fragment</option>
            <option value="activation">Lifeline activation</option>
            <option value="note">Note</option>
            <option value="separator">Separator</option>
            <option value="delay">Delay</option>
            <option value="space">Space</option>
            <option value="reference">Reference</option>
            <option value="box">Box</option>
            <option value="autonumber">Autonumber</option>
            <option value="create">Create lifeline</option>
            <option value="return">Return message</option>
            <option value="newpage">Page break</option>
            <option value="duration">Duration between anchors</option>
          </select>
        </label>
        {kind === "fragment" && (
          <>
            <label>
              Fragment type
              <select
                value={fragmentKind}
                onChange={(event) => setFragmentKind(event.target.value as SequenceFragmentKind)}
              >
                {["alt", "opt", "loop", "par", "break", "critical", "group"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Label
              <input value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            {(fragmentKind === "alt" || fragmentKind === "par") && (
              <label>
                Second branch label
                <input value={secondary} onChange={(event) => setSecondary(event.target.value)} />
              </label>
            )}
            {fragmentKind === "group" && (
              <label>
                Secondary label
                <input value={secondary} onChange={(event) => setSecondary(event.target.value)} />
              </label>
            )}
            <label>
              Header color
              <input value={color} onChange={(event) => setColor(event.target.value)} placeholder="#Gold" />
            </label>
            <label>
              Background color
              <input
                value={backgroundColor}
                onChange={(event) => setBackgroundColor(event.target.value)}
                placeholder="#LightBlue"
              />
            </label>
            {(fragmentKind === "alt" || fragmentKind === "par") && (
              <label>
                Second branch color
                <input
                  value={branchColor}
                  onChange={(event) => setBranchColor(event.target.value)}
                  placeholder="#Pink"
                />
              </label>
            )}
          </>
        )}
        {kind === "activation" && (
          <>
            <label>
              Action
              <select value={action} onChange={(event) => setAction(event.target.value as typeof action)}>
                <option value="activate">Activate</option>
                <option value="deactivate">Deactivate</option>
                <option value="destroy">Destroy</option>
              </select>
            </label>
            <ParticipantField
              label="Participant"
              value={participant}
              participants={participants}
              onChange={setParticipant}
            />
            {action === "activate" && (
              <label>
                Color
                <input value={color} onChange={(event) => setColor(event.target.value)} placeholder="#LightBlue" />
              </label>
            )}
          </>
        )}
        {kind === "note" && (
          <>
            <label>
              Shape
              <select value={noteShape} onChange={(event) => setNoteShape(event.target.value as SequenceNote["shape"])}>
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
              <select
                value={placement}
                onChange={(event) => setPlacement(event.target.value as SequenceNote["placement"])}
              >
                {["left", "right", "over", "across", "left of", "right of"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            {(placement === "over" || placement === "left of" || placement === "right of") && (
              <ParticipantField
                label="Participant"
                value={participant}
                participants={participants}
                onChange={setParticipant}
              />
            )}
            {placement === "over" && (
              <ParticipantField
                label="Second participant"
                value={secondParticipant}
                participants={participants}
                onChange={setSecondParticipant}
                optional
              />
            )}
            <label>
              Text
              <textarea required rows={4} value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <label>
              Color
              <input value={color} onChange={(event) => setColor(event.target.value)} />
            </label>
          </>
        )}
        {(kind === "separator" || kind === "delay") && (
          <label>
            {kind === "separator" ? "Label" : "Delay text"}
            <input value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
        )}
        {kind === "space" && (
          <label>
            Pixels
            <input
              type="number"
              min="1"
              value={pixels}
              onChange={(event) => setPixels(event.target.value)}
              placeholder="Default spacing"
            />
          </label>
        )}
        {kind === "reference" && (
          <>
            <ParticipantField
              label="First participant"
              value={participant}
              participants={participants}
              onChange={setParticipant}
            />
            <ParticipantField
              label="Second participant"
              value={secondParticipant}
              participants={participants}
              onChange={setSecondParticipant}
              optional
            />
            <label>
              Reference text
              <textarea required rows={4} value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <label>
              Color
              <input value={color} onChange={(event) => setColor(event.target.value)} placeholder="#LightBlue" />
            </label>
          </>
        )}
        {kind === "box" && (
          <>
            <label>
              Box label
              <input value={label} onChange={(event) => setLabel(event.target.value)} />
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
            <label>
              Color
              <input value={color} onChange={(event) => setColor(event.target.value)} placeholder="#LightBlue" />
            </label>
          </>
        )}
        {kind === "autonumber" && (
          <>
            <label>
              Command
              <select
                value={autonumberCommand}
                onChange={(event) => setAutonumberCommand(event.target.value as typeof autonumberCommand)}
              >
                <option value="start">Start</option>
                <option value="stop">Stop</option>
                <option value="resume">Resume</option>
                <option value="increment">Increment</option>
              </select>
            </label>
            {autonumberCommand === "start" && (
              <label>
                Start number
                <input type="number" value={pixels} onChange={(event) => setPixels(event.target.value)} />
              </label>
            )}
            {autonumberCommand === "start" && (
              <label>
                Format
                <input value={secondary} onChange={(event) => setSecondary(event.target.value)} placeholder="000" />
              </label>
            )}
          </>
        )}
        {kind === "create" && (
          <>
            <label>
              Participant type
              <select
                value={participantKind}
                onChange={(event) => setParticipantKind(event.target.value as SequenceParticipantKind)}
              >
                {["participant", "actor", "boundary", "control", "entity", "database", "collections", "queue"].map(
                  (name) => (
                    <option key={name}>{name}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Name
              <input required value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
          </>
        )}
        {(kind === "return" || kind === "newpage") && (
          <label>
            {kind === "return" ? "Return text" : "Page title"}
            <input value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
        )}
        {kind === "duration" && (
          <>
            <label>
              Start anchor
              <input
                required
                value={participant}
                onChange={(event) => setParticipant(event.target.value)}
                placeholder="start"
              />
            </label>
            <label>
              End anchor
              <input
                required
                value={secondParticipant}
                onChange={(event) => setSecondParticipant(event.target.value)}
                placeholder="end"
              />
            </label>
            <label>
              Arrow
              <input required value={durationArrow} onChange={(event) => setDurationArrow(event.target.value)} />
            </label>
            <label>
              Label
              <input value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Add
          </button>
        </div>
      </form>
    </div>
  );
}

function ParticipantField({
  label,
  value,
  participants,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  participants: string[];
  onChange(value: string): void;
  optional?: boolean;
}) {
  return (
    <label>
      {label}
      <select required={!optional} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{optional ? "None" : "Select participant"}</option>
        {participants.map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
    </label>
  );
}
