import { useEffect, useRef, useState } from "react";
import type { LegendEntry } from "./legend";

export function LegendInspector({ entries, focusColor, onApply, onClose }: {
  entries: readonly LegendEntry[];
  focusColor?: string | undefined;
  onApply(entries: readonly LegendEntry[]): void;
  onClose(): void;
}) {
  const [value, setValue] = useState(() => entries.map((entry) => ({ ...entry })));
  const focusedInput = useRef<HTMLInputElement>(null);
  useEffect(() => { focusedInput.current?.focus(); focusedInput.current?.select(); }, [focusColor]);
  return <aside className="task-inspector legend-inspector" aria-label="Legend inspector">
    <header><strong>Legend</strong><button onClick={onClose} aria-label="Close legend inspector">×</button></header>
    <form onSubmit={(event) => { event.preventDefault(); onApply(value); }}>
      <p className="inspector-note">Entries follow the colors currently used by tasks and milestones.</p>
      {value.length ? value.map((entry, index) => <label key={entry.color}>
        <span className="inspector-field-heading"><span>{entry.color}</span><i className="legend-color-swatch" style={{ background: entry.color.startsWith("#") ? entry.color : entry.color }} /></span>
        <input ref={entry.color.toLowerCase() === focusColor?.toLowerCase() ? focusedInput : undefined} aria-label={`Legend label for ${entry.color}`} value={entry.label} onChange={(event) => setValue((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
      </label>) : <p className="inspector-note">Assign a color to an item to create the legend.</p>}
      <div className="inspector-actions"><button type="submit" className="primary">Apply</button></div>
    </form>
  </aside>;
}
