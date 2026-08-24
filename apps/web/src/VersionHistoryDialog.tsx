import { useMemo, useRef, useState } from "react";
import type { DocumentVersion } from "./workspace-storage";
import { diffVersionSources } from "./version-diff";
import { useDialogFocus } from "./use-dialog-focus";

function versionTitle(version: DocumentVersion): string {
  return version.label?.trim() || `${version.reason.replaceAll("-", " ")} · ${new Date(version.createdAt).toLocaleString()}`;
}

export function VersionHistoryDialog({
  versions,
  currentSource,
  onCreate,
  onRestore,
  onClose,
}: {
  versions: readonly DocumentVersion[];
  currentSource: string;
  onCreate(label: string): Promise<void>;
  onRestore(version: DocumentVersion): Promise<void>;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);
  const [selectedId, setSelectedId] = useState(versions[0]?.id ?? "");
  const [compareId, setCompareId] = useState("current");
  const [label, setLabel] = useState("");
  const selected = versions.find((version) => version.id === selectedId) ?? versions[0];
  const compare = versions.find((version) => version.id === compareId);
  const rightSource = compare?.source ?? currentSource;
  const diff = useMemo(
    () => diffVersionSources(selected?.source ?? currentSource, rightSource),
    [currentSource, rightSource, selected?.source],
  );

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
          <input aria-label="Version name" placeholder="Optional version name" value={label} onChange={(event) => setLabel(event.target.value)} />
          <button type="button" onClick={() => void onCreate(label).then(() => setLabel(""))}>Create version</button>
        </div>
        <div className="version-history-body">
          <aside aria-label="Versions">
            {versions.length ? versions.map((version) => (
              <button
                type="button"
                key={version.id}
                className={version.id === selected?.id ? "selected" : ""}
                onClick={() => setSelectedId(version.id)}
              >
                <strong>{versionTitle(version)}</strong>
                <span>{version.source.split("\n").length} lines{version.pinned ? " · pinned" : ""}</span>
              </button>
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
            </div>
            <div className="version-diff" role="table" aria-label="Source differences">
              {diff.map((line, index) => (
                <div className={`version-diff-line ${line.kind}`} role="row" key={`${index}-${line.kind}`}>
                  <span>{line.leftNumber ?? ""}</span><code>{line.left ?? ""}</code>
                  <span>{line.rightNumber ?? ""}</span><code>{line.right ?? ""}</code>
                </div>
              ))}
            </div>
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
