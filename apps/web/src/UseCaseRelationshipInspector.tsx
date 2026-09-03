import { useEffect, useState } from "react";
import type {
  UseCaseRelationship,
  UseCaseRelationshipInput,
  UseCaseRelationshipKind,
} from "@plantuml-studio/diagram-usecase";
import { ColorField } from "./ColorField";

const valueOf = (item: UseCaseRelationship): UseCaseRelationshipInput => ({
  from: item.from,
  to: item.to,
  kind: item.kind,
  arrow: item.arrow,
  ...(item.color ? { color: item.color } : {}),
  ...(item.lineStyle ? { lineStyle: item.lineStyle } : {}),
  ...(item.direction ? { direction: item.direction } : {}),
  ...(item.kind === "association" && item.label ? { label: item.label } : {}),
});

export function UseCaseRelationshipInspector({
  relationship,
  elements,
  onChange,
  onDelete,
  onClose,
}: {
  relationship: UseCaseRelationship;
  elements: Array<{ id: string; label: string }>;
  onChange(value: UseCaseRelationshipInput): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [value, setValue] = useState(() => valueOf(relationship));
  useEffect(() => setValue(valueOf(relationship)), [relationship]);
  const change = <K extends keyof UseCaseRelationshipInput>(key: K, next: UseCaseRelationshipInput[K]) => {
    const updated = { ...value, [key]: next };
    setValue(updated);
    onChange(updated);
  };
  const changePresentation = <K extends "direction" | "lineStyle">(key: K, next: UseCaseRelationshipInput[K]) => {
    const { arrow: _arrow, ...current } = value;
    const updated = { ...current, [key]: next };
    setValue(updated);
    onChange(updated);
  };
  return (
    <aside className="task-inspector usecase-relationship-inspector" aria-label="Use Case relationship inspector">
      <header>
        <div>
          <strong>Relationship inspector</strong>
          <small>Configure endpoints, meaning, and line style</small>
        </div>
        <button onClick={onClose} aria-label="Close relationship inspector">
          ×
        </button>
      </header>
      <form onSubmit={(event) => event.preventDefault()}>
        <fieldset>
          <legend>Connection</legend>
          <div className="usecase-endpoint-grid">
            <label>
              From
              <select aria-label="From" value={value.from} onChange={(event) => change("from", event.target.value)}>
                {elements.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To
              <select aria-label="To" value={value.to} onChange={(event) => change("to", event.target.value)}>
                {elements.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Relationship
            <select
              aria-label="Relationship"
              value={value.kind}
              onChange={(event) => change("kind", event.target.value as UseCaseRelationshipKind)}
            >
              <option value="association">Association</option>
              <option value="include">Include</option>
              <option value="extend">Extend</option>
              <option value="generalization">Generalization</option>
            </select>
          </label>
          {value.kind === "association" && (
            <label>
              Label
              <input
                value={value.label ?? ""}
                onChange={(event) => setValue((current) => ({ ...current, label: event.target.value }))}
                onBlur={() => onChange(value)}
              />
            </label>
          )}
        </fieldset>
        <fieldset>
          <legend>Appearance</legend>
          <label>
            Direction
            <select
              value={value.direction ?? ""}
              onChange={(event) =>
                changePresentation(
                  "direction",
                  (event.target.value || undefined) as UseCaseRelationshipInput["direction"],
                )
              }
            >
              <option value="">Automatic</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
            </select>
          </label>
          <label>
            Line style
            <select
              value={value.lineStyle ?? "solid"}
              onChange={(event) =>
                changePresentation("lineStyle", event.target.value as UseCaseRelationshipInput["lineStyle"])
              }
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
              <option value="bold">Bold</option>
            </select>
          </label>
          <ColorField
            value={value.color ?? ""}
            placeholder="#Blue"
            namePrefix="#"
            onChange={(color) => setValue((current) => ({ ...current, color }))}
            onBlur={() => {
              const { arrow: _arrow, ...updated } = value;
              setValue(updated);
              onChange(updated);
            }}
          />
        </fieldset>
        <details className="usecase-advanced-fields">
          <summary>Advanced PlantUML syntax</summary>
          <label>
            Arrow syntax
            <input
              value={value.arrow ?? ""}
              onChange={(event) => setValue((current) => ({ ...current, arrow: event.target.value }))}
              onBlur={() => onChange(value)}
            />
          </label>
        </details>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete relationship
          </button>
        </div>
      </form>
    </aside>
  );
}
