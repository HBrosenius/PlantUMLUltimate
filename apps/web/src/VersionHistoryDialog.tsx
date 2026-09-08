import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { DocumentVersion } from "./workspace-storage";
import { diffVersionSources } from "./version-diff";
import { useDialogFocus } from "./use-dialog-focus";
import { useRenderer } from "./render/use-renderer";
import { sanitizeSvg } from "./render/sanitize-svg";
import type { DiagramKind } from "./model";
import {
  applyReviewGroups,
  buildReviewGroups,
  createReviewReport,
  createUnifiedPatch,
  type ReviewTarget,
} from "./semantic-review";
import { detectDiagramKind } from "./diagram-kind";
import { useDiagramNavigation } from "./useDiagramNavigation";
import { addCanonicalGanttOverlay } from "./render/canonical-gantt-overlay";
import { parseGantt } from "@plantuml-studio/diagram-gantt";

const MAX_REVIEW_IMPORT_BYTES = 5 * 1024 * 1024;

function download(content: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

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
  const baseImportInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
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
  const [activeGroupId, setActiveGroupId] = useState<string>();
  const [importedBase, setImportedBase] = useState<{ name: string; source: string }>();
  const [importedComparison, setImportedComparison] = useState<{ name: string; source: string }>();
  const [importError, setImportError] = useState("");
  const selected = versions.find((version) => version.id === selectedId) ?? versions[0];
  const compare = versions.find((version) => version.id === compareId);
  const rightSource =
    compareId === "imported" ? (importedComparison?.source ?? currentSource) : (compare?.source ?? currentSource);
  const leftSource = importedBase?.source ?? selected?.source ?? currentSource;
  const canApplyReview = !importedBase || importedBase.source === currentSource;
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
  const diffGroupIds = useMemo(() => {
    const leftGroups = new Map<number, string>();
    const rightGroups = new Map<number, string>();
    for (const group of reviewGroups) {
      for (let line = group.startLeft; line < group.startLeft + group.deleteCount; line += 1)
        leftGroups.set(line, group.id);
      for (let line = group.startRight; line < group.startRight + group.replacement.length; line += 1)
        rightGroups.set(line, group.id);
    }
    return visibleDiff.map((line) => {
      if (line.kind === "removed" && line.leftNumber !== undefined) return leftGroups.get(line.leftNumber - 1);
      if (line.kind === "added" && line.rightNumber !== undefined) return rightGroups.get(line.rightNumber - 1);
      return undefined;
    });
  }, [reviewGroups, visibleDiff]);
  useEffect(() => {
    setEditLabel(selected?.label ?? "");
    setChangeIndex(0);
    setSelectedGroups(new Set());
    setActiveGroupId(reviewGroups[0]?.id);
  }, [compareId, importedBase?.source, importedComparison?.source, reviewGroups, selected?.id, selected?.label]);
  const scrollToReviewGroup = (groupId: string) => {
    window.setTimeout(() => {
      diffElement.current
        ?.querySelector<HTMLElement>(`[data-review-group-id="${groupId}"]`)
        ?.scrollIntoView({ block: "center" });
    });
  };
  const showReviewGroupInSource = (groupId: string) => {
    setActiveGroupId(groupId);
    setComparisonView("source");
    scrollToReviewGroup(groupId);
  };
  const showReviewGroupInDiagram = (groupId: string) => {
    setActiveGroupId(groupId);
    setComparisonView("rendered");
  };
  const moveToReviewGroup = (direction: -1 | 1) => {
    if (!reviewGroups.length) return;
    const currentIndex = reviewGroups.findIndex((group) => group.id === activeGroupId);
    const nextIndex = (Math.max(currentIndex, 0) + direction + reviewGroups.length) % reviewGroups.length;
    const nextId = reviewGroups[nextIndex]!.id;
    setActiveGroupId(nextId);
    scrollToReviewGroup(nextId);
  };
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
  const readReviewImport = async (file: File) => {
    setImportError("");
    if (file.size > MAX_REVIEW_IMPORT_BYTES) {
      setImportError("Choose a PlantUML file smaller than 5 MB.");
      return undefined;
    }
    try {
      const source = await file.text();
      const importedKind = detectDiagramKind(source);
      if (!importedKind) {
        setImportError("This file does not contain a recognized PlantUML diagram.");
        return undefined;
      }
      if (importedKind !== diagramKind) {
        setImportError(`This ${importedKind} diagram cannot be reviewed against the current ${diagramKind} diagram.`);
        return undefined;
      }
      return { name: file.name, source };
    } catch {
      setImportError("The selected file could not be read.");
      return undefined;
    }
  };
  const importBase = async (file: File) => {
    const imported = await readReviewImport(file);
    if (imported) setImportedBase(imported);
  };
  const importComparison = async (file: File) => {
    const imported = await readReviewImport(file);
    if (imported) {
      setImportedComparison(imported);
      setCompareId("imported");
    }
  };

  return (
    <div className="modal-backdrop version-history-backdrop" role="presentation">
      <div ref={dialog} className="version-history-dialog" role="dialog" aria-modal="true" aria-label="Version history">
        <header>
          <div>
            <h2>Version history</h2>
            <p>
              Saved checkpoints are separate from Undo and remain available after restoring. Resize from the lower-right
              corner.
            </p>
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
                    onClick={() => {
                      setImportedBase(undefined);
                      setSelectedId(version.id);
                    }}
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
              <span>
                {importedBase
                  ? `Imported: ${importedBase.name}`
                  : selected
                    ? versionTitle(selected)
                    : "Current working copy"}
              </span>
              <span>compared with</span>
              <select
                aria-label="Compare with"
                value={compareId}
                onChange={(event) => setCompareId(event.target.value)}
              >
                <option value="current">Current working copy</option>
                {importedComparison ? <option value="imported">Imported: {importedComparison.name}</option> : null}
                {versions
                  .filter((version) => version.id !== selected?.id)
                  .map((version) => (
                    <option key={version.id} value={version.id}>
                      {versionTitle(version)}
                    </option>
                  ))}
              </select>
              <input
                ref={baseImportInput}
                type="file"
                accept=".puml,.plantuml,text/plain"
                hidden
                aria-label="PlantUML base file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void importBase(file);
                }}
              />
              <button type="button" onClick={() => baseImportInput.current?.click()}>
                Import base…
              </button>
              <input
                ref={importInput}
                type="file"
                accept=".puml,.plantuml,text/plain"
                hidden
                aria-label="PlantUML comparison file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void importComparison(file);
                }}
              />
              <button type="button" onClick={() => importInput.current?.click()}>
                Import comparison…
              </button>
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
            {importError ? (
              <p className="version-import-error" role="alert">
                {importError}
              </p>
            ) : null}
            {selected && !importedBase && (
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
                <button type="button" disabled={!reviewGroups.length} onClick={() => moveToReviewGroup(-1)}>
                  Previous group
                </button>
                <button type="button" disabled={!reviewGroups.length} onClick={() => moveToReviewGroup(1)}>
                  Next group
                </button>
                <span className="version-active-review-group" aria-live="polite">
                  {reviewGroups.find((group) => group.id === activeGroupId)?.title ?? "No active group"}
                </span>
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
                        <div
                          className={`semantic-review-group ${group.confidence}${activeGroupId === group.id ? " active" : ""}`}
                          key={group.id}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Select ${group.title}`}
                            disabled={!confirmed}
                            checked={selectedGroups.has(group.id)}
                            onChange={(event) => {
                              const next = new Set(selectedGroups);
                              if (event.target.checked) next.add(group.id);
                              else next.delete(group.id);
                              setSelectedGroups(next);
                            }}
                          />
                          <span className="semantic-review-group-copy">
                            <strong>{group.title}</strong>
                            <small>{group.confidence[0]!.toUpperCase() + group.confidence.slice(1)}</small>
                            <span>{group.detail}</span>
                          </span>
                          <span className="semantic-review-inspect">
                            <button
                              type="button"
                              disabled={!confirmed || (!group.leftTargets.length && !group.rightTargets.length)}
                              aria-label={`Show ${group.title} in rendered diagrams`}
                              onClick={() => showReviewGroupInDiagram(group.id)}
                            >
                              Show in diagram
                            </button>
                            <button
                              type="button"
                              aria-label={`Show ${group.title} in source`}
                              onClick={() => showReviewGroupInSource(group.id)}
                            >
                              Show in source
                            </button>
                          </span>
                        </div>
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
                    onClick={() =>
                      download(
                        createReviewReport(fileName, leftSource, rightSource, reviewGroups),
                        `${fileName}-review.html`,
                        "text/html;charset=utf-8",
                      )
                    }
                  >
                    Export review report
                  </button>
                  <button
                    type="button"
                    disabled={!selectedGroups.size || applying || !canApplyReview}
                    onClick={() => {
                      setApplying(true);
                      void onApplyReview(reviewedSource).finally(() => setApplying(false));
                    }}
                  >
                    {applying ? "Applying…" : `Apply selected (${selectedGroups.size})`}
                  </button>
                </div>
                {!canApplyReview ? (
                  <p className="version-import-warning" role="status">
                    Applying is disabled because the working copy does not match the imported base. You can still export
                    the selected patch.
                  </p>
                ) : null}
              </div>
            ) : comparisonView === "source" ? (
              <div ref={diffElement} className="version-diff" role="table" aria-label="Source differences">
                {visibleDiff.map((line, index) => {
                  const rowChangeIndex = rowChangeIndices[index];
                  const reviewGroupId = diffGroupIds[index];
                  return (
                    <div
                      className={`version-diff-line ${line.kind}${rowChangeIndex === changeIndex ? " current-change" : ""}${reviewGroupId === activeGroupId ? " active-review-group" : ""}`}
                      role="row"
                      key={`${index}-${line.kind}`}
                      {...(rowChangeIndex === undefined ? {} : { "data-change-index": rowChangeIndex })}
                      {...(reviewGroupId === undefined ? {} : { "data-review-group-id": reviewGroupId })}
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
                  title={
                    importedBase
                      ? `Imported: ${importedBase.name}`
                      : selected
                        ? versionTitle(selected)
                        : "Current working copy"
                  }
                  status={leftRendered.status}
                  svg={leftRendered.result?.svg}
                  error={leftRendered.result?.error}
                  targets={reviewGroups.find((group) => group.id === activeGroupId)?.leftTargets ?? []}
                  source={leftSource}
                  diagramKind={diagramKind}
                />
                <RenderedVersion
                  title={
                    compareId === "imported" && importedComparison
                      ? `Imported: ${importedComparison.name}`
                      : compare
                        ? versionTitle(compare)
                        : "Current working copy"
                  }
                  status={rightRendered.status}
                  svg={rightRendered.result?.svg}
                  error={rightRendered.result?.error}
                  targets={reviewGroups.find((group) => group.id === activeGroupId)?.rightTargets ?? []}
                  source={rightSource}
                  diagramKind={diagramKind}
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
  targets,
  source,
  diagramKind,
}: {
  title: string;
  status: "idle" | "rendering" | "error";
  svg: string | undefined;
  error: string | undefined;
  targets: readonly ReviewTarget[];
  source: string;
  diagramKind: DiagramKind;
}) {
  const [zoom, setZoom] = useState(1);
  const navigation = useDiagramNavigation(zoom, setZoom);
  const diagram = useRef<HTMLDivElement>(null);
  const highlightedSvg = useMemo(() => {
    if (!svg) return undefined;
    let rendered = svg;
    if (diagramKind === "gantt") {
      const document = parseGantt(source).document;
      rendered = addCanonicalGanttOverlay(rendered, document.tasks, document.dependencies);
    }
    return highlightReviewSvg(sanitizeSvg(rendered), targets);
  }, [diagramKind, source, svg, targets]);
  useLayoutEffect(() => {
    const root = diagram.current;
    if (!root) return;
    root.querySelector<SVGElement>(".semantic-render-highlight")?.scrollIntoView({ block: "center", inline: "center" });
  }, [highlightedSvg]);
  return (
    <section className="version-render-panel" aria-label={title}>
      <header className="version-render-header">
        <strong>{title}</strong>
        <button type="button" aria-label={`Reset zoom for ${title}`} onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
      </header>
      <div
        ref={(element) => {
          diagram.current = element;
          navigation.viewportRef.current = element;
        }}
        className="version-render-canvas"
        aria-label={`${title} rendered diagram`}
        onWheel={navigation.onWheel}
        onPointerDown={navigation.onPointerDown}
        onAuxClick={navigation.onAuxClick}
      >
        {status === "rendering" && !svg ? <p>Rendering…</p> : null}
        {error ? <p className="version-render-error">{error}</p> : null}
        {highlightedSvg && targets.length > 0 && !highlightedSvg.includes("semantic-render-highlight") ? (
          <p className="version-render-fallback" role="status">
            No unambiguous rendered match. Use the source highlight for this side.
          </p>
        ) : null}
        {highlightedSvg ? (
          <div style={{ width: `${zoom * 100}%` }} dangerouslySetInnerHTML={{ __html: highlightedSvg }} />
        ) : null}
      </div>
    </section>
  );
}

function highlightReviewSvg(svg: string, targets: readonly ReviewTarget[]): string {
  if (typeof DOMParser === "undefined" || !targets.length) return svg;
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) return svg;
  const root = document.documentElement;
  const highlighted = new Set<SVGElement>();
  const mark = (element: SVGElement | null | undefined) => {
    if (!element) return;
    element.classList.add("semantic-render-highlight");
    highlighted.add(element);
  };
  for (const target of targets) {
    if (target.kind === "gantt-task") {
      const taskGeometry = [...root.querySelectorAll<SVGElement>("[data-visual-task-id]")].filter(
        (element) => element.getAttribute("data-visual-task-id")?.toLowerCase() === target.id.toLowerCase(),
      );
      taskGeometry.forEach(mark);
      continue;
    }
    if (target.kind === "gantt-dependency") {
      const dependency = [
        ...root.querySelectorAll<SVGElement>("[data-predecessor-task-id][data-successor-task-id]"),
      ].find(
        (element) =>
          element.getAttribute("data-predecessor-task-id")?.toLowerCase() === target.predecessorId.toLowerCase() &&
          element.getAttribute("data-successor-task-id")?.toLowerCase() === target.successorId.toLowerCase(),
      );
      mark(dependency);
      continue;
    }
    const text = [...root.querySelectorAll<SVGTextElement>("text")];
    if (target.kind === "sequence-participant") {
      const labels = new Set([target.label.trim(), target.alias?.trim()].filter(Boolean));
      const matches = text.filter((element) => labels.has(element.textContent?.trim() ?? ""));
      if (matches.length > 0 && matches.length <= 2) matches.forEach(mark);
      continue;
    }
    const matches = text.filter((element) => {
      const content = element.textContent?.trim() ?? "";
      return content === target.label || content.endsWith(target.label);
    });
    if (matches.length === 1) mark(matches[0]);
  }
  return highlighted.size ? new XMLSerializer().serializeToString(root) : svg;
}
