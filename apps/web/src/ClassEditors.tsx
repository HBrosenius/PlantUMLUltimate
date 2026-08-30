import { useEffect, useId, useRef, useState } from "react";
import type {
  ClassDocument,
  ClassEntity,
  ClassEntityInput,
  ClassEntityKind,
  ClassMember,
  ClassMemberInput,
  ClassPackage,
  ClassPackageInput,
  ClassRelationship,
  ClassRelationshipInput,
  ClassRelationshipKind,
  ClassNote,
  ClassNoteInput,
} from "@plantuml-studio/diagram-class";
import { useDialogFocus } from "./use-dialog-focus";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";

export function ColorField({
  value,
  onChange,
  onBlur,
  label = "Color",
}: {
  value: string;
  onChange(value: string): void;
  onBlur?(): void;
  label?: string;
}) {
  const id = useId();
  return (
    <label>
      {label}
      <input list={id} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} />
      <datalist id={id}>
        {PLANTUML_COLOR_NAMES.map((color) => (
          <option key={color} value={color} />
        ))}
      </datalist>
    </label>
  );
}
const kinds: ClassEntityKind[] = ["class", "abstract", "interface", "enum", "annotation"];
export function AddClassEntityDialog({ onAdd, onClose }: { onAdd(v: ClassEntityInput): void; onClose(): void }) {
  const [kind, setKind] = useState<ClassEntityKind>("class"),
    [label, setLabel] = useState(""),
    [alias, setAlias] = useState(""),
    [generic, setGeneric] = useState(""),
    [stereotype, setStereotype] = useState(""),
    [color, setColor] = useState(""),
    [members, setMembers] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  useDialogFocus(ref, onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={ref}
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add Class object"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onAdd({
            kind,
            label,
            ...(alias ? { alias } : {}),
            ...(generic ? { generic } : {}),
            ...(stereotype ? { stereotype } : {}),
            ...(color ? { color } : {}),
            members: members.split("\n").filter(Boolean),
          });
        }}
      >
        <h2>Add Class object</h2>
        <label>
          Type
          <select
            aria-label="Class object type"
            value={kind}
            onChange={(e) => setKind(e.target.value as ClassEntityKind)}
          >
            {kinds.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input autoFocus required value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label>
          Alias
          <input value={alias} onChange={(e) => setAlias(e.target.value)} />
        </label>
        <label>
          Generic type
          <input value={generic} onChange={(e) => setGeneric(e.target.value)} />
        </label>
        <label>
          Stereotype
          <input value={stereotype} onChange={(e) => setStereotype(e.target.value)} />
        </label>
        <ColorField value={color} onChange={setColor} />
        <label>
          Members
          <textarea
            rows={7}
            value={members}
            onChange={(e) => setMembers(e.target.value)}
            placeholder={"-id: UUID\n+save(): void"}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Add object
          </button>
        </div>
      </form>
    </div>
  );
}
const entityValue = (x: ClassEntity): ClassEntityInput => ({
  kind: x.kind,
  label: x.label,
  ...(x.alias ? { alias: x.alias } : {}),
  ...(x.generic ? { generic: x.generic } : {}),
  ...(x.stereotype ? { stereotype: x.stereotype } : {}),
  ...(x.color ? { color: x.color } : {}),
  members: x.members.map((m) => m.text),
});
export function ClassEntityInspector({
  entity,
  entities,
  packages,
  onChange,
  onPackageChange,
  onDelete,
  onMemberAdd,
  onMemberChange,
  onMemberDelete,
  onMemberMove,
  onMemberReveal,
  onClose,
}: {
  entity: ClassEntity;
  entities: ClassEntity[];
  packages: ClassPackage[];
  onChange(v: ClassEntityInput): void;
  onPackageChange(id?: string): void;
  onDelete(): void;
  onMemberAdd(value: ClassMemberInput): void;
  onMemberChange(member: ClassMember, value: ClassMemberInput): void;
  onMemberDelete(member: ClassMember): void;
  onMemberMove(member: ClassMember, direction: -1 | 1): void;
  onMemberReveal(member: ClassMember): void;
  onClose(): void;
}) {
  const [v, setV] = useState(() => entityValue(entity));
  const [newMemberKind, setNewMemberKind] = useState<ClassMemberInput["kind"]>("field");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberType, setNewMemberType] = useState("");
  const typeListId = useId();
  const parameterListId = useId();
  const labelMissing = !v.label.trim();
  useEffect(() => setV(entityValue(entity)), [entity]);
  const save = () => v.label.trim() && onChange(v);
  const typeSuggestions = entities.map((item) => ({
    identity: item.alias ?? item.label,
    label: item.alias ? item.label : undefined,
    parameterName: item.label
      .replace(/[^A-Za-z0-9]+(.)/g, (_match, character: string) => character.toUpperCase())
      .replace(/^[A-Z]/, (character) => character.toLowerCase()),
  }));
  return (
    <aside className="task-inspector usecase-element-inspector" aria-label="Class object inspector">
      <header>
        <div>
          <strong>{entity.kind} inspector</strong>
          <small>Edit identity, members, appearance, and package</small>
        </div>
        <button onClick={onClose}>×</button>
      </header>
      <form onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Identity</legend>
          <label>
            Type
            <select
              value={v.kind}
              onChange={(e) => {
                const n = { ...v, kind: e.target.value as ClassEntityKind };
                setV(n);
                onChange(n);
              }}
            >
              {kinds.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input
              required
              aria-invalid={labelMissing}
              aria-describedby={labelMissing ? "class-name-error" : undefined}
              value={v.label}
              onChange={(e) => setV({ ...v, label: e.target.value })}
              onBlur={save}
            />
            {labelMissing && (
              <span id="class-name-error" className="field-error" role="alert">
                Enter an object name.
              </span>
            )}
          </label>
          <label>
            Alias
            <input value={v.alias ?? ""} onChange={(e) => setV({ ...v, alias: e.target.value })} onBlur={save} />
          </label>
          <label>
            Generic type
            <input
              list={typeListId}
              value={v.generic ?? ""}
              onChange={(e) => setV({ ...v, generic: e.target.value })}
              onBlur={save}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Members</legend>
          <div className="class-member-list" role="list" aria-label="Class members">
            {entity.members.map((member, index) => (
              <ClassMemberRow
                key={`${member.id}:${member.text}`}
                member={member}
                typeListId={typeListId}
                parameterListId={parameterListId}
                first={index === 0}
                last={index === entity.members.length - 1}
                onChange={(value) => onMemberChange(member, value)}
                onDelete={() => onMemberDelete(member)}
                onMove={(direction) => onMemberMove(member, direction)}
                onReveal={() => onMemberReveal(member)}
              />
            ))}
          </div>
          <div className="class-member-add" role="group" aria-label="Add class member">
            <select
              aria-label="New member kind"
              value={newMemberKind}
              onChange={(event) => setNewMemberKind(event.target.value as ClassMemberInput["kind"])}
            >
              <option value="field">Field</option>
              <option value="method">Method</option>
              <option value="raw">Raw declaration</option>
            </select>
            <input
              aria-label={newMemberKind === "raw" ? "New raw declaration" : "New member name"}
              value={newMemberName}
              onChange={(event) => setNewMemberName(event.target.value)}
              placeholder={newMemberKind === "raw" ? "{static} +value: Type" : "name"}
            />
            {newMemberKind !== "raw" && (
              <input
                aria-label="New member type"
                list={typeListId}
                value={newMemberType}
                onChange={(event) => setNewMemberType(event.target.value)}
                placeholder="type"
              />
            )}
            <button
              type="button"
              disabled={!newMemberName.trim()}
              onClick={() => {
                onMemberAdd(
                  newMemberKind === "raw"
                    ? { kind: "raw", text: newMemberName }
                    : { kind: newMemberKind, name: newMemberName, type: newMemberType },
                );
                setNewMemberName("");
                setNewMemberType("");
              }}
            >
              Add member
            </button>
          </div>
          <datalist id={typeListId}>
            {typeSuggestions.map((item) => (
              <option key={item.identity} value={item.identity} label={item.label} />
            ))}
          </datalist>
          <datalist id={parameterListId}>
            {typeSuggestions.map((item) => (
              <option
                key={item.identity}
                value={`${item.parameterName || "value"}: ${item.identity}`}
                label={item.label}
              />
            ))}
          </datalist>
        </fieldset>
        <fieldset>
          <legend>Appearance</legend>
          <label>
            Stereotype
            <input
              value={v.stereotype ?? ""}
              onChange={(e) => setV({ ...v, stereotype: e.target.value })}
              onBlur={save}
            />
          </label>
          <ColorField value={v.color ?? ""} onChange={(color) => setV({ ...v, color })} onBlur={save} />
        </fieldset>
        <fieldset>
          <legend>Placement</legend>
          <label>
            Package
            <select value={entity.packageId ?? ""} onChange={(e) => onPackageChange(e.target.value || undefined)}>
              <option value="">Outside packages</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete object
          </button>
        </div>
      </form>
    </aside>
  );
}

function memberValue(member: ClassMember): ClassMemberInput {
  return member.kind === "raw"
    ? { kind: "raw", text: member.text }
    : {
        kind: member.kind,
        name: member.name ?? "",
        type: member.type ?? "",
        ...(member.kind === "method" ? { parameters: member.parameters ?? "" } : {}),
        ...(member.visibility ? { visibility: member.visibility } : {}),
        isStatic: member.isStatic,
        isAbstract: member.isAbstract,
      };
}

function ClassMemberRow({
  member,
  typeListId,
  parameterListId,
  first,
  last,
  onChange,
  onDelete,
  onMove,
  onReveal,
}: {
  member: ClassMember;
  typeListId: string;
  parameterListId: string;
  first: boolean;
  last: boolean;
  onChange(value: ClassMemberInput): void;
  onDelete(): void;
  onMove(direction: -1 | 1): void;
  onReveal(): void;
}) {
  const [value, setValue] = useState(() => memberValue(member));
  const apply = (next: ClassMemberInput) => {
    setValue(next);
    onChange(next);
  };
  return (
    <div className="class-member-row" role="listitem">
      <div className="class-member-heading">
        <strong>{member.kind === "raw" ? "Raw member" : member.kind}</strong>
        <button type="button" onClick={onReveal}>
          Reveal
        </button>
        <button type="button" aria-label={`Move ${member.text} up`} disabled={first} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button type="button" aria-label={`Move ${member.text} down`} disabled={last} onClick={() => onMove(1)}>
          ↓
        </button>
        <button type="button" className="danger" aria-label={`Delete ${member.text}`} onClick={onDelete}>
          ×
        </button>
      </div>
      {value.kind === "raw" ? (
        <input
          aria-label="Raw member declaration"
          value={value.text ?? ""}
          onChange={(event) => setValue({ kind: "raw", text: event.target.value })}
          onBlur={() => onChange(value)}
        />
      ) : (
        <div className="class-member-fields">
          <select
            aria-label="Visibility"
            value={value.visibility ?? ""}
            onChange={(event) => {
              const { visibility: _visibility, ...rest } = value;
              apply(
                event.target.value
                  ? { ...rest, visibility: event.target.value as Exclude<ClassMemberInput["visibility"], undefined> }
                  : rest,
              );
            }}
          >
            <option value="">Default</option>
            <option value="+">Public</option>
            <option value="-">Private</option>
            <option value="#">Protected</option>
            <option value="~">Package</option>
          </select>
          <input
            aria-label="Member name"
            value={value.name ?? ""}
            onChange={(event) => setValue({ ...value, name: event.target.value })}
            onBlur={() => onChange(value)}
          />
          {value.kind === "method" && (
            <input
              aria-label="Parameters"
              list={parameterListId}
              value={value.parameters ?? ""}
              onChange={(event) => setValue({ ...value, parameters: event.target.value })}
              onBlur={() => onChange(value)}
            />
          )}
          <input
            aria-label="Member type"
            list={typeListId}
            value={value.type ?? ""}
            onChange={(event) => setValue({ ...value, type: event.target.value })}
            onBlur={() => onChange(value)}
          />
          <label>
            <input
              type="checkbox"
              checked={value.isStatic ?? false}
              onChange={(event) => apply({ ...value, isStatic: event.target.checked })}
            />
            Static
          </label>
          <label>
            <input
              type="checkbox"
              checked={value.isAbstract ?? false}
              onChange={(event) => apply({ ...value, isAbstract: event.target.checked })}
            />
            Abstract
          </label>
        </div>
      )}
    </div>
  );
}
export function AddClassRelationshipDialog({
  document,
  onAdd,
  onClose,
}: {
  document: ClassDocument;
  onAdd(v: ClassRelationshipInput): void;
  onClose(): void;
}) {
  const [from, setFrom] = useState(document.entities[0]?.id ?? ""),
    [to, setTo] = useState(document.entities[1]?.id ?? ""),
    [kind, setKind] = useState<ClassRelationshipKind>("association"),
    [label, setLabel] = useState(""),
    [fromMultiplicity, setFromMultiplicity] = useState(""),
    [toMultiplicity, setToMultiplicity] = useState(""),
    [color, setColor] = useState(""),
    [lineStyle, setLineStyle] = useState<ClassRelationshipInput["lineStyle"]>("solid");
  const ref = useRef<HTMLFormElement>(null);
  useDialogFocus(ref, onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={ref}
        className="task-dialog"
        role="dialog"
        aria-label="Add Class relationship"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onAdd({
            from,
            to,
            kind,
            ...(label ? { label } : {}),
            ...(fromMultiplicity ? { fromMultiplicity } : {}),
            ...(toMultiplicity ? { toMultiplicity } : {}),
            ...(color ? { color } : {}),
            ...(lineStyle ? { lineStyle } : {}),
          });
        }}
      >
        <h2>Add relationship</h2>
        <label>
          From
          <select aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)}>
            {document.entities.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <select aria-label="To" value={to} onChange={(e) => setTo(e.target.value)}>
            {document.entities.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relationship
          <select
            aria-label="Relationship"
            value={kind}
            onChange={(e) => setKind(e.target.value as ClassRelationshipKind)}
          >
            {["association", "inheritance", "implementation", "composition", "aggregation", "dependency"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <div className="usecase-endpoint-grid">
          <label>
            From multiplicity
            <input value={fromMultiplicity} onChange={(e) => setFromMultiplicity(e.target.value)} />
          </label>
          <label>
            To multiplicity
            <input value={toMultiplicity} onChange={(e) => setToMultiplicity(e.target.value)} />
          </label>
        </div>
        <label>
          Line style
          <select
            value={lineStyle}
            onChange={(e) => setLineStyle(e.target.value as ClassRelationshipInput["lineStyle"])}
          >
            {["solid", "dashed", "dotted", "bold"].map((style) => (
              <option key={style}>{style}</option>
            ))}
          </select>
        </label>
        <ColorField value={color} onChange={setColor} />
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">Add relationship</button>
        </div>
      </form>
    </div>
  );
}
const relationValue = (x: ClassRelationship): ClassRelationshipInput => ({
  from: x.from,
  to: x.to,
  kind: x.kind,
  ...(x.label ? { label: x.label } : {}),
  ...(x.fromMultiplicity ? { fromMultiplicity: x.fromMultiplicity } : {}),
  ...(x.toMultiplicity ? { toMultiplicity: x.toMultiplicity } : {}),
  ...(x.color ? { color: x.color } : {}),
  ...(x.lineStyle ? { lineStyle: x.lineStyle } : {}),
  arrow: x.arrow,
});
export function ClassRelationshipInspector({
  item,
  document,
  onChange,
  onDelete,
  onClose,
}: {
  item: ClassRelationship;
  document: ClassDocument;
  onChange(v: ClassRelationshipInput): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [v, setV] = useState(() => relationValue(item));
  useEffect(() => setV(relationValue(item)), [item]);
  const change = (n: ClassRelationshipInput) => {
    setV(n);
    onChange(n);
  };
  return (
    <aside className="task-inspector usecase-relationship-inspector" aria-label="Class relationship inspector">
      <header>
        <div>
          <strong>Relationship inspector</strong>
          <small>Endpoints, relationship type, and multiplicity</small>
        </div>
        <button onClick={onClose}>×</button>
      </header>
      <form onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Connection</legend>
          {(["from", "to"] as const).map((k) => (
            <label key={k}>
              {k}
              <select value={v[k]} onChange={(e) => change({ ...v, [k]: e.target.value })}>
                {document.entities.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            Relationship
            <select
              value={v.kind}
              onChange={(e) => change({ ...v, kind: e.target.value as ClassRelationshipKind, arrow: undefined })}
            >
              {["association", "inheritance", "implementation", "composition", "aggregation", "dependency"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Label
            <input
              value={v.label ?? ""}
              onChange={(e) => setV({ ...v, label: e.target.value })}
              onBlur={() => onChange(v)}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Multiplicity</legend>
          <div className="usecase-endpoint-grid">
            <label>
              From
              <input
                value={v.fromMultiplicity ?? ""}
                onChange={(e) => setV({ ...v, fromMultiplicity: e.target.value })}
                onBlur={() => onChange(v)}
              />
            </label>
            <label>
              To
              <input
                value={v.toMultiplicity ?? ""}
                onChange={(e) => setV({ ...v, toMultiplicity: e.target.value })}
                onBlur={() => onChange(v)}
              />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Appearance</legend>
          <label>
            Line style
            <select
              value={v.lineStyle ?? "solid"}
              onChange={(e) =>
                change({
                  ...v,
                  lineStyle: e.target.value as NonNullable<ClassRelationshipInput["lineStyle"]>,
                  arrow: undefined,
                })
              }
            >
              {["solid", "dashed", "dotted", "bold"].map((style) => (
                <option key={style}>{style}</option>
              ))}
            </select>
          </label>
          <ColorField
            value={v.color ?? ""}
            onChange={(color) => setV({ ...v, color, arrow: undefined })}
            onBlur={() => onChange(v)}
          />
        </fieldset>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete relationship
          </button>
        </div>
      </form>
    </aside>
  );
}

export function AddClassPackageDialog({
  document,
  onAdd,
  onClose,
}: {
  document: ClassDocument;
  onAdd(v: ClassPackageInput): void;
  onClose(): void;
}) {
  const [kind, setKind] = useState<ClassPackage["kind"]>("package"),
    [label, setLabel] = useState(""),
    [alias, setAlias] = useState(""),
    [color, setColor] = useState(""),
    [parentId, setParentId] = useState("");
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="task-dialog"
        role="dialog"
        aria-label="Add Class package"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onAdd({
            kind,
            label,
            ...(alias ? { alias } : {}),
            ...(color ? { color } : {}),
            ...(parentId ? { parentId } : {}),
          });
        }}
      >
        <h2>Add package</h2>
        <label>
          Type
          <select
            aria-label="Container type"
            value={kind}
            onChange={(e) => setKind(e.target.value as ClassPackage["kind"])}
          >
            {["package", "namespace", "folder", "frame", "node"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input
            aria-label="Package name"
            autoFocus
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          Alias
          <input aria-label="Package alias" value={alias} onChange={(e) => setAlias(e.target.value)} />
        </label>
        <ColorField value={color} onChange={setColor} />
        <label>
          Parent container
          <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
            <option value="">Top level</option>
            {document.packages.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">Add package</button>
        </div>
      </form>
    </div>
  );
}
export function ClassPackageInspector({
  item,
  packages,
  onChange,
  onParentChange,
  onDelete,
  onClose,
}: {
  item: ClassPackage;
  packages: ClassPackage[];
  onChange(v: ClassPackageInput): void;
  onParentChange(parentId?: string): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [v, setV] = useState<ClassPackageInput>({
    kind: item.kind,
    label: item.label,
    ...(item.alias ? { alias: item.alias } : {}),
    ...(item.color ? { color: item.color } : {}),
  });
  useEffect(
    () =>
      setV({
        kind: item.kind,
        label: item.label,
        ...(item.alias ? { alias: item.alias } : {}),
        ...(item.color ? { color: item.color } : {}),
      }),
    [item],
  );
  const save = () => onChange(v);
  return (
    <aside className="task-inspector usecase-package-inspector" aria-label="Class package inspector">
      <header>
        <div>
          <strong>Package inspector</strong>
          <small>Container identity and appearance</small>
        </div>
        <button onClick={onClose}>×</button>
      </header>
      <form onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Identity</legend>
          <label>
            Type
            <select
              value={v.kind}
              onChange={(e) => {
                const n = { ...v, kind: e.target.value as ClassPackage["kind"] };
                setV(n);
                onChange(n);
              }}
            >
              {["package", "namespace", "folder", "frame", "node"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input
              aria-label="Package name"
              value={v.label}
              onChange={(e) => setV({ ...v, label: e.target.value })}
              onBlur={save}
            />
          </label>
          <label>
            Alias
            <input value={v.alias ?? ""} onChange={(e) => setV({ ...v, alias: e.target.value })} onBlur={save} />
          </label>
        </fieldset>
        <fieldset>
          <legend>Appearance</legend>
          <ColorField value={v.color ?? ""} onChange={(color) => setV({ ...v, color })} onBlur={save} />
        </fieldset>
        <fieldset>
          <legend>Placement</legend>
          <label>
            Parent container
            <select value={item.parentId ?? ""} onChange={(event) => onParentChange(event.target.value || undefined)}>
              <option value="">Top level</option>
              {packages
                .filter((candidate) => candidate.id !== item.id && !isPackageDescendant(packages, candidate, item.id))
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
            </select>
          </label>
        </fieldset>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Remove package
          </button>
        </div>
      </form>
    </aside>
  );
}
const isPackageDescendant = (packages: ClassPackage[], candidate: ClassPackage, ancestorId: string) => {
  let current: ClassPackage | undefined = candidate;
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = packages.find((item) => item.id === current!.parentId);
  }
  return false;
};
export function AddClassNoteDialog({
  document,
  onAdd,
  onClose,
}: {
  document: ClassDocument;
  onAdd(v: ClassNoteInput): void;
  onClose(): void;
}) {
  const [targetId, setTarget] = useState(document.entities[0]?.id ?? ""),
    [placement, setPlacement] = useState<ClassNoteInput["placement"]>("right"),
    [text, setText] = useState(""),
    [color, setColor] = useState("");
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="task-dialog"
        role="dialog"
        aria-label="Add Class note"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onAdd({ targetId, placement, text, ...(color ? { color } : {}) });
        }}
      >
        <h2>Add note</h2>
        <label>
          Attached to
          <select value={targetId} onChange={(e) => setTarget(e.target.value)}>
            {document.entities.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
            {document.relationships.map((relationship) => (
              <option key={relationship.id} value={relationship.id}>
                Relationship: {entityLabel(document, relationship.from)} → {entityLabel(document, relationship.to)}
              </option>
            ))}
          </select>
        </label>
        {!document.relationships.some((relationship) => relationship.id === targetId) && (
          <label>
            Position
            <select value={placement} onChange={(e) => setPlacement(e.target.value as ClassNoteInput["placement"])}>
              {["left", "right", "top", "bottom"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Text
          <textarea required rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <ColorField value={color} onChange={setColor} />
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">Add note</button>
        </div>
      </form>
    </div>
  );
}
export function ClassNoteInspector({
  item,
  document,
  onChange,
  onDelete,
  onClose,
}: {
  item: ClassNote;
  document: ClassDocument;
  onChange(v: ClassNoteInput): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [v, setV] = useState<ClassNoteInput>({
    text: item.text,
    placement: item.placement ?? "right",
    targetId: item.targetId ?? document.entities[0]?.id ?? "",
    ...(item.color ? { color: item.color } : {}),
  });
  useEffect(
    () =>
      setV({
        text: item.text,
        placement: item.placement ?? "right",
        targetId: item.targetId ?? document.entities[0]?.id ?? "",
        ...(item.color ? { color: item.color } : {}),
      }),
    [item, document.entities, document.relationships],
  );
  const change = (n: ClassNoteInput) => {
    setV(n);
    onChange(n);
  };
  return (
    <aside className="task-inspector usecase-note-inspector" aria-label="Class note inspector">
      <header>
        <div>
          <strong>Note inspector</strong>
          <small>Attachment, content, and appearance</small>
        </div>
        <button onClick={onClose}>×</button>
      </header>
      <form onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Attachment</legend>
          <label>
            Attached to
            <select value={v.targetId} onChange={(e) => change({ ...v, targetId: e.target.value })}>
              {document.entities.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
              {document.relationships.map((relationship) => (
                <option key={relationship.id} value={relationship.id}>
                  Relationship: {entityLabel(document, relationship.from)} → {entityLabel(document, relationship.to)}
                </option>
              ))}
            </select>
          </label>
          {!document.relationships.some((relationship) => relationship.id === v.targetId) && (
            <label>
              Position
              <select
                value={v.placement}
                onChange={(e) => change({ ...v, placement: e.target.value as ClassNoteInput["placement"] })}
              >
                {["left", "right", "top", "bottom"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
        <fieldset>
          <legend>Content</legend>
          <label>
            Text
            <textarea
              rows={7}
              value={v.text}
              onChange={(e) => setV({ ...v, text: e.target.value })}
              onBlur={() => onChange(v)}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Appearance</legend>
          <ColorField value={v.color ?? ""} onChange={(color) => setV({ ...v, color })} onBlur={() => onChange(v)} />
        </fieldset>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete note
          </button>
        </div>
      </form>
    </aside>
  );
}
const entityLabel = (document: ClassDocument, id: string) =>
  document.entities.find((item) => item.id === id)?.label ?? id;
