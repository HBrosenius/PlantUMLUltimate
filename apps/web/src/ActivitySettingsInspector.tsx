import { useEffect, useId, useState } from "react";
import { ColorField, SharedColorDatalist } from "./ColorField";
import type { ActivitySettings } from "./activity-settings";

export function ActivitySettingsInspector({
  settings,
  onChange,
  onClose,
}: {
  settings: ActivitySettings;
  onChange(value: ActivitySettings): void;
  onClose(): void;
}) {
  const [value, setValue] = useState(settings);
  const colorListId = useId();
  useEffect(() => setValue(settings), [settings]);
  const update = <K extends keyof ActivitySettings>(key: K, content: ActivitySettings[K], save = false) => {
    const next = { ...value, [key]: content };
    setValue(next);
    if (save) onChange(next);
  };
  return (
    <aside className="task-inspector sequence-settings-inspector" aria-label="Activity settings">
      <header>
        <div>
          <strong>Activity settings</strong>
          <small>Presentation, typography, and colors</small>
        </div>
        <button onClick={onClose}>×</button>
      </header>
      <form onSubmit={(event) => event.preventDefault()}>
        <fieldset>
          <legend>General</legend>
          <label>
            Title
            <input
              value={value.title}
              onChange={(event) => update("title", event.target.value)}
              onBlur={(event) => update("title", event.currentTarget.value, true)}
            />
          </label>
          <div className="sequence-settings-grid">
            <label>
              Header
              <input
                value={value.header}
                onChange={(event) => update("header", event.target.value)}
                onBlur={(event) => update("header", event.currentTarget.value, true)}
              />
            </label>
            <label>
              Footer
              <input
                value={value.footer}
                onChange={(event) => update("footer", event.target.value)}
                onBlur={(event) => update("footer", event.currentTarget.value, true)}
              />
            </label>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={value.shadowing}
              onChange={(event) => update("shadowing", event.target.checked, true)}
            />
            <span>Show shadows</span>
          </label>
        </fieldset>
        <fieldset>
          <legend>Colors</legend>
          {[
            ["activityBackgroundColor", "Action fill"],
            ["activityBorderColor", "Action border"],
            ["activityDiamondBackgroundColor", "Decision fill"],
            ["arrowColor", "Arrow color"],
          ].map(([key, label]) => (
            <ColorField
              key={key}
              label={label as string}
              value={value[key as keyof ActivitySettings] as string}
              onChange={(next) => update(key as keyof ActivitySettings, next as never)}
              onBlur={() => update(key as keyof ActivitySettings, value[key as keyof ActivitySettings] as never, true)}
              datalistId={colorListId}
            />
          ))}
          <SharedColorDatalist id={colorListId} />
        </fieldset>
        <fieldset>
          <legend>Typography</legend>
          {[
            ["defaultFontName", "Default font"],
            ["defaultFontSize", "Font size"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={value[key as keyof ActivitySettings] as string}
                onChange={(event) => update(key as keyof ActivitySettings, event.target.value as never)}
                onBlur={(event) => update(key as keyof ActivitySettings, event.currentTarget.value as never, true)}
              />
            </label>
          ))}
        </fieldset>
        <p className="field-hint">Text fields save when you leave the field.</p>
      </form>
    </aside>
  );
}
