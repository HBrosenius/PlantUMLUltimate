import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import { importedDiagramKind } from "./import-source";
import {
  loadRecentFiles,
  readRecentHandle,
  removeRecentFile,
  type RecentFile,
  type OpenDestination,
} from "./recent-files";
import { openDocumentFile, readDocumentBytes, readDocumentFile, type OpenedFileBytes } from "./file-service";

export function OpenWorkDialog({
  onOpen,
  onClose,
}: {
  onOpen(file: OpenedFileBytes, destination: OpenDestination): Promise<boolean>;
  onClose(): void;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  const errorElement = useRef<HTMLParagraphElement>(null);
  const [entries, setEntries] = useState<RecentFile[]>([]);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState<OpenDestination>("diagram");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<RecentFile>();
  useDialogFocus(dialog, () => {
    if (!busy) onClose();
  });
  useEffect(() => {
    let active = true;
    void loadRecentFiles().then((files) => {
      if (active) setEntries(files);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (error) errorElement.current?.scrollIntoView?.({ block: "nearest" });
  }, [error]);
  let detected = "";
  if (source.trim()) {
    try {
      detected = importedDiagramKind(source);
    } catch {
      /* Explain validation on Import. */
    }
  }
  const attempt = async (operation: () => Promise<OpenedFileBytes | undefined>, target = destination) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const file = await operation();
      if (!file) return;
      if (file.kind === "legacy") importedDiagramKind(file.source ?? "");
      if (await onOpen(file, target)) onClose();
      else
        setError(
          "Opening was cancelled or could not finish. Current work is unchanged; choose the file again or try another destination.",
        );
    } catch (failure) {
      setError(
        failure instanceof DOMException && failure.name === "NotAllowedError"
          ? "File access was denied. Choose Locate file… or Choose file… to grant access again."
          : failure instanceof DOMException && failure.name === "NotFoundError"
            ? "The file was moved or is unavailable. Choose Locate file… to find it again."
            : failure instanceof Error
              ? failure.message
              : "Could not open this file. Locate it again or choose another file.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <form
        ref={dialog}
        className="document-settings-dialog open-work-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Open existing work"
        onSubmit={(event) => {
          event.preventDefault();
          void attempt(async () => {
            importedDiagramKind(source);
            return {
              kind: "legacy",
              importedSource: true,
              source,
              bytes: new TextEncoder().encode(source),
              fileName: "imported.puml",
              size: new Blob([source]).size,
              lastModified: Date.now(),
            };
          });
        }}
      >
        <header>
          <h2>Open existing work</h2>
        </header>
        <p>
          Open as a separate diagram tab or a document. Your current diagram is never replaced by dropping or pasting
          source.
        </p>
        <label>
          Open as
          <select
            aria-label="Open as"
            value={destination}
            disabled={busy}
            onChange={(event) => setDestination(event.target.value as OpenDestination)}
          >
            <option value="diagram">Separate diagram tab</option>
            <option value="document">Document</option>
          </select>
        </label>
        <p>
          For a .pumlu document containing several diagrams, choose Document. Opening another document uses the usual
          unsaved-work checks.
        </p>
        <button type="button" disabled={busy} onClick={() => void attempt(openDocumentFile)}>
          Choose file…
        </button>
        {error && (
          <p ref={errorElement} role="alert">
            {error}
          </p>
        )}
        <section className="document-settings-section" aria-labelledby="recent-files-heading">
          <h3 id="recent-files-heading">Recent files</h3>
          <p>
            References to files you opened, not recovered browser content. Files are read again when reopened; no file
            contents are stored in this list.
          </p>
          {entries.length ? (
            <ul className="recent-files-list">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setRecovery(entry);
                      void attempt(async () => readDocumentBytes(await readRecentHandle(entry)), entry.destination);
                    }}
                  >
                    {entry.fileName}
                  </button>
                  <span>
                    {entry.destination === "document" ? "Document" : "Diagram"} ·{" "}
                    {entry.handle ? "File reference" : "Locate file to reopen"}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Remove ${entry.fileName} from recent files`}
                    onClick={() => {
                      void removeRecentFile(entry.id).then(() => {
                        setEntries((current) => current.filter((item) => item.id !== entry.id));
                        if (recovery?.id === entry.id) {
                          setRecovery(undefined);
                          setError("");
                        }
                      });
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No recent files yet. Recovered diagrams remain in your workspace tabs.</p>
          )}
          {recovery && (
            <button type="button" disabled={busy} onClick={() => void attempt(openDocumentFile, recovery.destination)}>
              Locate file…
            </button>
          )}
        </section>
        <section className="document-settings-section" aria-labelledby="import-heading">
          <h3 id="import-heading">Import PlantUML</h3>
          <div
            className="file-drop-area"
            role="region"
            aria-label="Drop PlantUML files"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const files = [...event.dataTransfer.files];
              if (files.length !== 1 || !/\.(puml|pumlu|plantuml)$/i.test(files[0]!.name)) {
                setError("Drop one .puml, .plantuml or .pumlu file.");
                return;
              }
              void attempt(() => readDocumentFile(files[0]!));
            }}
          >
            Drop one .puml or .pumlu file here, or choose a file above.
          </div>
          <label>
            PlantUML source
            <textarea
              value={source}
              onChange={(event) => setSource(event.target.value)}
              disabled={busy}
              rows={8}
              spellCheck={false}
            />
          </label>
          <p role="status">
            {detected
              ? `Detected ${detected} diagram`
              : "Paste a complete diagram, including its @start and @end lines."}
          </p>
        </section>
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !source.trim()}>
            {busy ? "Opening…" : "Import source"}
          </button>
        </footer>
      </form>
    </div>
  );
}
