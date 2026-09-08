import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { DocumentVersion } from "./workspace-storage";
import { diffVersionSources } from "./version-diff";
import { useDialogFocus } from "./use-dialog-focus";
import { useRenderer } from "./render/use-renderer";
import { sanitizeSvg } from "./render/sanitize-svg";
import type { DiagramKind } from "./model";
import { applyReviewGroups, buildReviewGroups, createUnifiedPatch } from "./semantic-review";

function download(content: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function versionTitle(version: DocumentVersion): string {
  if (!version.label?.trim() && version.reason === "collaboration" && version.author)
    return `Changes by ${version.author.name} · ${new Date(version.createdAt).toLocaleString()}`;
  return (
    version.label?.trim() || `${version.reason.replaceAll("-", " ")} · ${new Date(version.createdAt).toLocaleString()}`
  );
}

export function VersionHistoryDialog({
  versions,
  currentSource,
  onCreate,
  onRestore,
  onUpdate,
  onDelete,
  baselineVersionId,
  onSetBaseline,
  diagramKind,
  fileName,
  onApplyReview,
  onClose,
}: {
  versions: readonly DocumentVersion[];
  currentSource: string;
  onCreate(label: string): Promise<void>;
  onRestore(version: DocumentVersion): Promise<void>;
  onUpdate(version: DocumentVersion, patch: { label?: string; pinned?: boolean }): Promise<void>;
  onDelete(version: DocumentVersion): Promise<void>;
  baselineVersionId?: string | undefined;
  onSetBaseline(version?: DocumentVersion): Promise<void>;
  diagramKind: DiagramKind;
  fileName: string;
  onApplyReview(source: string): Promise<boolean>;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const diffElement = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);
  const [selectedId, setSelectedId] = useState(versions[0]?.id ?? "");
  const [compareId, setCompareId] = useState("current");
  const [label, setLabel] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [changesOnly, setChangesOnly] = useState(false);
  const [changeIndex, setChangeIndex] = useState(0);
  const [comparisonView, setComparisonView] = useState<"semantic" | "source" | "rendered">(
    diagramKind === "sequence" || diagramKind === "gantt" ? "semantic" : "source",
  );
  const [creating, setCreating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const selected = versions.find((version) => version.id === selectedId) ?? versions[0];
  const compare = versions.find((version) => version.id === compareId);
  const rightSource = compare?.source ?? currentSource;
  const leftSource = selected?.source ?? currentSource;
  const layoutEngine =
    /^\s*@startgantt\b/im.test(leftSource) && /^\s*@startgantt\b/im.test(rightSource) ? "native" : "graphviz";
  const leftRendered = useRenderer(leftSource, comparisonView === "rendered", layoutEngine);
  const rightRendered = useRenderer(rightSource, comparisonView === "rendered", layoutEngine);
  const diff = useMemo(() => diffVersionSources(leftSource, rightSource), [leftSource, rightSource]);
  const reviewGroups = useMemo(
    () => buildReviewGroups(leftSource, rightSource, diagramKind),
    [diagramKind, leftSource, rightSource],
  );
  const reviewedSource = useMemo(
    () => applyReviewGroups(leftSource, reviewGroups, selectedGroups),
    [leftSource, reviewGroups, selectedGroups],
  );
  const visibleDiff = useMemo(
    () => (changesOnly ? diff.filter((line) => line.kind !== "equal") : diff),
    [changesOnly, diff],
  );
  const rowChangeIndices = useMemo(() => {
    let next = 0;
    return visibleDiff.map((line) => (line.kind === "equal" ? undefined : next++));
  }, [visibleDiff]);
  const changeCount = rowChangeIndices.filter((index) => index !== undefined).length;
  useEffect(() => {
    setEditLabel(selected?.label ?? "");
    setChangeIndex(0);
    setSelectedGroups(new Set());
  }, [compareId, selected?.id, selected?.label]);
  const moveToChange = (direction: -1 | 1) => {
    if (!changeCount) return;
    const next = (changeIndex + direction + changeCount) % changeCount;
    setChangeIndex(next);
    window.setTimeout(() => {
      diffElement.current
        ?.querySelector<HTMLElement>(`[data-change-index="${next}"]`)
        ?.scrollIntoView({ block: "center" });
    });
  };

  return (
    <div className="modal-backdrop version-history-backdrop" role="presentation">
      <div ref={dialog} className="version-history-dialog" role="dialog" aria-modal="true" aria-label="Version history">
        <header>
          <div>
            <h2>Version history</h2>
            <p>Saved checkpoints are separate from Undo and remain available after restoring.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close version history" disabled={creating}>
            ×
          </button>
        </header>
        <div className="version-create">
          <input
            aria-label="New version name"
            placeholder="Optional version name"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <button
            type="button"
            disabled={creating}
            onClick={() => {
              setCreating(true);
              void onCreate(label)
                .then(() => setLabel(""))
                .finally(() => setCreating(false));
            }}
          >
            {creating ? "Creating version…" : "Create version"}
          </button>
        </div>
        <div className="version-history-body">
          <aside aria-label="Versions">
            {versions.length ? (
              versions.map((version) => (
                <div className={`version-list-item${version.id === selected?.id ? " selected" : ""}`} key={version.id}>
                  <button
                    type="button"
                    aria-label={`Select version ${versionTitle(version)}`}
                    onClick={() => setSelectedId(version.id)}
                  >
                    <strong>{versionTitle(version)}</strong>
                    <span>
                      {version.source.split("\n").length} lines
                      {version.author ? ` · by ${version.author.name}` : ""}
                      {version.id === baselineVersionId ? " · baseline" : version.pinned ? " · pinned" : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="version-pin"
                    aria-label={`${version.pinned ? "Unpin" : "Pin"} ${versionTitle(version)}`}
                    title={version.pinned ? "Unpin version" : "Pin version"}
                    disabled={version.id === baselineVersionId}
                    onClick={() => void onUpdate(version, { pinned: !version.pinned })}
                  >
                    {version.pinned ? "★" : "☆"}
                  </button>
                </div>
              ))
            ) : (
              <p>No versions yet. Create the first checkpoint above.</p>
            )}
          </aside>
          <section className="version-compare" aria-label="Version comparison">
            <div className="version-compare-controls">
              <span>{selected ? versionTitle(selected) : "No historical version"}</span>
              <span>compared with</span>
              <select
                aria-label="Compare with"
                value={compareId}
                onChange={(event) => setCompareId(event.target.value)}
              >
                <option value="current">Current working copy</option>
                {versions
                  .filter((version) => version.id !== selected?.id)
                  .map((version) => (
                    <option key={version.id} value={version.id}>
                      {versionTitle(version)}
                    </option>
                  ))}
              </select>
              <div className="version-view-switch" role="group" aria-label="Comparison view">
                <button
                  type="button"
                  aria-pressed={comparisonView === "semantic"}
                  onClick={() => setComparisonView("semantic")}
                >
                  Review
                </button>
                <button
                  type="button"
                  aria-pressed={comparisonView === "source"}
                  onClick={() => setComparisonView("source")}
                >
                  Source
                </button>
                <button
                  type="button"
                  aria-pressed={comparisonView === "rendered"}
                  onClick={() => setComparisonView("rendered")}
                >
                  Rendered
                </button>
              </div>
            </div>
            {selected && (
              <div className="version-edit-controls">
                {selected.author && (
                  <span
                    className="version-author"
                    style={{ "--version-author-color": selected.author.color } as CSSProperties}
                  >
                    Changes by {selected.author.name}
                  </span>
                )}
                <input
                  aria-label="Selected version name"
                  value={editLabel}
                  onChange={(event) => setEditLabel(event.target.value)}
                  placeholder="Version name"
                />
                <button type="button" onClick={() => void onUpdate(selected, { label: editLabel })}>
                  Save name
                </button>
                <button type="button" onClick={() => void onUpdate(selected, { pinned: !selected.pinned })}>
                  {selected.pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  type="button"
                  onClick={() => void onSetBaseline(selected.id === baselineVersionId ? undefined : selected)}
                >
                  {selected.id === baselineVersionId ? "Clear baseline" : "Set as baseline"}
                </button>
                <button type="button" className="danger" onClick={() => void onDelete(selected)}>
                  Delete
                </button>
              </div>
            )}
            {comparisonView === "source" && (
              <div className="version-diff-navigation">
                <label>
                  <input
                    type="checkbox"
                    checked={changesOnly}
                    onChange={(event) => setChangesOnly(event.target.checked)}
                  />{" "}
                  Changes only
                </label>
                <span>
                  {changeCount} changed line{changeCount === 1 ? "" : "s"}
                </span>
                <button type="button" disabled={!changeCount} onClick={() => moveToChange(-1)}>
                  Previous change
                </button>
                <button type="button" disabled={!changeCount} onClick={() => moveToChange(1)}>
                  Next change
                </button>
              </div>
            )}
            {comparisonView === "semantic" ? (
              <div className="semantic-review" aria-label="Semantic changes">
                <header>
                  <div>
                    <strong>Proposed change groups</strong>
                    <p>Confirmed groups can be applied independently. Unclassified source remains visible in Source.</p>
                  </div>
                  <span>
                    {reviewGroups.length} group{reviewGroups.length === 1 ? "" : "s"}
                  </span>
                </header>
                <div className="semantic-review-groups">
                  {reviewGroups.length ? (
                    reviewGroups.map((group) => {
                      const confirmed = group.confidence === "confirmed";
                      return (
                        <label className={`semantic-review-group ${group.confidence}`} key={group.id}>
                          <input
                            type="checkbox"
                            disabled={!confirmed}
                            checked={selectedGroups.has(group.id)}
                            onChange={(event) => {
                              const next = new Set(selectedGroups);
                              if (event.target.checked) next.add(group.id);
                              else next.delete(group.id);
                              setSelectedGroups(next);
                            }}
                          />
                          <span>
                            <strong>{group.title}</strong>
                            <small>{group.confidence[0]!.toUpperCase() + group.confidence.slice(1)}</small>
                            <span>{group.detail}</span>
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <p>No changes between these versions.</p>
                  )}
                </div>
                <div className="semantic-review-actions">
                  <button
                    type="button"
                    disabled={!selectedGroups.size}
                    onClick={() =>
                      download(
                        createUnifiedPatch(fileName, leftSource, reviewedSource),
                        `${fileName}.patch`,
                        "text/x-diff",
                      )
                    }
                  >
                    Export selected patch
                  </button>
                  <button
                    type="button"
                    disabled={!reviewGroups.length}
                    onClick={() => {
                      const rows = reviewGroups
                        .map(
                          (group) =>
                            `<li><strong>${escapeHtml(group.title)}</strong> — ${escapeHtml(group.confidence)}<br>${escapeHtml(group.detail)}</li>`,
                        )
                        .join("");
                      const report = `<!doctype html><meta charset="utf-8"><title>PlantUML review</title><h1>${escapeHtml(fileName)} review</h1><p>Generated locally. ${reviewGroups.length} change groups.</p><ol>${rows}</ol><h2>Source patch</h2><pre>${escapeHtml(createUnifiedPatch(fileName, leftSource, rightSource))}</pre>`;
                      download(report, `${fileName}-review.html`, "text/html;charset=utf-8");
                    }}
                  >
                    Export review report
                  </button>
                  <button
                    type="button"
                    disabled={!selectedGroups.size || applying}
                    onClick={() => {
                      setApplying(true);
                      void onApplyReview(reviewedSource).finally(() => setApplying(false));
                    }}
                  >
                    {applying ? "Applying…" : `Apply selected (${selectedGroups.size})`}
                  </button>
                </div>
              </div>
            ) : comparisonView === "source" ? (
              <div ref={diffElement} className="version-diff" role="table" aria-label="Source differences">
                {visibleDiff.map((line, index) => {
                  const rowChangeIndex = rowChangeIndices[index];
                  return (
                    <div
                      className={`version-diff-line ${line.kind}${rowChangeIndex === changeIndex ? " current-change" : ""}`}
                      role="row"
                      key={`${index}-${line.kind}`}
                      {...(rowChangeIndex === undefined ? {} : { "data-change-index": rowChangeIndex })}
                    >
                      <span>{line.leftNumber ?? ""}</span>
                      <code>{line.left ?? ""}</code>
                      <span>{line.rightNumber ?? ""}</span>
                      <code>{line.right ?? ""}</code>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="version-rendered-comparison" aria-label="Rendered differences">
                <RenderedVersion
                  title={selected ? versionTitle(selected) : "Selected version"}
                  status={leftRendered.status}
                  svg={leftRendered.result?.svg}
                  error={leftRendered.result?.error}
                />
                <RenderedVersion
                  title={compare ? versionTitle(compare) : "Current working copy"}
                  status={rightRendered.status}
                  svg={rightRendered.result?.svg}
                  error={rightRendered.result?.error}
                />
              </div>
            )}
            <div className="dialog-actions">
              <button type="button" disabled={!selected} onClick={() => selected && void onRestore(selected)}>
                Restore this version
              </button>
              <button type="button" onClick={onClose} disabled={creating}>
                Close
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function RenderedVersion({
  title,
  status,
  svg,
  error,
}: {
  title: string;
  status: "idle" | "rendering" | "error";
  svg: string | undefined;
  error: string | undefined;
}) {
  return (
    <section className="version-render-panel" aria-label={title}>
      <strong>{title}</strong>
      <div className="version-render-canvas">
        {status === "rendering" && !svg ? <p>Rendering…</p> : null}
        {error ? <p className="version-render-error">{error}</p> : null}
        {svg ? <div dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }} /> : null}
      </div>
    </section>
  );
}
