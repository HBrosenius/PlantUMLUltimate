import type { SequenceParticipantKind } from "@plantuml-studio/diagram-sequence";
import { VisualChoiceSelect } from "./SequenceMessageInspector";

const PARTICIPANT_KINDS: readonly { value: SequenceParticipantKind; label: string }[] = [
  { value: "participant", label: "Participant" },
  { value: "actor", label: "Actor" },
  { value: "boundary", label: "Boundary" },
  { value: "control", label: "Control" },
  { value: "entity", label: "Entity" },
  { value: "database", label: "Database" },
  { value: "collections", label: "Collections" },
  { value: "queue", label: "Queue" },
];

export function SequenceParticipantKindSelect({
  value,
  onChange,
}: {
  value: SequenceParticipantKind;
  onChange(value: SequenceParticipantKind): void;
}) {
  return (
    <VisualChoiceSelect
      ariaLabel="Participant kind"
      value={value}
      choices={PARTICIPANT_KINDS}
      allowCustom={false}
      showSyntax={false}
      onChange={(kind) => onChange(kind as SequenceParticipantKind)}
      renderPreview={(kind) => <ParticipantKindPreview kind={kind as SequenceParticipantKind} />}
    />
  );
}

function ParticipantKindPreview({ kind }: { kind: SequenceParticipantKind }) {
  return (
    <svg className="participant-kind-preview" viewBox="0 0 94 30" aria-hidden="true">
      {kind === "participant" && <rect x="27" y="5" width="40" height="20" rx="3" />}
      {kind === "actor" && (
        <>
          <circle cx="47" cy="6" r="4" />
          <path d="M47 10V20M37 14H57M47 20L40 28M47 20L54 28" />
        </>
      )}
      {kind === "boundary" && <><circle cx="49" cy="15" r="10" /><path d="M36 4V26M36 15H39" /></>}
      {kind === "control" && <><circle cx="47" cy="16" r="10" /><path d="M47 6C51 2 56 3 58 6M58 6L54 5M58 6L56 2" /></>}
      {kind === "entity" && <><circle cx="47" cy="13" r="10" /><path d="M35 27H59" /></>}
      {kind === "database" && <><path d="M28 8C28 2 66 2 66 8V22C66 28 28 28 28 22Z" /><path d="M28 8C28 14 66 14 66 8M28 15C28 21 66 21 66 15" /></>}
      {kind === "collections" && <><rect x="30" y="7" width="38" height="19" rx="2" /><rect x="25" y="3" width="38" height="19" rx="2" /></>}
      {kind === "queue" && <><circle cx="47" cy="15" r="11" /><path d="M38 11H56M38 15H56M38 19H56" /></>}
    </svg>
  );
}
