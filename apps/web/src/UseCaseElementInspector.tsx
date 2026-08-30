import { useEffect, useId, useState } from "react";
import type { UseCaseElement, UseCaseElementInput, UseCaseElementKind } from "@plantuml-studio/diagram-usecase";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";

const valueOf = (element: UseCaseElement): UseCaseElementInput => ({
  kind: element.kind,
  label: element.label,
  business: element.business,
  ...(element.alias ? { alias: element.alias } : {}),
  ...(element.color ? { color: element.color } : {}),
  ...(element.stereotype ? { stereotype: element.stereotype } : {}),
});

export function UseCaseElementInspector({
  element,
  onChange,
  onDelete,
  onClose,
  packages,
  onPackageChange,
}: {
  element: UseCaseElement;
  onChange(value: UseCaseElementInput): void;
  onDelete(): void;
  onClose(): void;
  packages: Array<{ id: string; label: string }>;
  onPackageChange(packageId?: string): void;
}) {
  const [value, setValue] = useState(() => valueOf(element));
  const colorListId = useId();
  useEffect(() => setValue(valueOf(element)), [element]);
  const update = <K extends keyof UseCaseElementInput>(key: K, next: UseCaseElementInput[K]) =>
    setValue((current) => ({ ...current, [key]: next }));
  const save = () => {
    if (value.label.trim()) onChange(value);
  };
  const labelMissing = !value.label.trim();
  return (
    <aside className="task-inspector usecase-element-inspector" aria-label="Use Case object inspector">
      <header>
        <div>
          <strong>{element.kind === "actor" ? "Actor" : "Use case"} inspector</strong>
          <small>Edit identity, appearance, and placement</small>
        </div>
        <button onClick={onClose} aria-label="Close Use Case object inspector">
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
                const kind = event.target.value as UseCaseElementKind;
                update("kind", kind);
                onChange({ ...value, kind });
              }}
            >
              <option value="actor">Actor</option>
              <option value="usecase">Use case</option>
            </select>
          </label>
          <label>
            Name
            <input
              required
              aria-invalid={labelMissing}
              aria-describedby={labelMissing ? "usecase-name-error" : undefined}
              value={value.label}
              onChange={(event) => update("label", event.target.value)}
              onBlur={save}
            />
            {labelMissing && (
              <span id="usecase-name-error" className="field-error" role="alert">
                Enter a name.
              </span>
            )}
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
              autoComplete="off"
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
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={value.business ?? false}
              onChange={(event) => {
                const business = event.target.checked;
                update("business", business);
                onChange({ ...value, business });
              }}
            />{" "}
            Business object
          </label>
        </fieldset>
        <fieldset>
          <legend>Placement</legend>
          <label>
            Container
            <select
              value={element.packageId ?? ""}
              onChange={(event) => onPackageChange(event.target.value || undefined)}
            >
              <option value="">Outside all containers</option>
              {packages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete {element.kind === "actor" ? "actor" : "use case"}
          </button>
        </div>
      </form>
    </aside>
  );
}
