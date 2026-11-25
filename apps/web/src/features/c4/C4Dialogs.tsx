import { useRef, useState } from "react";
import {
  c4DirectionMacro,
  c4IncludeLine,
  type C4BoundaryInput,
  type C4Direction,
  type C4Document,
  type C4ElementInput,
  type C4RelationshipInput,
} from "../../c4-source";
import { useDialogFocus } from "../../use-dialog-focus";
import {
  C4_BOUNDARY_CHOICES,
  C4_DIRECTION_LABELS,
  C4_KIND_LABELS,
  c4Connectable,
  c4Containers,
  c4ElementMacroName,
  c4MissingLibrary,
  suggestC4Alias,
  type C4BoundaryChoice,
  type C4FormElementKind,
  type C4Store,
} from "./c4-forms";
import type { C4ActionResult, C4AddOptions } from "./use-c4-actions";

interface DialogProps {
  source: string;
  document: C4Document;
  onClose(): void;
}

/** Offers the include line that the chosen macro needs, when the source does not have it yet. */
function IncludeOffer({
  source,
  macro,
  checked,
  onChange,
}: {
  source: string;
  macro: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  const library = c4MissingLibrary(source, macro);
  if (!library) return null;
  return (
    <label className="checkbox-row c4-include-offer">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> Add{" "}
      <code>{c4IncludeLine(library)}</code> ({macro} needs it)
    </label>
  );
}

function Placement({
  document,
  value,
  onChange,
}: {
  document: C4Document;
  value: string;
  onChange(value: string): void;
}) {
  const containers = c4Containers(document);
  return (
    <label>
      Place in
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Top level</option>
        {containers.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const trimmedOptional = <K extends string>(key: K, value: string) =>
  value.trim() ? ({ [key]: value.trim() } as Record<K, string>) : {};

export function AddC4ElementDialog({
  initialKind,
  source,
  document,
  onAdd,
  onClose,
}: DialogProps & {
  initialKind: C4FormElementKind;
  onAdd(value: C4ElementInput, options: C4AddOptions): C4ActionResult;
}) {
  const [kind, setKind] = useState(initialKind);
  const [store, setStore] = useState<C4Store>("standard");
  const [external, setExternal] = useState(false);
  const [label, setLabel] = useState("");
  const [alias, setAlias] = useState("");
  const [aliasEdited, setAliasEdited] = useState(false);
  const [technology, setTechnology] = useState("");
  const [description, setDescription] = useState("");
  const [parent, setParent] = useState("");
  const [addInclude, setAddInclude] = useState(true);
  const [error, setError] = useState<string>();
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);
  const taken = document.elements.map((item) => item.id);
  const macro = c4ElementMacroName(kind, kind === "person" ? "standard" : store, external);
  const hasTechnology = kind === "container" || kind === "component";
  const title = `Add ${C4_KIND_LABELS[kind].toLowerCase()}`;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={dialog}
        className="task-dialog c4-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add C4 element"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          setError(
            onAdd(
              {
                macro,
                alias: alias.trim(),
                label,
                ...(hasTechnology ? trimmedOptional("technology", technology) : {}),
                ...trimmedOptional("description", description),
                ...(parent ? { parent } : {}),
              },
              { addInclude },
            ),
          );
        }}
      >
        <h2>{title}</h2>
        <label>
          Type
          <select value={kind} onChange={(event) => setKind(event.target.value as C4FormElementKind)}>
            {(Object.keys(C4_KIND_LABELS) as C4FormElementKind[]).map((item) => (
              <option key={item} value={item}>
                {C4_KIND_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Label
          <input
            autoFocus
            required
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              if (!aliasEdited) setAlias(suggestC4Alias(event.target.value, taken));
            }}
          />
        </label>
        <label>
          Alias
          <input
            required
            value={alias}
            onChange={(event) => {
              setAlias(event.target.value);
              setAliasEdited(true);
            }}
            placeholder="Source identifier"
          />
        </label>
        {hasTechnology && (
          <label>
            Technology
            <input value={technology} onChange={(event) => setTechnology(event.target.value)} placeholder="Optional" />
          </label>
        )}
        <label>
          Description
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional" />
        </label>
        <div className="c4-dialog-row">
          <label className="checkbox-row">
            <input type="checkbox" checked={external} onChange={(event) => setExternal(event.target.checked)} />{" "}
            External
          </label>
          {kind !== "person" && (
            <label>
              Storage
              <select value={store} onChange={(event) => setStore(event.target.value as C4Store)}>
                <option value="standard">Standard</option>
                <option value="database">Database</option>
                <option value="queue">Queue</option>
              </select>
            </label>
          )}
        </div>
        <Placement document={document} value={parent} onChange={setParent} />
        <IncludeOffer source={source} macro={macro} checked={addInclude} onChange={setAddInclude} />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            {title}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AddC4BoundaryDialog({
  initialMacro,
  source,
  document,
  onAdd,
  onClose,
}: DialogProps & {
  initialMacro: C4BoundaryChoice;
  onAdd(value: C4BoundaryInput, options: C4AddOptions): C4ActionResult;
}) {
  const [macro, setMacro] = useState<C4BoundaryChoice>(initialMacro);
  const [label, setLabel] = useState("");
  const [alias, setAlias] = useState("");
  const [aliasEdited, setAliasEdited] = useState(false);
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [parent, setParent] = useState("");
  const [addInclude, setAddInclude] = useState(true);
  const [error, setError] = useState<string>();
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);
  const taken = document.elements.map((item) => item.id);
  const hasType = macro === "Boundary" || macro === "Deployment_Node";
  const noun = C4_BOUNDARY_CHOICES.find((item) => item.macro === macro)!.label.toLowerCase();
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={dialog}
        className="task-dialog c4-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add C4 boundary"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          setError(
            onAdd(
              {
                macro,
                alias: alias.trim(),
                label,
                ...(hasType ? trimmedOptional("technology", type) : {}),
                ...trimmedOptional("description", description),
                ...(parent ? { parent } : {}),
              },
              { addInclude },
            ),
          );
        }}
      >
        <h2>Add {noun}</h2>
        <label>
          Kind
          <select value={macro} onChange={(event) => setMacro(event.target.value as C4BoundaryChoice)}>
            {C4_BOUNDARY_CHOICES.map((item) => (
              <option key={item.macro} value={item.macro}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Label
          <input
            autoFocus
            required
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              if (!aliasEdited) setAlias(suggestC4Alias(event.target.value, taken));
            }}
          />
        </label>
        <label>
          Alias
          <input
            required
            value={alias}
            onChange={(event) => {
              setAlias(event.target.value);
              setAliasEdited(true);
            }}
            placeholder="Source identifier"
          />
        </label>
        {hasType && (
          <label>
            Type
            <input value={type} onChange={(event) => setType(event.target.value)} placeholder="Optional" />
          </label>
        )}
        <label>
          Description
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional" />
        </label>
        <Placement document={document} value={parent} onChange={setParent} />
        <IncludeOffer source={source} macro={macro} checked={addInclude} onChange={setAddInclude} />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Add {noun}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AddC4RelationshipDialog({
  source,
  document,
  onAdd,
  onClose,
}: DialogProps & { onAdd(value: C4RelationshipInput, options: C4AddOptions): C4ActionResult }) {
  const elements = c4Connectable(document);
  const [from, setFrom] = useState(elements[0]?.id ?? "");
  const [to, setTo] = useState(elements[1]?.id ?? elements[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [technology, setTechnology] = useState("");
  const [direction, setDirection] = useState<C4Direction>("auto");
  const [both, setBoth] = useState(false);
  const [addInclude, setAddInclude] = useState(true);
  const [error, setError] = useState<string>();
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);
  const macro = c4DirectionMacro(both ? "BiRel" : "Rel", direction);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={dialog}
        className="task-dialog c4-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add C4 relationship"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!macro) return;
          setError(onAdd({ macro, from, to, label, ...trimmedOptional("technology", technology) }, { addInclude }));
        }}
      >
        <h2>Add relationship</h2>
        <label>
          From
          <select aria-label="From" autoFocus required value={from} onChange={(event) => setFrom(event.target.value)}>
            {elements.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <select aria-label="To" required value={to} onChange={(event) => setTo(event.target.value)}>
            {elements.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Label
          <input required value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Uses" />
        </label>
        <label>
          Technology
          <input value={technology} onChange={(event) => setTechnology(event.target.value)} placeholder="Optional" />
        </label>
        <div className="c4-dialog-row">
          <label>
            Direction
            <select value={direction} onChange={(event) => setDirection(event.target.value as C4Direction)}>
              {(Object.keys(C4_DIRECTION_LABELS) as C4Direction[])
                .filter((item) => c4DirectionMacro(both ? "BiRel" : "Rel", item))
                .map((item) => (
                  <option key={item} value={item}>
                    {C4_DIRECTION_LABELS[item]}
                  </option>
                ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={both}
              onChange={(event) => {
                setBoth(event.target.checked);
                if (event.target.checked && !c4DirectionMacro("BiRel", direction)) setDirection("auto");
              }}
            />{" "}
            Both ways
          </label>
        </div>
        {macro && <IncludeOffer source={source} macro={macro} checked={addInclude} onChange={setAddInclude} />}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={!from || !to || !macro}>
            Add relationship
          </button>
        </div>
      </form>
    </div>
  );
}
