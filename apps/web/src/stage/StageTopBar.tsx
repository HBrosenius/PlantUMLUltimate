import "./stage.css";

export interface StageTopBarProps {
  documents: Array<{ id: string; label: string; dirty: boolean }>;
  activeId: string;
  diagramKindLabel: string;
  onActivate(id: string): void;
  onOpenPalette(): void;
  onSave(): void;
  saving: boolean;
  dirty: boolean;
  issueCount: number;
  onOpenIssues(): void;
  trueRender: boolean;
  onTrueRenderChange(value: boolean): void;
  /** Shown only when the dark recolouring would apply, so the toggle never looks inert. */
  recolorAvailable: boolean;
  onExit(): void;
}

/** The single slim bar in Stage mode: document switcher, command palette, Save and a way back to Split. */
export function StageTopBar({
  documents,
  activeId,
  diagramKindLabel,
  onActivate,
  onOpenPalette,
  onSave,
  saving,
  dirty,
  issueCount,
  onOpenIssues,
  trueRender,
  onTrueRenderChange,
  recolorAvailable,
  onExit,
}: StageTopBarProps) {
  return (
    <header className="stage-topbar" data-view-control data-testid="stage-topbar" role="banner" aria-label="Stage bar">
      <span className="stage-brand" aria-hidden="true">
        ◆
      </span>
      <span className="stage-kind">{diagramKindLabel}</span>
      <label className="stage-doc-switch">
        <span className="visually-hidden">Document</span>
        <select value={activeId} aria-label="Document" onChange={(event) => onActivate(event.target.value)}>
          {documents.map((document) => (
            <option key={document.id} value={document.id}>
              {document.label}
              {document.dirty ? " ●" : ""}
            </option>
          ))}
        </select>
      </label>
      <span className="stage-spacer" />
      {issueCount > 0 && (
        <button type="button" className="stage-issues" onClick={onOpenIssues}>
          {issueCount} {issueCount === 1 ? "issue" : "issues"}
        </button>
      )}
      <button
        type="button"
        aria-pressed={trueRender}
        title={
          recolorAvailable
            ? "Show the diagram exactly as exported (no theme recolouring)"
            : "The diagram is already shown as exported in the light theme"
        }
        disabled={!recolorAvailable}
        onClick={() => onTrueRenderChange(!trueRender)}
      >
        True render
      </button>
      <button type="button" className="stage-palette" onClick={onOpenPalette} aria-keyshortcuts="Control+K Meta+K">
        <span aria-hidden="true">⌘K</span> Ask or do…
      </button>
      <button type="button" className={`stage-save${dirty ? " needed" : ""}`} disabled={saving} onClick={onSave}>
        {saving ? "Saving…" : dirty ? "Save ●" : "Save"}
      </button>
      <button type="button" className="stage-exit" onClick={onExit} title="Leave Stage and return to Split view">
        Exit Stage
      </button>
    </header>
  );
}
