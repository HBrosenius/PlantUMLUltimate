import { useEffect, useId, useState } from "react";
import {
  C4_BOUNDARY_MACROS,
  C4_DIRECTIONS,
  C4_ELEMENT_MACROS,
  c4Argument,
  c4Macro,
  c4MacroDirection,
  type C4Direction,
  type C4Document,
  type C4Element,
  type C4Layout,
  type C4Legend,
  type C4Relationship,
  type C4SettingsInput,
} from "../../c4-source";
import { InspectorPanel } from "../../InspectorPanel";
import {
  C4_BOUNDARY_CHOICES,
  C4_DIRECTION_LABELS,
  c4Connectable,
  c4Containers,
  c4EditBlocker,
  c4ElementNoun,
  c4MacroTitle,
  type C4Selection,
} from "./c4-forms";
import type { C4ActionResult } from "./use-c4-actions";

/** A text field that writes its value to the source when it loses focus, and shows why a write was refused. */
function CommitField({
  label,
  value,
  required = false,
  disabled = false,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Returns why the value can't be written, or nothing when it was. */
  onCommit(value: string): C4ActionResult;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string>();
  const errorId = useId();
  useEffect(() => {
    setDraft(value);
    setError(undefined);
  }, [value]);
  const missing = required && !draft.trim();
  const commit = () => {
    if (disabled || draft === value) return;
    if (missing) {
      setError("This field is required.");
      return;
    }
    setError(onCommit(draft.trim()));
  };
  return (
    <label>
      {label}
      <input
        value={draft}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        aria-invalid={Boolean(error) || missing}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

/** A select that writes its value to the source as soon as it changes, and shows why a write was refused. */
function CommitSelect({
  label,
  value,
  disabled = false,
  options,
  onCommit,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  options: ReadonlyArray<{ value: string; label: string }>;
  onCommit(value: string): C4ActionResult;
}) {
  const [error, setError] = useState<string>();
  const errorId = useId();
  useEffect(() => setError(undefined), [value]);
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => setError(onCommit(event.target.value))}
      >
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

const argumentValue = (site: C4Element | C4Relationship, parameter: string) => c4Argument(site, parameter);

/** Whether the argument is an expression the form can't write back. */
const isExpression = (site: C4Element | C4Relationship, parameter: string) =>
  argumentValue(site, parameter)?.form === "expression";

function Header({
  title,
  subtitle,
  closeLabel,
  onClose,
}: {
  title: string;
  subtitle: string;
  closeLabel: string;
  onClose(): void;
}) {
  return (
    <header>
      <div>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
      <button type="button" onClick={onClose} aria-label={closeLabel}>
        ×
      </button>
    </header>
  );
}

export function C4ElementInspector({
  element,
  document,
  onUpdate,
  onMacro,
  onMove,
  onDelete,
  onClose,
}: {
  element: C4Element;
  document: C4Document;
  onUpdate(parameter: string, value: string): C4ActionResult;
  onMacro(macro: string): C4ActionResult;
  onMove(parent: string | undefined): C4ActionResult;
  onDelete(): void;
  onClose(): void;
}) {
  const macro = c4Macro(element.macro);
  const isBoundary = element.category === "boundary" || element.category === "node";
  const blocker = c4EditBlocker(element);
  const has = (...names: string[]) => Boolean(macro?.params.some((item) => names.includes(item.name)));
  const technologyName = has("techn") ? "techn" : "type";
  const field = (label: string, parameter: string, placeholder?: string) => {
    const expression = isExpression(element, parameter);
    return (
      <CommitField
        key={parameter}
        label={label}
        value={argumentValue(element, parameter)?.value ?? ""}
        disabled={Boolean(blocker) || expression}
        {...(expression
          ? { placeholder: "An expression: change it in the source" }
          : placeholder
            ? { placeholder }
            : {})}
        onCommit={(value) => onUpdate(parameter, value)}
      />
    );
  };
  const macros = isBoundary ? C4_BOUNDARY_MACROS : C4_ELEMENT_MACROS;
  const options = macros.map((name) => ({
    value: name,
    label: isBoundary ? (C4_BOUNDARY_CHOICES.find((item) => item.macro === name)?.label ?? name) : c4MacroTitle(name),
  }));
  const own = new Set<string>([element.id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const item of document.elements)
      if (item.parent && own.has(item.parent) && !own.has(item.id)) {
        own.add(item.id);
        grew = true;
      }
  }
  const containers = c4Containers(document).filter((item) => !own.has(item.id));
  const noun = c4ElementNoun(element);
  return (
    <InspectorPanel className="task-inspector c4-inspector" aria-label="C4 element inspector">
      <Header
        title={`${noun[0]!.toUpperCase()}${noun.slice(1)} inspector`}
        subtitle={`Edit ${element.id} without typing the macro`}
        closeLabel="Close C4 element inspector"
        onClose={onClose}
      />
      <form onSubmit={(event) => event.preventDefault()}>
        {blocker && (
          <p className="c4-readonly-note" role="note">
            {blocker}
          </p>
        )}
        <fieldset>
          <legend>Identity</legend>
          <CommitSelect
            label="Type"
            value={element.macro}
            disabled={Boolean(blocker)}
            options={
              options.some((item) => item.value === element.macro)
                ? options
                : [{ value: element.macro, label: element.macro }, ...options]
            }
            onCommit={onMacro}
          />
          <label>
            Alias
            <input value={element.id} readOnly aria-readonly="true" />
          </label>
          <CommitField
            label="Label"
            required
            value={element.label}
            disabled={Boolean(blocker) || isExpression(element, "label")}
            onCommit={(value) => onUpdate("label", value)}
          />
          {has("techn", "type") && field(isBoundary ? "Type" : "Technology", technologyName)}
          {has("descr") && field("Description", "descr")}
        </fieldset>
        <fieldset>
          <legend>Appearance and links</legend>
          {has("tags") && field("Tags", "tags", "Names from AddElementTag")}
          {has("link") && field("Link", "link", "https://…")}
          {has("sprite") && field("Sprite", "sprite", "Sprite name")}
        </fieldset>
        <fieldset>
          <legend>Placement</legend>
          <CommitSelect
            label="Placed in"
            value={element.parent ?? ""}
            disabled={Boolean(blocker)}
            options={[
              { value: "", label: "Top level" },
              ...containers.map((item) => ({ value: item.id, label: item.label })),
            ]}
            onCommit={(value) => onMove(value || undefined)}
          />
        </fieldset>
        <div className="inspector-actions">
          <button type="button" className="danger" disabled={Boolean(blocker)} onClick={onDelete}>
            Delete {isBoundary ? noun : "element"}
          </button>
        </div>
      </form>
    </InspectorPanel>
  );
}

export function C4RelationshipInspector({
  relationship,
  document,
  onUpdate,
  onDirection,
  onReverse,
  onBothWays,
  onDelete,
  onClose,
}: {
  relationship: C4Relationship;
  document: C4Document;
  onUpdate(parameter: string, value: string): C4ActionResult;
  onDirection(direction: C4Direction): C4ActionResult;
  onReverse(): C4ActionResult;
  onBothWays(both: boolean): C4ActionResult;
  onDelete(): void;
  onClose(): void;
}) {
  const blocker = c4EditBlocker(relationship);
  const elements = c4Connectable(document);
  const [error, setError] = useState<string>();
  const direction = c4MacroDirection(relationship.macro) ?? "auto";
  const endpointOptions = (current: string) => [
    ...(elements.some((item) => item.id === current) ? [] : [{ value: current, label: current }]),
    ...elements.map((item) => ({ value: item.id, label: item.label })),
  ];
  const expression = (parameter: string) => isExpression(relationship, parameter);
  const text = (label: string, parameter: string, required = false) => (
    <CommitField
      label={label}
      value={argumentValue(relationship, parameter)?.value ?? ""}
      required={required}
      disabled={Boolean(blocker) || expression(parameter)}
      onCommit={(value) => onUpdate(parameter, value)}
    />
  );
  return (
    <InspectorPanel className="task-inspector c4-inspector" aria-label="C4 relationship inspector">
      <Header
        title="Relationship inspector"
        subtitle={`${relationship.macro}: ${relationship.from} to ${relationship.to}`}
        closeLabel="Close C4 relationship inspector"
        onClose={onClose}
      />
      <form onSubmit={(event) => event.preventDefault()}>
        {blocker && (
          <p className="c4-readonly-note" role="note">
            {blocker}
          </p>
        )}
        <fieldset>
          <legend>Connection</legend>
          <CommitSelect
            label="From"
            value={relationship.from}
            disabled={Boolean(blocker) || expression("from")}
            options={endpointOptions(relationship.from)}
            onCommit={(value) => onUpdate("from", value)}
          />
          <CommitSelect
            label="To"
            value={relationship.to}
            disabled={Boolean(blocker) || expression("to")}
            options={endpointOptions(relationship.to)}
            onCommit={(value) => onUpdate("to", value)}
          />
          <CommitSelect
            label="Direction"
            value={direction}
            disabled={Boolean(blocker)}
            options={C4_DIRECTIONS.map((item) => ({ value: item, label: C4_DIRECTION_LABELS[item] }))}
            onCommit={(value) => onDirection(value as C4Direction)}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={/^BiRel/.test(relationship.macro)}
              disabled={Boolean(blocker)}
              onChange={(event) => setError(onBothWays(event.target.checked))}
            />{" "}
            Both ways
          </label>
          <button
            type="button"
            disabled={Boolean(blocker)}
            onClick={() => setError(onReverse())}
            title="Swap the two ends in the source"
          >
            Reverse
          </button>
          {error && (
            <span className="field-error" role="alert">
              {error}
            </span>
          )}
        </fieldset>
        <fieldset>
          <legend>Description</legend>
          {text("Label", "label", true)}
          {text("Technology", "techn")}
          {text("Tags", "tags")}
        </fieldset>
        <div className="inspector-actions">
          <button type="button" className="danger" disabled={Boolean(blocker)} onClick={onDelete}>
            Delete relationship
          </button>
        </div>
      </form>
    </InspectorPanel>
  );
}

/** A shape that the source does not declare, or that a form can't write back: shown, with its source line. */
export function C4UnmanagedInspector({
  item,
  onClose,
}: {
  item: Extract<C4Selection, { kind: "unmanaged" }>;
  onClose(): void;
}) {
  const what = item.alias ? `“${item.alias}”` : `the relationship from ${item.from} to ${item.to}`;
  return (
    <InspectorPanel className="task-inspector c4-inspector" aria-label="C4 shape inspector">
      <Header
        title={item.alias ? "Element" : "Relationship"}
        subtitle="Selected on the diagram"
        closeLabel="Close C4 shape inspector"
        onClose={onClose}
      />
      <form onSubmit={(event) => event.preventDefault()}>
        <p className="c4-readonly-note" role="note">
          This diagram draws {what}, but the source doesn&apos;t declare it as a plain macro call: it comes from a
          procedure, an included file, or a condition. It is shown, and the editor shows the nearest line, but it
          can&apos;t be edited in forms. Change the source instead.
        </p>
      </form>
    </InspectorPanel>
  );
}

const LAYOUT_OF: Record<string, C4Layout> = {
  LAYOUT_TOP_DOWN: "top-down",
  LAYOUT_LEFT_RIGHT: "left-right",
  LAYOUT_LANDSCAPE: "landscape",
};

export function C4SettingsInspector({
  document,
  onApply,
  onClose,
}: {
  document: C4Document;
  onApply(value: C4SettingsInput): C4ActionResult;
  onClose(): void;
}) {
  const layout = LAYOUT_OF[document.settings.layout[0]?.macro ?? ""] ?? "";
  const legend: C4Legend = document.settings.legend.some((item) => item.macro === "LAYOUT_WITH_LEGEND")
    ? "with-legend"
    : document.settings.legend.some((item) => item.macro === "SHOW_LEGEND")
      ? "show"
      : "none";
  return (
    <InspectorPanel className="task-inspector c4-inspector" aria-label="C4 diagram settings">
      <Header
        title="Diagram settings"
        subtitle="Layout and legend"
        closeLabel="Close C4 diagram settings"
        onClose={onClose}
      />
      <form onSubmit={(event) => event.preventDefault()}>
        <fieldset>
          <legend>Layout</legend>
          <CommitSelect
            label="Layout"
            value={layout}
            options={[
              { value: "", label: "Default" },
              { value: "top-down", label: "Top to bottom" },
              { value: "left-right", label: "Left to right" },
              { value: "landscape", label: "Landscape" },
            ]}
            onCommit={(value) => onApply({ layout: (value || null) as C4Layout | null })}
          />
          <CommitSelect
            label="Legend"
            value={legend}
            options={[
              { value: "none", label: "No legend" },
              { value: "show", label: "Show legend at the end" },
              { value: "with-legend", label: "Layout with legend" },
            ]}
            onCommit={(value) => onApply({ legend: value as C4Legend })}
          />
        </fieldset>
      </form>
    </InspectorPanel>
  );
}
