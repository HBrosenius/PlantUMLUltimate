import { useEffect, useMemo, useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import { downloadText, downloadSvgAsPng, svgFileName } from "./file-service";
import { copyText, downloadDiagramPdf, pdfPageSize } from "./diagram-export";
import { encodedDiagramUrl, exportPreferencesKey, loadExportOptions, prepareExportSvg } from "./export-preview";

export function ExportDialog({
  mode,
  source,
  svg,
  fileName,
  current,
  onClose,
}: {
  mode: "export" | "share";
  source: string;
  svg?: string | undefined;
  fileName: string;
  current: boolean;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);
  const [options, setOptions] = useState(loadExportOptions);
  const [server, setServer] = useState("https://www.plantuml.com/plantuml");
  const [acknowledged, setAcknowledged] = useState(false);
  const [output, setOutput] = useState("");
  useEffect(() => {
    setOutput("");
    setAcknowledged(false);
  }, [source]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const prepared = useMemo(() => {
    if (!svg) return undefined;
    try {
      return prepareExportSvg(svg, options);
    } catch {
      return undefined;
    }
  }, [svg, options]);
  const preview = prepared ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(prepared.svg)}` : undefined;
  const change = (next: typeof options) => {
    setOptions(next);
    setMessage("");
  };
  const download = async () => {
    if (!current || !prepared) return;
    setBusy(true);
    setMessage("");
    try {
      if (options.format === "svg") downloadText(prepared.svg, svgFileName(fileName), "image/svg+xml;charset=utf-8");
      else if (options.format === "png") await downloadSvgAsPng(prepared.svg, fileName, options.scale);
      else await downloadDiagramPdf(prepared.svg, fileName, options.scale);
      try {
        localStorage.setItem(exportPreferencesKey, JSON.stringify(options));
      } catch {
        /* Export still succeeds. */
      }
      setMessage("Exported local file");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <div
        ref={dialog}
        className="task-dialog export-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "export" ? "Export preview" : "Link and embed sharing"}
      >
        <h2>{mode === "export" ? "Export preview" : "Link and embed sharing"}</h2>
        {mode === "export" ? (
          <>
            <p>
              {current
                ? "Preview matches the current successfully rendered source."
                : "Preview is stale or unavailable. Render the current source before exporting."}
            </p>
            <label>
              Format
              <select
                value={options.format}
                onChange={(e) => change({ ...options, format: e.target.value as typeof options.format })}
              >
                <option value="svg">SVG</option>
                <option value="png">PNG</option>
                <option value="pdf">PDF</option>
              </select>
            </label>
            <label>
              Raster scale
              <select
                disabled={options.format === "svg"}
                value={options.scale}
                onChange={(e) => change({ ...options, scale: Number(e.target.value) })}
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}×
                  </option>
                ))}
              </select>
            </label>
            <label>
              Margin
              <select value={options.margin} onChange={(e) => change({ ...options, margin: Number(e.target.value) })}>
                {[0, 16, 32, 64].map((n) => (
                  <option key={n} value={n}>
                    {n} px
                  </option>
                ))}
              </select>
            </label>
            <label>
              Background
              <select
                disabled={options.format === "pdf"}
                value={options.format === "pdf" ? "white" : options.background}
                onChange={(e) => change({ ...options, background: e.target.value as typeof options.background })}
              >
                <option value="authored">Authored background / transparency</option>
                <option value="white">White behind diagram</option>
              </select>
            </label>
            <p>
              Authored fills remain intact. PDF uses a white page and rasterized diagram. Preview includes the full
              rendered image, without editor selection or overlays.
            </p>
            {prepared && (
              <p>
                Image bounds: {prepared.width} × {prepared.height} px
                {options.format !== "svg" &&
                  `; raster ${Math.round(prepared.width * options.scale)} × ${Math.round(prepared.height * options.scale)} px`}
                . PDF fits these bounds to its page.
              </p>
            )}
            {prepared && options.format === "pdf" && (
              <p>
                PDF page: {pdfPageSize(prepared.width, prepared.height).width} ×{" "}
                {pdfPageSize(prepared.width, prepared.height).height} pt.
              </p>
            )}
            {preview && <img className="export-image-preview" src={preview} alt="Full diagram export preview" />}
            <button disabled={!current || !prepared || busy} onClick={() => void download()}>
              Download {options.format.toUpperCase()}
            </button>
          </>
        ) : (
          <>
            <p>
              This creates an encoded source URL, not a collaboration link. Encoding is not encryption. Anyone with the
              URL can recover the source. Loading the URL or embedding it sends the diagram source to the renderer
              below; it is not an offline share.
            </p>
            <label>
              Renderer base URL
              <input
                type="url"
                value={server}
                onChange={(e) => {
                  setServer(e.target.value);
                  setAcknowledged(false);
                  setOutput("");
                }}
              />
            </label>
            <p>
              The link contains the current authored PlantUML source. External rendering can differ from this app’s
              local preview and overlays.
            </p>
            <label className="export-consent">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => {
                  setAcknowledged(e.target.checked);
                  setOutput("");
                }}
              />
              I understand that opening the link sends source to this renderer.
            </label>
            <button
              disabled={!acknowledged}
              onClick={() => {
                try {
                  setOutput(encodedDiagramUrl(source, server));
                  setMessage("");
                } catch (error) {
                  setOutput("");
                  setMessage((error as Error).message);
                }
              }}
            >
              Generate link locally
            </button>
            {output && (
              <>
                <label>
                  Encoded image URL
                  <textarea aria-label="Encoded image URL" readOnly value={output} />
                </label>
                <label>
                  Markdown image
                  <textarea aria-label="Markdown image" readOnly value={`![Diagram](${output})`} />
                </label>
                <button
                  onClick={() =>
                    void copyText(output).then(
                      () => setMessage("Copied URL"),
                      (e) => setMessage(e.message),
                    )
                  }
                >
                  Copy URL
                </button>
                <button
                  onClick={() =>
                    void copyText(`![Diagram](${output})`).then(
                      () => setMessage("Copied Markdown"),
                      (e) => setMessage(e.message),
                    )
                  }
                >
                  Copy Markdown image
                </button>
              </>
            )}
            <p>For a local artifact, use File → Export → Preview export… or the quick SVG, PNG and PDF commands.</p>
          </>
        )}
        {message && <p role="status">{message}</p>}
        <div className="dialog-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
