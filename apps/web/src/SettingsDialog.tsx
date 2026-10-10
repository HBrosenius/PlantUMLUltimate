import { loadEditorPreferences, saveEditorPreferences } from "./editor-preferences";
import { useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import { ThemeGallery } from "./ThemeGallery";
import { PlantUmlUltimateLogo } from "./NewDocumentDialog";
import type { Theme } from "./model";

export interface AppSettings {
  startupMode?: "restore" | "chooser" | undefined;
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
  scheduleMode = "ask",
  onScheduleModeChange,
  resourceWarningsEnabled = true,
  onResourceWarningsChange,
}: {
  mode: "onboarding" | "settings";
  current: AppSettings;
  onApply(settings: AppSettings): void;
  onClose(): void;
  onPreview?(settings: AppSettings): void;
  scheduleMode?: "ask" | "single" | "cascade";
  onScheduleModeChange?(value: "ask" | "single" | "cascade"): void;
  resourceWarningsEnabled?: boolean;
  onResourceWarningsChange?(enabled: boolean): void;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, mode === "onboarding" ? () => undefined : onClose);
  const [editor, setEditor] = useState(loadEditorPreferences);
  const [theme, setTheme] = useState<Theme>(current.theme);
  const [advancedMode, setAdvancedMode] = useState(current.advancedMode);
  const [defaultDiagramTheme, setDefaultDiagramTheme] = useState(current.defaultDiagramTheme);
  const [startupMode, setStartupMode] = useState(current.startupMode ?? "restore");
  const [movePolicy, setMovePolicy] = useState(scheduleMode);
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
          saveEditorPreferences(editor);
          onResourceWarningsChange?.(showResourceWarnings);
          onScheduleModeChange?.(movePolicy);
          onApply({ theme, advancedMode, defaultDiagramTheme, startupMode });
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
              aria-label="Theme"
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
          <label className="document-settings-checkbox">
            <input
              type="checkbox"
              checked={editor.adaptPreview}
              onChange={(event) => setEditor({ ...editor, adaptPreview: event.target.checked })}
              aria-describedby="adapt-preview-help"
            />
            Adapt preview to app theme
          </label>
          <p id="adapt-preview-help">
            Adds a soft light backing and dims diagram colors in dark app appearance. Preview only: source and exported
            images keep their authored colors. Off by default.
          </p>
        </section>
        <section className="document-settings-section" aria-labelledby="settings-diagram-theme-heading">
          <h3 id="settings-diagram-theme-heading">New diagram theme</h3>
          <ThemeGallery
            value={defaultDiagramTheme}
            onChange={(value) => {
              setDefaultDiagramTheme(value);
              onPreview?.({ theme, advancedMode, defaultDiagramTheme: value });
            }}
            label="Default diagram theme"
          />
          <p>
            Applied to new diagrams you create. Existing diagrams keep their own saved theme. Change the current diagram
            in Document settings.
          </p>
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
                    ? "Starts with code and diagram side by side. Switch views at any time."
                    : "Starts with a full-width diagram. Use Code or Split to reveal the source at any time."}
                </span>
              </label>
            ))}
          </div>
        </section>
        <section className="document-settings-section" aria-labelledby="settings-editor-heading">
          <h3 id="settings-editor-heading">Code editor · this browser</h3>
          <p>Applies to source editors without changing diagram source.</p>
          <label>
            Font size (px)
            <input
              type="number"
              min="10"
              max="32"
              value={editor.fontSize}
              onChange={(event) => setEditor({ ...editor, fontSize: Number(event.target.value) })}
            />
          </label>
          <label>
            Tab size
            <select
              aria-label="Tab size"
              value={editor.tabSize}
              onChange={(event) => setEditor({ ...editor, tabSize: Number(event.target.value) })}
            >
              {[2, 4, 8].map((size) => (
                <option key={size} value={size}>
                  {size} spaces
                </option>
              ))}
            </select>
          </label>
          <label className="document-settings-checkbox">
            <input
              type="checkbox"
              checked={editor.wordWrap}
              onChange={(event) => setEditor({ ...editor, wordWrap: event.target.checked })}
            />
            Word wrap
          </label>
          <label className="document-settings-checkbox">
            <input
              type="checkbox"
              checked={editor.lineNumbers}
              onChange={(event) => setEditor({ ...editor, lineNumbers: event.target.checked })}
            />
            Line numbers
          </label>
        </section>
        <section className="document-settings-section" aria-labelledby="settings-defaults-heading">
          <h3 id="settings-defaults-heading">New diagram tabs · this browser</h3>
          <p>Defaults apply when opening a new tab without saved choices. Existing tabs keep their view and zoom.</p>
          <label>
            Default view
            <select
              aria-label="Default view"
              value={editor.defaultView}
              onChange={(event) =>
                setEditor({ ...editor, defaultView: event.target.value as typeof editor.defaultView })
              }
            >
              <option value="current">Use current view</option>
              <option value="code">Code</option>
              <option value="split">Split</option>
              <option value="diagram">Diagram</option>
            </select>
          </label>
          <label>
            Default zoom
            <select
              aria-label="Default zoom"
              value={editor.defaultZoom}
              onChange={(event) =>
                setEditor({ ...editor, defaultZoom: event.target.value === "fit" ? "fit" : Number(event.target.value) })
              }
            >
              <option value="fit">Fit diagram</option>
              {[0.5, 0.75, 1, 1.5, 2].map((zoom) => (
                <option key={zoom} value={zoom}>
                  {zoom * 100}%
                </option>
              ))}
            </select>
          </label>
        </section>
        {mode === "settings" && onResourceWarningsChange && (
          <section className="document-settings-section" aria-labelledby="settings-gantt-heading">
            <h3 id="settings-gantt-heading">Gantt preferences</h3>
            {onScheduleModeChange && (
              <>
                <label>
                  When moving tasks
                  <select
                    value={movePolicy}
                    onChange={(event) => setMovePolicy(event.target.value as typeof movePolicy)}
                    aria-describedby="move-policy-help"
                  >
                    <option value="ask">Always ask</option>
                    <option value="single">Only task</option>
                    <option value="cascade">Include dependents</option>
                  </select>
                </label>
                <p id="move-policy-help">
                  Default for task moves and rescheduling in this browser. Only task changes the selected task; Include
                  dependents can also move linked tasks. Always ask reviews affected dates when needed. Changing this
                  preference does not edit the plan.
                </p>
              </>
            )}
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
        {mode === "settings" && (
          <section className="document-settings-section" aria-labelledby="settings-startup-heading">
            <h3 id="settings-startup-heading">Startup</h3>
            <label>
              On startup
              <select
                value={startupMode}
                onChange={(event) => setStartupMode(event.target.value as "restore" | "chooser")}
              >
                <option value="restore">Restore last workspace</option>
                <option value="chooser">Start with chooser</option>
              </select>
            </label>
            <p>
              Both options restore your diagrams. The chooser lets you add a new diagram without replacing recovered
              work.
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
