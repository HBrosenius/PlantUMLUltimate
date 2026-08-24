import { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentVersion } from "./workspace-storage";
import { diffVersionSources } from "./version-diff";
import { useDialogFocus } from "./use-dialog-focus";
import { useRenderer } from "./render/use-renderer";

function versionTitle(version: DocumentVersion): string {
  return version.label?.trim() || `${version.reason.replaceAll("-", " ")} · ${new Date(version.createdAt).toLocaleString()}`;
}

export function VersionHistoryDialog({
  versions,
  currentSource,
  onCreate,
  onRestore,
  onUpdate,
  onDelete,
  onClose,
}: {
  versions: readonly DocumentVersion[];
  currentSource: string;
  onCreate(label: string): Promise<void>;
  onRestore(version: DocumentVersion): Promise<void>;
  onUpdate(version: DocumentVersion, patch: { label?: string; pinned?: boolean }): Promise<void>;
  onDelete(version: DocumentVersion): Promise<void>;
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
  const [comparisonView, setComparisonView] = useState<"source" | "rendered">("source");
  const selected = versions.find((version) => version.id === selectedId) ?? versions[0];
  const compare = versions.find((version) => version.id === compareId);
  const rightSource = compare?.source ?? currentSource;
  const leftSource = selected?.source ?? currentSource;
  const leftRendered = useRenderer(leftSource, comparisonView === "rendered");
  const rightRendered = useRenderer(rightSource, comparisonView === "rendered");
  const diff = useMemo(
    () => diffVersionSources(leftSource, rightSource),
    [leftSource, rightSource],
  );
  const visibleDiff = useMemo(
    () => changesOnly ? diff.filter((line) => line.kind !== "equal") : diff,
    [changesOnly, diff],
  );
  const rowChangeIndices = useMemo(() => {
    let next = 0;
    return visibleDiff.map((line) => line.kind === "equal" ? undefined : next++);
  }, [visibleDiff]);
  const changeCount = rowChangeIndices.filter((index) => index !== undefined).length;
  useEffect(() => {
    setEditLabel(selected?.label ?? "");
    setChangeIndex(0);
  }, [compareId, selected?.id, selected?.label]);
  const moveToChange = (direction: -1 | 1) => {
    if (!changeCount) return;
    const next = (changeIndex + direction + changeCount) % changeCount;
    setChangeIndex(next);
    window.setTimeout(() => {
      diffElement.current?.querySelector<HTMLElement>(`[data-change-index="${next}"]`)?.scrollIntoView({ block: "center" });
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
          <button type="button" onClick={onClose} aria-label="Close version history">×</button>
        </header>
        <div className="version-create">
          <input aria-label="New version name" placeholder="Optional version name" value={label} onChange={(event) => setLabel(event.target.value)} />
          <button type="button" onClick={() => void onCreate(label).then(() => setLabel(""))}>Create version</button>
        </div>
        <div className="version-history-body">
          <aside aria-label="Versions">
            {versions.length ? versions.map((version) => (
              <div className={`version-list-item${version.id === selected?.id ? " selected" : ""}`} key={version.id}>
                <button type="button" aria-label={`Select version ${versionTitle(version)}`} onClick={() => setSelectedId(version.id)}>
                  <strong>{versionTitle(version)}</strong>
                  <span>{version.source.split("\n").length} lines{version.pinned ? " · pinned" : ""}</span>
                </button>
                <button
                  type="button"
                  className="version-pin"
                  aria-label={`${version.pinned ? "Unpin" : "Pin"} ${versionTitle(version)}`}
                  title={version.pinned ? "Unpin version" : "Pin version"}
                  onClick={() => void onUpdate(version, { pinned: !version.pinned })}
                >
                  {version.pinned ? "★" : "☆"}
                </button>
              </div>
            )) : <p>No versions yet. Create the first checkpoint above.</p>}
          </aside>
          <section className="version-compare" aria-label="Version comparison">
            <div className="version-compare-controls">
              <span>{selected ? versionTitle(selected) : "No historical version"}</span>
              <span>compared with</span>
              <select aria-label="Compare with" value={compareId} onChange={(event) => setCompareId(event.target.value)}>
                <option value="current">Current working copy</option>
                {versions.filter((version) => version.id !== selected?.id).map((version) => (
                  <option key={version.id} value={version.id}>{versionTitle(version)}</option>
                ))}
              </select>
              <div className="version-view-switch" role="group" aria-label="Comparison view">
                <button type="button" aria-pressed={comparisonView === "source"} onClick={() => setComparisonView("source")}>Source</button>
                <button type="button" aria-pressed={comparisonView === "rendered"} onClick={() => setComparisonView("rendered")}>Rendered</button>
              </div>
            </div>
            {selected && <div className="version-edit-controls">
              <input aria-label="Selected version name" value={editLabel} onChange={(event) => setEditLabel(event.target.value)} placeholder="Version name" />
              <button type="button" onClick={() => void onUpdate(selected, { label: editLabel })}>Save name</button>
              <button type="button" onClick={() => void onUpdate(selected, { pinned: !selected.pinned })}>{selected.pinned ? "Unpin" : "Pin"}</button>
              <button type="button" className="danger" onClick={() => void onDelete(selected)}>Delete</button>
            </div>}
            {comparisonView === "source" && <div className="version-diff-navigation">
              <label><input type="checkbox" checked={changesOnly} onChange={(event) => setChangesOnly(event.target.checked)} /> Changes only</label>
              <span>{changeCount} changed line{changeCount === 1 ? "" : "s"}</span>
              <button type="button" disabled={!changeCount} onClick={() => moveToChange(-1)}>Previous change</button>
              <button type="button" disabled={!changeCount} onClick={() => moveToChange(1)}>Next change</button>
            </div>}
            {comparisonView === "source" ? <div ref={diffElement} className="version-diff" role="table" aria-label="Source differences">
              {visibleDiff.map((line, index) => {
                const rowChangeIndex = rowChangeIndices[index];
                return <div
                  className={`version-diff-line ${line.kind}${rowChangeIndex === changeIndex ? " current-change" : ""}`}
                  role="row"
                  key={`${index}-${line.kind}`}
                  {...(rowChangeIndex === undefined ? {} : { "data-change-index": rowChangeIndex })}
                >
                  <span>{line.leftNumber ?? ""}</span><code>{line.left ?? ""}</code>
                  <span>{line.rightNumber ?? ""}</span><code>{line.right ?? ""}</code>
                </div>;
              })}
            </div> : <div className="version-rendered-comparison" aria-label="Rendered differences">
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
            </div>}
            <div className="dialog-actions">
              <button type="button" disabled={!selected} onClick={() => selected && void onRestore(selected)}>Restore this version</button>
              <button type="button" onClick={onClose}>Close</button>
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
  return <section className="version-render-panel" aria-label={title}>
    <strong>{title}</strong>
    <div className="version-render-canvas">
      {status === "rendering" && !svg ? <p>Rendering…</p> : null}
      {error ? <p className="version-render-error">{error}</p> : null}
      {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : null}
    </div>
  </section>;
}
