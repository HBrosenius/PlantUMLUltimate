import { useMemo, useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import type { DiagramKind } from "./model";
import { PLANTUML_THEMES, setPlantUmlTheme } from "./plantuml-theme";
import { useRenderer } from "./render/use-renderer";

const THEME_PREVIEW_SOURCES: Record<DiagramKind, string> = {
  gantt: [
    "@startgantt",
    "Project starts 2026-09-01",
    "[Plan] lasts 3 days",
    "[Build] starts at [Plan]'s end",
    "[Build] lasts 4 days",
    "@endgantt",
  ].join("\n"),
  sequence: [
    "@startuml",
    "actor User",
    "participant App",
    "User -> App: Request",
    "App --> User: Response",
    "@enduml",
  ].join("\n"),
  usecase: ["@startuml", "actor User", "(Sign in) as Login", "User --> Login", "@enduml"].join("\n"),
  class: ["@startuml", "class Order {", "  +total(): Money", "}", "class Item", "Order *-- Item", "@enduml"].join("\n"),
  activity: ["@startuml", "start", ":Plan;", "if (Approved?) then (yes)", "  :Build;", "endif", "stop", "@enduml"].join(
    "\n",
  ),
  wbs: ["@startwbs", "* Project", "** Discovery", "** Delivery", "@endwbs"].join("\n"),
};

export interface DocumentFormatSettings {
  compression: "gzip" | "none";
  encrypted: boolean;
  password?: string;
  maxVersions: number;
  maxLogicalMiB: number;
  diagramTheme?: string;
}

export function DocumentSettingsDialog({
  current,
  diagramKind = "gantt",
  onApply,
  onClose,
}: {
  current: Omit<DocumentFormatSettings, "password">;
  diagramKind?: DiagramKind;
  onApply(settings: DocumentFormatSettings): Promise<void>;
  onClose(): void;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);
  const [compression, setCompression] = useState(current.compression);
  const [encrypted, setEncrypted] = useState(current.encrypted);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [maxVersions, setMaxVersions] = useState(current.maxVersions);
  const [maxLogicalMiB, setMaxLogicalMiB] = useState(current.maxLogicalMiB);
  const [diagramTheme, setDiagramTheme] = useState(current.diagramTheme ?? "");
  const customDiagramTheme = diagramTheme && !PLANTUML_THEMES.some((theme) => theme === diagramTheme);
  const previewSource = useMemo(
    () => setPlantUmlTheme(THEME_PREVIEW_SOURCES[diagramKind], diagramTheme || undefined),
    [diagramKind, diagramTheme],
  );
  const themePreview = useRenderer(previewSource, current.diagramTheme !== undefined, "native");
  const [busy, setBusy] = useState(false);
  const needsPassword = encrypted && (!current.encrypted || Boolean(password));
  const passwordError = needsPassword && (password.length < 12 || password !== confirmation);
  return (
    <div className="modal-backdrop" role="presentation">
      <form
        ref={dialog}
        className="document-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Document settings"
        onSubmit={(event) => {
          event.preventDefault();
          if (passwordError) return;
          setBusy(true);
          void onApply({
            compression,
            encrypted,
            ...(password ? { password } : {}),
            maxVersions,
            maxLogicalMiB,
            ...(current.diagramTheme !== undefined ? { diagramTheme } : {}),
          })
            .then(onClose)
            .catch(() => undefined)
            .finally(() => setBusy(false));
        }}
      >
        <header>
          <h2>Document settings</h2>
        </header>
        {current.diagramTheme !== undefined && (
          <section className="document-settings-section" aria-labelledby="diagram-appearance-heading">
            <h3 id="diagram-appearance-heading">Diagram appearance</h3>
            <label>
              PlantUML theme
              <select value={diagramTheme} onChange={(event) => setDiagramTheme(event.target.value)}>
                <option value="">Default PlantUML</option>
                {customDiagramTheme && <option value={diagramTheme}>{diagramTheme} (from source)</option>}
                {PLANTUML_THEMES.map((theme) => (
                  <option key={theme} value={theme}>
                    {theme}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Stored as a native !theme directive so it travels with the diagram.{" "}
              <a href="https://plantuml.com/theme-gallery" target="_blank" rel="noreferrer">
                View the official theme gallery
              </a>
              .
            </p>
            <div className="document-theme-preview" aria-label="Theme preview" aria-live="polite">
              {themePreview.result?.svg ? (
                <div dangerouslySetInnerHTML={{ __html: themePreview.result.svg }} />
              ) : themePreview.status === "error" ? (
                <span>Theme preview unavailable</span>
              ) : (
                <span>Rendering theme preview…</span>
              )}
            </div>
          </section>
        )}
        <section className="document-settings-section" aria-labelledby="portable-format-heading">
          <h3 id="portable-format-heading">Portable file</h3>
          <label>
            Compression
            <select value={compression} onChange={(event) => setCompression(event.target.value as "gzip" | "none")}>
              <option value="gzip">Gzip (recommended)</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="document-settings-checkbox">
            <input type="checkbox" checked={encrypted} onChange={(event) => setEncrypted(event.target.checked)} />{" "}
            Password protection
          </label>
          {encrypted && (
            <>
              <p>
                There is no password recovery. Encrypted unsaved changes are kept only in this session. Collaboration
                and plaintext exports are not end-to-end encrypted.
              </p>
              <label>
                {current.encrypted ? "New password (leave blank to keep current)" : "Password"}
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              {password && (
                <label>
                  Confirm password
                  <input
                    type="password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </label>
              )}
              {passwordError && <p role="alert">Use at least 12 characters and enter the same password twice.</p>}
            </>
          )}
          <label>
            Maximum versions
            <input
              type="number"
              min="10"
              max="500"
              value={maxVersions}
              onChange={(event) => setMaxVersions(Number(event.target.value))}
            />
          </label>
          <label>
            History budget (MiB)
            <input
              type="number"
              min="1"
              max="64"
              value={maxLogicalMiB}
              onChange={(event) => setMaxLogicalMiB(Number(event.target.value))}
            />
          </label>
        </section>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy || Boolean(passwordError)}>
            {busy ? "Applying…" : "Apply"}
          </button>
        </footer>
      </form>
    </div>
  );
}
