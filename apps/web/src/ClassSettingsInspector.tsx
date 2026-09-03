import { useEffect, useId, useState } from "react";
import { ColorField, SharedColorDatalist } from "./ColorField";
import type { ClassSettings } from "./class-settings";
export function ClassSettingsInspector({
  settings,
  onChange,
  onClose,
}: {
  settings: ClassSettings;
  onChange(v: ClassSettings): void;
  onClose(): void;
}) {
  const [v, setV] = useState(settings);
  const colorListId = useId();
  useEffect(() => setV(settings), [settings]);
  const up = <K extends keyof ClassSettings>(k: K, z: ClassSettings[K], save = false) => {
    const n = { ...v, [k]: z };
    setV(n);
    if (save) onChange(n);
  };
  const save = () => onChange(v);
  return (
    <aside className="task-inspector sequence-settings-inspector" aria-label="Class settings">
      <header>
        <div>
          <strong>Class settings</strong>
          <small>Presentation, members, typography, and colors</small>
        </div>
        <button onClick={onClose}>×</button>
      </header>
      <form onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>General</legend>
          <label>
            Layout direction
            <select
              value={v.direction}
              onChange={(e) => up("direction", e.target.value as ClassSettings["direction"], true)}
            >
              <option value="">PlantUML default</option>
              <option value="left-to-right">Left to right</option>
              <option value="top-to-bottom">Top to bottom</option>
            </select>
          </label>
          <label>
            Title
            <input value={v.title} onChange={(e) => up("title", e.target.value)} onBlur={save} />
          </label>
          <div className="sequence-settings-grid">
            <label>
              Header
              <input value={v.header} onChange={(e) => up("header", e.target.value)} onBlur={save} />
            </label>
            <label>
              Footer
              <input value={v.footer} onChange={(e) => up("footer", e.target.value)} onBlur={save} />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Members</legend>
          {[
            ["hideEmptyFields", "Hide empty field sections"],
            ["hideEmptyMethods", "Hide empty method sections"],
            ["attributeIcons", "Show member visibility icons"],
            ["shadowing", "Show shadows"],
          ].map(([k, l]) => (
            <label className="checkbox-row" key={k}>
              <input
                type="checkbox"
                checked={v[k as keyof ClassSettings] as boolean}
                onChange={(e) => up(k as keyof ClassSettings, e.target.checked as never, true)}
              />
              <span>{l}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Typography</legend>
          {[
            ["defaultFontName", "Default font"],
            ["defaultFontSize", "Font size"],
          ].map(([k, l]) => (
            <label key={k}>
              {l}
              <input
                value={v[k as keyof ClassSettings] as string}
                onChange={(e) => up(k as keyof ClassSettings, e.target.value as never)}
                onBlur={save}
              />
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Colors</legend>
          {[
            ["classBackgroundColor", "Class fill"],
            ["classBorderColor", "Class border"],
            ["arrowColor", "Arrow color"],
          ].map(([k, l]) => (
            <ColorField
              key={k}
              label={l as string}
              value={v[k as keyof ClassSettings] as string}
              onChange={(next) => up(k as keyof ClassSettings, next as never)}
              onBlur={save}
              datalistId={colorListId}
            />
          ))}
          <SharedColorDatalist id={colorListId} />
        </fieldset>
        <p className="field-hint">Text fields save when you leave the field.</p>
      </form>
    </aside>
  );
}
