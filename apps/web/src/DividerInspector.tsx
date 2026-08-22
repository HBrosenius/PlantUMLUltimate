import { useEffect, useState } from "react";
import type { GanttDivider } from "@plantuml-studio/diagram-gantt";

export function DividerInspector({
  divider,
  onApply,
  onDelete,
  onClose,
}: {
  divider: GanttDivider;
  onApply(label: string): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [label, setLabel] = useState(divider.label);
  useEffect(() => setLabel(divider.label), [divider.label]);
  return (
    <aside className="task-inspector divider-inspector" aria-label="Divider inspector">
      <header>
        <strong>Divider inspector</strong>
        <button onClick={onClose} aria-label="Close divider inspector">×</button>
      </header>
      <form onSubmit={(event) => { event.preventDefault(); onApply(label); }}>
        <label>
          Name
          <input required autoFocus value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>Delete divider</button>
          <button type="submit" className="primary">Apply</button>
        </div>
      </form>
    </aside>
  );
}
