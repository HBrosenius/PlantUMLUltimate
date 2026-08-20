import type { UnknownSyntaxNode } from "@plantuml-studio/diagram-gantt";

export function UnsupportedSyntaxPanel({
  items,
  onReveal,
  onClose,
}: {
  items: readonly UnknownSyntaxNode[];
  onReveal(item: UnknownSyntaxNode): void;
  onClose(): void;
}) {
  return (
    <aside className="task-inspector unsupported-panel" aria-label="Unsupported syntax">
      <header>
        <strong>Preserved syntax</strong>
        <button onClick={onClose} aria-label="Close unsupported syntax">
          ×
        </button>
      </header>
      <p className="inspector-note">
        These lines are kept in the source and passed to PlantUML, but they cannot currently be changed visually.
      </p>
      <div className="unsupported-list">
        {items.map((item, index) => (
          <button type="button" key={`${item.range.from}-${index}`} onClick={() => onReveal(item)}>
            <code>{item.text.trim()}</code>
            <span>Reveal in code</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
