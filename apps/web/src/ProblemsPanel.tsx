import type { Diagnostic } from "@codemirror/lint";
import type { DiagramQuickFix } from "./diagram-diagnostics";

export function ProblemsPanel({
  source,
  diagnostics,
  quickFixes,
  onReveal,
  onApplyFix,
  onClose,
}: {
  source: string;
  diagnostics: readonly Diagnostic[];
  quickFixes: readonly DiagramQuickFix[];
  onReveal(diagnostic: Diagnostic): void;
  onApplyFix(fix: DiagramQuickFix): void;
  onClose(): void;
}) {
  const lines = source.split(/\r?\n/);
  return (
    <aside className="task-inspector problems-panel" aria-label="Problems">
      <header>
        <div>
          <strong>Problems</strong>
          <small>
            {diagnostics.length} parser diagnostic{diagnostics.length === 1 ? "" : "s"}
          </small>
        </div>
        <button onClick={onClose} aria-label="Close problems">
          ×
        </button>
      </header>
      <div className="problem-results" role="list">
        {diagnostics.map((diagnostic, index) => {
          const line = source.slice(0, diagnostic.from).split(/\r?\n/).length;
          return (
            <button
              key={`${diagnostic.from}:${diagnostic.to}:${index}`}
              type="button"
              role="listitem"
              onClick={() => onReveal(diagnostic)}
            >
              <span className={`problem-severity ${diagnostic.severity}`}>{diagnostic.severity}</span>
              <span>
                Line {line} · {diagnostic.message}
              </span>
              <code>{lines[line - 1]?.trim()}</code>
            </button>
          );
        })}
      </div>
      {quickFixes.length > 0 && (
        <section className="problem-fixes" aria-label="Available quick fixes">
          <strong>Safe quick fixes</strong>
          {quickFixes.map((fix, index) => (
            <button key={`${fix.from}:${fix.to}:${index}`} type="button" onClick={() => onApplyFix(fix)}>
              {fix.message}
            </button>
          ))}
        </section>
      )}
    </aside>
  );
}
