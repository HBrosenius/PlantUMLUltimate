import { useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import type { DiagramKind } from "./model";
import { ThemeGallery } from "./ThemeGallery";
import { browserForecastTimeZone, validForecastTimeZone } from "./forecast-date";

export interface DocumentFormatSettings {
  compression: "gzip" | "none";
  encrypted: boolean;
  password?: string;
  maxVersions: number;
  maxLogicalMiB: number;
  diagramTheme?: string;
  forecastTimeZone?: string;
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
  const [forecastTimeZone, setForecastTimeZone] = useState(current.forecastTimeZone ?? "");
  const deviceTimeZone = browserForecastTimeZone();
  const [busy, setBusy] = useState(false);
  const needsPassword = encrypted && (!current.encrypted || Boolean(password));
  const passwordError = needsPassword && (password.length < 12 || password !== confirmation);
  const forecastTimeZoneError = current.forecastTimeZone !== undefined && !validForecastTimeZone(forecastTimeZone);
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
          if (passwordError || forecastTimeZoneError) return;
          setBusy(true);
          void onApply({
            compression,
            encrypted,
            ...(password ? { password } : {}),
            maxVersions,
            maxLogicalMiB,
            ...(current.diagramTheme !== undefined ? { diagramTheme } : {}),
            ...(current.forecastTimeZone !== undefined ? { forecastTimeZone } : {}),
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
            <ThemeGallery
              value={diagramTheme}
              onChange={setDiagramTheme}
              diagramKind={diagramKind}
              label="PlantUML theme"
            />
            <p>
              Applies to this diagram on Apply and is stored as a native !theme directive. Cancel leaves the diagram
              unchanged. Exports use this authored appearance.
            </p>
          </section>
        )}
        {current.forecastTimeZone !== undefined && (
          <section className="document-settings-section" aria-labelledby="forecast-time-zone-heading">
            <h3 id="forecast-time-zone-heading">Progress forecast</h3>
            <label>
              Forecast time zone
              <input
                type="text"
                value={forecastTimeZone}
                onChange={(event) => setForecastTimeZone(event.target.value.trim())}
                aria-invalid={forecastTimeZoneError}
                aria-describedby={forecastTimeZoneError ? "forecast-time-zone-error" : "forecast-time-zone-help"}
              />
            </label>
            <div className="document-settings-shortcuts">
              <button type="button" onClick={() => setForecastTimeZone(deviceTimeZone)}>
                Use this device ({deviceTimeZone})
              </button>
              <button type="button" onClick={() => setForecastTimeZone("UTC")}>
                Use UTC
              </button>
            </div>
            {forecastTimeZoneError ? (
              <p id="forecast-time-zone-error" role="alert">
                Enter a valid time zone, such as Europe/Stockholm.
              </p>
            ) : (
              <p id="forecast-time-zone-help">
                Automatic Today uses this saved time zone for everyone opening the document. A selected As of date stays
                fixed.
              </p>
            )}
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
          <button type="submit" disabled={busy || Boolean(passwordError) || forecastTimeZoneError}>
            {busy ? "Applying…" : "Apply"}
          </button>
        </footer>
      </form>
    </div>
  );
}
