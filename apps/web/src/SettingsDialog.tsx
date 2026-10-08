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

function EditingModePreview({ split }: { split: boolean }) {
  const chartX = split ? 151 : 36;
  return (
    <svg className="editing-mode-preview" viewBox="0 0 280 150" aria-hidden="true" focusable="false">
      <rect className="editing-preview-window" x="1" y="1" width="278" height="148" rx="8" />
      <path className="editing-preview-toolbar" d="M9 1h262a8 8 0 0 1 8 8v20H1V9a8 8 0 0 1 8-8Z" />
      <circle cx="12" cy="15" r="3" fill="#ef9b9b" />
      <circle cx="23" cy="15" r="3" fill="#e7c66c" />
      <circle cx="34" cy="15" r="3" fill="#8fbda0" />
      <text className="editing-preview-caption" x="46" y="18">
        Project plan
      </text>
      {split && (
        <g className="editing-preview-code">
          <path className="editing-preview-divider" d="M140 29v120" />
          <text x="10" y="47">
            PlantUML code
          </text>
          <text className="editing-preview-directive" x="10" y="66">
            @startgantt
          </text>
          <text x="10" y="83">
            [Plan] lasts 2 days
          </text>
          <text x="10" y="100">
            [Build] lasts 4 days
          </text>
          <text x="10" y="117">
            [Ship] lasts 1 day
          </text>
          <text className="editing-preview-directive" x="10" y="134">
            @endgantt
          </text>
        </g>
      )}
      <g transform={`translate(${chartX}, 0)`}>
        <text className="editing-preview-caption" x="0" y="47">
          Diagram
        </text>
        {[0, 1, 2, 3, 4].map((day) => (
          <path className="editing-preview-grid" key={day} d={`M${day * (split ? 25 : 45)} 56v79`} />
        ))}
        <text className="editing-preview-caption" x="0" y="71">
          Plan
        </text>
        <rect x="0" y="76" width={split ? 37 : 65} height="9" rx="3" fill="#80b5f8" />
        <text className="editing-preview-caption" x={split ? 29 : 50} y="99">
          Build
        </text>
        <rect x={split ? 29 : 50} y="104" width={split ? 62 : 100} height="9" rx="3" fill="#a6d2ba" />
        <text className="editing-preview-caption" x={split ? 83 : 139} y="127">
          Ship
        </text>
        <rect x={split ? 83 : 139} y="132" width={split ? 23 : 35} height="9" rx="3" fill="#e8c782" />
      </g>
    </svg>
  );
}

export function SettingsDialog({
  mode,
  current,
  onApply,
  onClose,
  onPreview,
  resourceWarningsEnabled = true,
  onResourceWarningsChange,
}: {
  mode: "onboarding" | "settings";
  current: AppSettings;
  onApply(settings: AppSettings): void;
  onClose(): void;
  onPreview?(settings: AppSettings): void;
  resourceWarningsEnabled?: boolean;
  onResourceWarningsChange?(enabled: boolean): void;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, mode === "onboarding" ? () => undefined : onClose);
  const [theme, setTheme] = useState<Theme>(current.theme);
  const [advancedMode, setAdvancedMode] = useState(current.advancedMode);
  const [defaultDiagramTheme, setDefaultDiagramTheme] = useState(current.defaultDiagramTheme);
  const [showResourceWarnings, setShowResourceWarnings] = useState(resourceWarningsEnabled);

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
          onResourceWarningsChange?.(showResourceWarnings);
          onApply({ theme, advancedMode, defaultDiagramTheme });
        }}
      >
        {mode === "onboarding" ? (
          <header className="welcome-splash">
            <PlantUmlUltimateLogo />
            <div className="welcome-splash-copy">
              <p className="welcome-eyebrow">Visual PlantUML workspace</p>
              <h2 id="settings-dialog-title">Welcome to PlantUML Ultimate</h2>
              <p>
                Create a diagram, open a file, or try an example. These starting preferences are optional and can be
                changed in Settings.
              </p>
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
            <select
              value={theme}
              onChange={(event) => {
                const value = event.target.value as Theme;
                setTheme(value);
                onPreview?.({ theme: value, advancedMode, defaultDiagramTheme });
              }}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Default diagram theme
            <select
              value={defaultDiagramTheme}
              onChange={(event) => {
                const value = event.target.value;
                setDefaultDiagramTheme(value);
                onPreview?.({ theme, advancedMode, defaultDiagramTheme: value });
              }}
            >
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
          <p>Choose how you want to work. You can change this at any time.</p>
          <div className="editing-mode-options" role="radiogroup" aria-labelledby="settings-mode-heading">
            {[false, true].map((advanced) => (
              <label
                className={`editing-mode-option${advancedMode === advanced ? " selected" : ""}`}
                key={String(advanced)}
              >
                <EditingModePreview split={advanced} />
                <span className="editing-mode-option-title">
                  <input
                    type="radio"
                    name="editing-mode"
                    value={advanced ? "advanced" : "visual"}
                    checked={advancedMode === advanced}
                    aria-label={advanced ? "Diagram + code" : "Diagram only"}
                    aria-describedby={advanced ? "editing-mode-code-description" : "editing-mode-visual-description"}
                    onChange={() => setAdvancedMode(advanced)}
                  />
                  <strong>{advanced ? "Diagram + code" : "Diagram only"}</strong>
                </span>
                <span
                  className="editing-mode-option-description"
                  id={advanced ? "editing-mode-code-description" : "editing-mode-visual-description"}
                >
                  {advanced
                    ? "Opens code and diagram side by side. Includes Code, Split and Diagram views."
                    : "Edit with visual tools in a full-width diagram. The code editor is hidden."}
                </span>
              </label>
            ))}
          </div>
        </section>
        {mode === "settings" && onResourceWarningsChange && (
          <section className="document-settings-section" aria-labelledby="settings-gantt-heading">
            <h3 id="settings-gantt-heading">Gantt</h3>
            <label className="document-settings-checkbox">
              <input
                type="checkbox"
                checked={showResourceWarnings}
                onChange={(event) => setShowResourceWarnings(event.target.checked)}
                aria-describedby="settings-resource-warnings-description"
              />
              Show resource over-allocation warnings
            </label>
            <p id="settings-resource-warnings-description">
              Turn off the warning banner when an assigned person represents a whole team. Workload calculations and
              capacity details remain available. Applies to all Gantt diagrams in this browser.
            </p>
          </section>
        )}
        <footer>
          {mode === "onboarding" && (
            <button type="button" onClick={() => onApply(current)}>
              Use defaults
            </button>
          )}
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
