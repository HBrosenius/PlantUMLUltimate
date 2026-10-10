import { sidePanelOverlayOpen } from "./side-panel-events";
import { repairCategory, type RepairCategory } from "./remaining-repair-summary";
import { relatedDiagnosticFixes } from "./diagram-diagnostic-fixes";
import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { groupDiagnostics } from "./diagnostic-groups";
import type { DiagramKind } from "./model";
import { genericManualErrorGuidance, manualErrorGuidance } from "./manual-error-guidance";
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
  categoryFilter,
  onClearCategoryFilter,
  preserved = [],
  onRevealPreserved,
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
  categoryFilter?: RepairCategory | undefined;
  onClearCategoryFilter?: () => void;
  preserved?: readonly { text: string; range: { from: number; to: number } }[];
  onRevealPreserved?: (item: { text: string; range: { from: number; to: number } }) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const previousFocus = document.activeElement;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || sidePanelOverlayOpen()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      queueMicrotask(() => {
        const replacement = [...document.querySelectorAll<HTMLElement>(".task-inspector")].some(
          (item) => !item.hidden && item.style.display !== "none",
        );
        if (!replacement && (element.contains(document.activeElement) || document.activeElement === document.body)) {
          const previousVisible =
            previousFocus instanceof HTMLElement && previousFocus.isConnected && previousFocus.getClientRects().length;
          const target = previousVisible
            ? previousFocus
            : document.querySelector<HTMLElement>(".cm-content, .problem-count");
          target?.focus({ preventScroll: true });
        }
      });
    };
  }, [open]);
  const results = useRef<HTMLDivElement>(null);
  const lines = source.split(/\r?\n/);
  const groups = useMemo(
    () => groupDiagnostics(diagramKind, source, diagnostics, quickFixes),
    [diagramKind, source, diagnostics, quickFixes],
  );
  const visibleDiagnostics = categoryFilter
    ? diagnostics.filter((item) => repairCategory(diagramKind, source, item, quickFixes) === categoryFilter)
    : diagnostics;
  const previousCategoryFilter = useRef(categoryFilter);
  useEffect(() => {
    if (categoryFilter || previousCategoryFilter.current)
      results.current?.querySelector<HTMLButtonElement>("[data-problem-diagnostic]")?.focus();
    previousCategoryFilter.current = categoryFilter;
  }, [categoryFilter]);
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
          {guidance && guidance !== genericManualErrorGuidance && (
            <span className="problem-guidance">
              <strong>How to resolve</strong> {guidance}
            </span>
          )}
        </button>
        {guidance === genericManualErrorGuidance && (
          <details className="problem-guidance">
            <summary>How to resolve</summary>
            <p>{guidance}</p>
          </details>
        )}
      </div>
    );
  };
  return (
    <aside className="task-inspector problems-panel" aria-label="Issues" hidden={!open} ref={panel}>
      <header>
        <div>
          <strong>Issues</strong>
          <small>
            {diagnostics.filter((item) => item.severity === "error").length} errors ·{" "}
            {diagnostics.filter((item) => item.severity === "warning").length} warnings · {preserved.length} preserved
            lines
          </small>
        </div>
        <button onClick={onClose} aria-label="Close issues">
          ×
        </button>
      </header>
      {notice && <p className="problem-notice">{notice}</p>}
      {diagnostics.length === 0 && !notice && <p role="status">No errors or warnings remain.</p>}
      {preserved.length > 0 && (
        <details className="preserved-issues">
          <summary>Preserved source ({preserved.length})</summary>
          <p className="inspector-note">
            Some syntax can only be edited in Code view. These lines are preserved and passed to PlantUML.
          </p>
          <div className="unsupported-list">
            {preserved.map((item, index) => (
              <button type="button" key={`${item.range.from}:${index}`} onClick={() => onRevealPreserved?.(item)}>
                <code>{item.text.trim()}</code>
                <span>Go to source</span>
              </button>
            ))}
          </div>
        </details>
      )}
      {onRepairHost && (
        <div className="problem-repair-workspace" ref={onRepairHost} aria-label="Selected problem and fixes" />
      )}
      {diagnostics.length > 0 && (
        <p className="inspector-note">
          Use ↑/↓ to move between errors, Enter to reveal, and Alt+Enter to preview available fixes.
        </p>
      )}
      {categoryFilter && (
        <div className="problem-category-filter">
          <p>
            Showing {visibleDiagnostics.length} error{visibleDiagnostics.length === 1 ? "" : "s"} needing{" "}
            {categoryFilter === "choice" ? "a choice" : categoryFilter === "manual" ? "manual editing" : "review"}.
          </p>
          <button type="button" onClick={onClearCategoryFilter}>
            Show all issues
          </button>
        </div>
      )}
      <div className="problem-results" role="list" ref={results}>
        {categoryFilter
          ? visibleDiagnostics.map(renderDiagnostic)
          : groups.map(({ root, related }, index) => (
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
