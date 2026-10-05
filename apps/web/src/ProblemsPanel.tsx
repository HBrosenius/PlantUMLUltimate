import { relatedDiagnosticFixes } from "./diagram-diagnostic-fixes";
import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { groupDiagnostics } from "./diagnostic-groups";
import type { DiagramKind } from "./model";
import { manualErrorGuidance } from "./manual-error-guidance";
import type { Diagnostic } from "@codemirror/lint";
import type { DiagramQuickFix } from "./diagram-diagnostics";

export function ProblemsPanel({
  diagramKind,
  open = true,
  onRepairHost,
  source,
  diagnostics,
  quickFixes,
  readOnly = false,
  notice,
  onReveal,
  onPreviewFix,
  onPreviewDiagnostic,
  onClose,
}: {
  diagramKind: DiagramKind;
  open?: boolean;
  onRepairHost?: (host: HTMLDivElement | null) => void;
  source: string;
  diagnostics: readonly Diagnostic[];
  quickFixes: readonly DiagramQuickFix[];
  readOnly?: boolean | undefined;
  notice?: string | undefined;
  onReveal(diagnostic: Diagnostic): void;
  onPreviewFix(fix: DiagramQuickFix): void;
  onPreviewDiagnostic(diagnostic: Diagnostic): void;
  onClose(): void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    element.addEventListener("keydown", closeOnEscape, true);
    return () => element.removeEventListener("keydown", closeOnEscape, true);
  }, [open, onClose]);
  const results = useRef<HTMLDivElement>(null);
  const lines = source.split(/\r?\n/);
  const groups = useMemo(
    () => groupDiagnostics(diagramKind, source, diagnostics, quickFixes),
    [diagramKind, source, diagnostics, quickFixes],
  );
  const renderDiagnostic = (diagnostic: Diagnostic, index: number) => {
    const guidance = manualErrorGuidance(diagramKind, diagnostic, quickFixes);
    const line = source.slice(0, diagnostic.from).split(/\r?\n/).length;
    const related = relatedDiagnosticFixes(diagramKind, source, diagnostic, quickFixes);
    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.altKey) {
        if (event.key === "Enter") {
          event.preventDefault();
          if (!readOnly && related.length > 0) onPreviewDiagnostic(diagnostic);
        }
        return;
      }
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      const buttons = [
        ...(results.current?.querySelectorAll<HTMLButtonElement>("[data-problem-diagnostic]") ?? []),
      ].filter((button) => !button.closest("details:not([open])"));
      const current = buttons.indexOf(event.currentTarget);
      if (current < 0) return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : Math.max(0, Math.min(buttons.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
      buttons[next]?.focus();
    };
    return (
      <div className="problem-group" key={`${diagnostic.from}:${diagnostic.to}:${index}`}>
        <button
          type="button"
          role="listitem"
          data-problem-diagnostic
          onKeyDown={onKeyDown}
          onClick={() => onReveal(diagnostic)}
        >
          <span className={`problem-severity ${diagnostic.severity}`}>{diagnostic.severity}</span>
          <span>
            Line {line} · {diagnostic.message}
          </span>
          <code>{lines[line - 1]?.trim()}</code>
          {guidance && (
            <span className="problem-guidance">
              <strong>How to resolve</strong> {guidance}
            </span>
          )}
        </button>
      </div>
    );
  };
  return (
    <aside className="task-inspector problems-panel" aria-label="Problems" hidden={!open} ref={panel}>
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
      {notice && <p className="problem-notice">{notice}</p>}
      {diagnostics.length === 0 && !notice && <p role="status">No problems remain.</p>}
      {onRepairHost && (
        <div className="problem-repair-workspace" ref={onRepairHost} aria-label="Selected problem and fixes" />
      )}
      {diagnostics.length > 0 && (
        <p className="inspector-note">
          Use ↑/↓ to move between errors, Enter to reveal, and Alt+Enter to preview available fixes.
        </p>
      )}
      <div className="problem-results" role="list" ref={results}>
        {groups.map(({ root, related }, index) => (
          <div className="problem-group" key={`${root.from}:${root.to}:${index}`}>
            {related.length > 0 && <small>Likely root error</small>}
            {renderDiagnostic(root, index)}
            {related.length > 0 && (
              <details>
                <summary>
                  {related.length} related diagnostic{related.length === 1 ? "" : "s"}
                </summary>
                <p>These messages disappear with the same suggested fix. Review the root error first.</p>
                <div role="list" aria-label="Related diagnostics">
                  {related.map(renderDiagnostic)}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
      {quickFixes.length > 0 && !readOnly && !onRepairHost && (
        <section className="problem-fixes" aria-label="Available quick fixes">
          <strong>Preview suggested fixes</strong>
          {quickFixes.map((fix, index) => (
            <button key={`${fix.from}:${fix.to}:${index}`} type="button" onClick={() => onPreviewFix(fix)}>
              {fix.label ?? fix.message}
            </button>
          ))}
        </section>
      )}
    </aside>
  );
}
