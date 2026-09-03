import { useEffect, useId, useState } from "react";
import { ColorField, SharedColorDatalist } from "./ColorField";
import type { UseCaseSettings } from "./usecase-settings";

export function UseCaseSettingsInspector({
  settings,
  onChange,
  onClose,
}: {
  settings: UseCaseSettings;
  onChange(value: UseCaseSettings): void;
  onClose(): void;
}) {
  const [value, setValue] = useState(settings);
  const colorListId = useId();
  useEffect(() => setValue(settings), [settings]);
  const update = <K extends keyof UseCaseSettings>(key: K, next: UseCaseSettings[K], save = false) => {
    const updated = { ...value, [key]: next };
    setValue(updated);
    if (save) onChange(updated);
  };
  const save = () => onChange(value);
  const color = (label: string, key: keyof UseCaseSettings, placeholder: string) => (
    <ColorField
      label={label}
      namePrefix="#"
      value={String(value[key])}
      placeholder={placeholder}
      onChange={(next) => update(key, next as never)}
      onBlur={save}
      datalistId={colorListId}
    />
  );

  return (
    <aside
      className="task-inspector sequence-settings-inspector usecase-settings-inspector"
      aria-label="Use Case settings"
    >
      <header>
        <div>
          <strong>Use Case settings</strong>
          <small>Presentation, layout, typography, and diagram colors</small>
        </div>
        <button onClick={onClose} aria-label="Close Use Case settings">
          ×
        </button>
      </header>
      <form onSubmit={(event) => event.preventDefault()}>
        <fieldset>
          <legend>General</legend>
          <label>
            Layout direction
            <select
              value={value.direction}
              onChange={(event) => update("direction", event.target.value as UseCaseSettings["direction"], true)}
            >
              <option value="">PlantUML default</option>
              <option value="left-to-right">Left to right</option>
              <option value="top-to-bottom">Top to bottom</option>
            </select>
          </label>
          <label>
            Diagram title
            <input value={value.title} onChange={(event) => update("title", event.target.value)} onBlur={save} />
          </label>
          <label>
            Caption
            <input value={value.caption} onChange={(event) => update("caption", event.target.value)} onBlur={save} />
          </label>
          <div className="sequence-settings-grid">
            <label>
              Page header
              <input value={value.header} onChange={(event) => update("header", event.target.value)} onBlur={save} />
            </label>
            <label>
              Page footer
              <input value={value.footer} onChange={(event) => update("footer", event.target.value)} onBlur={save} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Layout and style</legend>
          <label>
            Package style
            <select
              value={value.packageStyle}
              onChange={(event) => update("packageStyle", event.target.value as UseCaseSettings["packageStyle"], true)}
            >
              <option value="">PlantUML default</option>
              <option value="rectangle">Rectangle</option>
              <option value="node">Node</option>
              <option value="folder">Folder</option>
              <option value="frame">Frame</option>
              <option value="cloud">Cloud</option>
              <option value="database">Database</option>
            </select>
          </label>
          <div className="sequence-setting-toggles">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={value.shadowing}
                onChange={(event) => update("shadowing", event.target.checked, true)}
              />
              <span>Show shadows</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={value.monochrome}
                onChange={(event) => update("monochrome", event.target.checked, true)}
              />
              <span>Monochrome diagram</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={value.handwritten}
                onChange={(event) => update("handwritten", event.target.checked, true)}
              />
              <span>Handwritten style</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={value.hideStereotypes}
                onChange={(event) => update("hideStereotypes", event.target.checked, true)}
              />
              <span>Hide stereotype labels</span>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Typography</legend>
          <div className="sequence-settings-grid">
            <label>
              Default font
              <input
                value={value.defaultFontName}
                onChange={(event) => update("defaultFontName", event.target.value)}
                onBlur={save}
                placeholder="Inter"
              />
            </label>
            <label>
              Font size
              <input
                type="number"
                min="1"
                value={value.defaultFontSize}
                onChange={(event) => update("defaultFontSize", event.target.value)}
                onBlur={save}
                placeholder="14"
              />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Colors</legend>
          <div className="sequence-settings-grid">
            {color("Actor fill", "actorBackgroundColor", "#EFF6FF")}
            {color("Actor border", "actorBorderColor", "#2563EB")}
            {color("Use case fill", "usecaseBackgroundColor", "#F8FAFC")}
            {color("Use case border", "usecaseBorderColor", "#475569")}
            {color("Arrow", "arrowColor", "#334155")}
            {color("Note fill", "noteBackgroundColor", "#FEF3C7")}
            {color("Note border", "noteBorderColor", "#D97706")}
          </div>
          <SharedColorDatalist id={colorListId} namePrefix="#" />
        </fieldset>
        <p className="field-hint">Text and color fields are saved when you leave the field.</p>
      </form>
    </aside>
  );
}
