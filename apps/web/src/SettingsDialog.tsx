import { useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import { PLANTUML_THEMES } from "./plantuml-theme";
import { PlantUmlUltimateLogo } from "./NewDocumentDialog";
import type { Theme } from "./model";

export interface AppSettings {
  theme: Theme;
  advancedMode: boolean;
  defaultDiagramTheme: string;
}

export function SettingsDialog({
  mode,
  current,
  onApply,
  onClose,
}: {
  mode: "onboarding" | "settings";
  current: AppSettings;
  onApply(settings: AppSettings): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, mode === "onboarding" ? () => undefined : onClose);
  const [theme, setTheme] = useState<Theme>(current.theme);
  const [advancedMode, setAdvancedMode] = useState(current.advancedMode);
  const [defaultDiagramTheme, setDefaultDiagramTheme] = useState(current.defaultDiagramTheme);

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        ref={dialog}
        className={`document-settings-dialog settings-dialog${mode === "onboarding" ? " settings-dialog-onboarding" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "onboarding" ? "Welcome to PlantUML Ultimate" : "Settings"}
        onSubmit={(event) => {
          event.preventDefault();
          onApply({ theme, advancedMode, defaultDiagramTheme });
        }}
      >
        {mode === "onboarding" ? (
          <header className="welcome-splash">
            <PlantUmlUltimateLogo />
            <div className="welcome-splash-copy">
              <p className="welcome-eyebrow">Visual PlantUML workspace</p>
              <h2 id="settings-dialog-title">Welcome to PlantUML Ultimate</h2>
              <p>Choose a few starting preferences. You can change these later from File &gt; Settings.</p>
              <p className="welcome-byline">Created by HBrosenius · Local-first · Runs in your browser</p>
            </div>
          </header>
        ) : (
          <header>
            <h2>Settings</h2>
          </header>
        )}
        <section className="document-settings-section" aria-labelledby="settings-appearance-heading">
          <h3 id="settings-appearance-heading">Appearance</h3>
          <label>
            Theme
            <select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Default diagram theme
            <select value={defaultDiagramTheme} onChange={(event) => setDefaultDiagramTheme(event.target.value)}>
              <option value="">Default PlantUML</option>
              {PLANTUML_THEMES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <p>Applied to new diagrams you create. Existing diagrams keep their own saved theme.</p>
        </section>
        <section className="document-settings-section" aria-labelledby="settings-mode-heading">
          <h3 id="settings-mode-heading">Editing mode</h3>
          <label className="document-settings-checkbox">
            <input type="checkbox" checked={advancedMode} onChange={(event) => setAdvancedMode(event.target.checked)} />{" "}
            Advanced mode
          </label>
          <p>
            {advancedMode ? "Also shows the Code and Split views alongside Diagram." : "Shows the Diagram view only."}
          </p>
        </section>
        <footer>
          {mode === "settings" && (
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          )}
          <button type="submit">{mode === "onboarding" ? "Get started" : "Apply"}</button>
        </footer>
      </form>
    </div>
  );
}
