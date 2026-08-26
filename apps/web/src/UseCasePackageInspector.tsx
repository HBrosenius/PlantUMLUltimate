import { useEffect, useId, useState } from "react";
import type { UseCasePackage, UseCasePackageInput } from "@plantuml-studio/diagram-usecase";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";

const valueOf = (item: UseCasePackage): UseCasePackageInput => ({
  kind: item.kind,
  label: item.label,
  ...(item.alias ? { alias: item.alias } : {}),
  ...(item.color ? { color: item.color } : {}),
  ...(item.stereotype ? { stereotype: item.stereotype } : {}),
});
export function UseCasePackageInspector({
  item,
  onChange,
  onDelete,
  onClose,
}: {
  item: UseCasePackage;
  onChange(value: UseCasePackageInput): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [value, setValue] = useState(() => valueOf(item));
  const colorListId = useId();
  useEffect(() => setValue(valueOf(item)), [item]);
  const update = <K extends keyof UseCasePackageInput>(key: K, next: UseCasePackageInput[K]) =>
    setValue((current) => ({ ...current, [key]: next }));
  const save = () => {
    if (value.label.trim()) onChange(value);
  };
  return (
    <aside className="task-inspector usecase-package-inspector" aria-label="Use Case container inspector">
      <header>
        <div>
          <strong>Container inspector</strong>
          <small>Edit the system boundary or package</small>
        </div>
        <button onClick={onClose} aria-label="Close container inspector">
          ×
        </button>
      </header>
      <form onSubmit={(event) => event.preventDefault()}>
        <fieldset>
          <legend>Identity</legend>
          <label>
            Type
            <select
              value={value.kind}
              onChange={(event) => {
                const kind = event.target.value as UseCasePackageInput["kind"];
                update("kind", kind);
                onChange({ ...value, kind });
              }}
            >
              <option value="rectangle">System boundary</option>
              <option value="package">Package</option>
            </select>
          </label>
          <label>
            Name
            <input value={value.label} onChange={(event) => update("label", event.target.value)} onBlur={save} />
          </label>
          <label>
            Alias
            <input value={value.alias ?? ""} onChange={(event) => update("alias", event.target.value)} onBlur={save} />
          </label>
        </fieldset>
        <fieldset>
          <legend>Appearance</legend>
          <label>
            Color
            <input
              list={colorListId}
              value={value.color ?? ""}
              onChange={(event) => update("color", event.target.value)}
              onBlur={save}
            />
          </label>
          <datalist id={colorListId}>
            {PLANTUML_COLOR_NAMES.map((name) => (
              <option key={name} value={`#${name}`} />
            ))}
          </datalist>
          <label>
            Stereotype
            <input
              value={value.stereotype ?? ""}
              onChange={(event) => update("stereotype", event.target.value)}
              onBlur={save}
            />
          </label>
        </fieldset>
        <p className="field-hint">Deleting a container keeps its contents and removes only the boundary.</p>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Remove container
          </button>
        </div>
      </form>
    </aside>
  );
}
