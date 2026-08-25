import { useRef, useState } from "react";
import type { UseCaseRelationshipInput, UseCaseRelationshipKind } from "@plantuml-studio/diagram-usecase";
import { useDialogFocus } from "./use-dialog-focus";

export function AddUseCaseRelationshipDialog({
  elements,
  onAdd,
  onClose,
}: {
  elements: Array<{ id: string; label: string }>;
  onAdd(value: UseCaseRelationshipInput): void;
  onClose(): void;
}) {
  const [from, setFrom] = useState(elements[0]?.id ?? "");
  const [to, setTo] = useState(elements[1]?.id ?? elements[0]?.id ?? "");
  const [kind, setKind] = useState<UseCaseRelationshipKind>("association");
  const [label, setLabel] = useState("");
  const [arrow, setArrow] = useState("");
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={dialog}
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add Use Case relationship"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onAdd({ from, to, kind, ...(label.trim() ? { label } : {}), ...(arrow.trim() ? { arrow } : {}) });
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
          Relationship
          <select
            aria-label="Relationship"
            value={kind}
            onChange={(event) => setKind(event.target.value as UseCaseRelationshipKind)}
          >
            <option value="association">Association</option>
            <option value="include">Include</option>
            <option value="extend">Extend</option>
            <option value="generalization">Generalization</option>
          </select>
        </label>
        {kind === "association" && (
          <label>
            Label
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Optional" />
          </label>
        )}
        <label>
          Arrow syntax
          <input
            value={arrow}
            onChange={(event) => setArrow(event.target.value)}
            placeholder={kind === "include" || kind === "extend" ? "..>" : kind === "generalization" ? "--|>" : "-->"}
          />
        </label>
        <p className="field-hint">
          Leave arrow syntax empty to use the PlantUML standard for the selected relationship.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={!from || !to}>
            Add relationship
          </button>
        </div>
      </form>
    </div>
  );
}
