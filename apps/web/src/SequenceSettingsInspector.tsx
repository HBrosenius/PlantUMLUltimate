import { useId, useState } from "react";
import { ColorField, SharedColorDatalist } from "./ColorField";
import type { SequenceSettings } from "./sequence-settings";

export function SequenceSettingsInspector({
  settings,
  onApply,
  onClose,
}: {
  settings: SequenceSettings;
  onApply(value: SequenceSettings): void;
  onClose(): void;
}) {
  const [value, setValue] = useState(settings);
  const colorListId = useId();
  const update = <K extends keyof SequenceSettings>(key: K, next: SequenceSettings[K]) =>
    setValue((current) => ({ ...current, [key]: next }));
  const color = (label: string, key: keyof SequenceSettings, placeholder: string) => (
    <ColorField
      label={label}
      value={value[key] as string}
      onChange={(next) => update(key, next as never)}
      placeholder={placeholder}
      datalistId={colorListId}
    />
  );

  return (
    <aside className="task-inspector sequence-settings-inspector" aria-label="Sequence settings">
      <header>
        <div>
          <strong>Sequence settings</strong>
          <small>Presentation, layout, and diagram colors</small>
        </div>
        <button onClick={onClose} aria-label="Close Sequence settings">
          ×
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply(value);
        }}
      >
        <fieldset>
          <legend>General</legend>
          <label>
            Diagram title
            <input value={value.title} onChange={(event) => update("title", event.target.value)} />
          </label>
          <div className="sequence-settings-grid">
            <label>
              Page header
              <input value={value.header} onChange={(event) => update("header", event.target.value)} />
            </label>
            <label>
              Page footer
              <input value={value.footer} onChange={(event) => update("footer", event.target.value)} />
            </label>
          </div>
          <div className="sequence-setting-toggles">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={value.autoactivate}
                onChange={(event) => update("autoactivate", event.target.checked)}
              />
              <span>Automatically activate lifelines</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={value.hideFootbox}
                onChange={(event) => update("hideFootbox", event.target.checked)}
              />
              <span>Hide participant footboxes</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={value.hideUnlinked}
                onChange={(event) => update("hideUnlinked", event.target.checked)}
              />
              <span>Hide unlinked participants</span>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Message numbering</legend>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={value.autonumber}
              onChange={(event) => update("autonumber", event.target.checked)}
            />
            <span>Enable autonumbering</span>
          </label>
          {value.autonumber && (
            <div className="sequence-settings-grid three-columns">
              <label>
                Start
                <input
                  type="number"
                  value={value.autonumberStart}
                  onChange={(event) => update("autonumberStart", event.target.value)}
                  placeholder="1"
                />
              </label>
              <label>
                Increment
                <input
                  type="number"
                  value={value.autonumberIncrement}
                  onChange={(event) => update("autonumberIncrement", event.target.value)}
                  placeholder="1"
                />
              </label>
              <label>
                Format
                <input
                  value={value.autonumberFormat}
                  onChange={(event) => update("autonumberFormat", event.target.value)}
                  placeholder="000"
                />
              </label>
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>Layout</legend>
          <div className="sequence-setting-toggles">
            <label className="checkbox-row">
              <input type="checkbox" checked={value.teoz} onChange={(event) => update("teoz", event.target.checked)} />
              <span>Enable Teoz layout engine</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={value.responseBelowArrow}
                onChange={(event) => update("responseBelowArrow", event.target.checked)}
              />
              <span>Place response text below arrows</span>
            </label>
          </div>
          <label>
            Message alignment
            <select
              value={value.messageAlignment}
              onChange={(event) =>
                update("messageAlignment", event.target.value as SequenceSettings["messageAlignment"])
              }
            >
              <option value="">Default</option>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <div className="sequence-settings-grid three-columns">
            <label>
              Message wrap width
              <input
                type="number"
                min="1"
                value={value.maxMessageSize}
                onChange={(event) => update("maxMessageSize", event.target.value)}
                placeholder="Default"
              />
            </label>
            <label>
              Participant padding
              <input
                type="number"
                min="0"
                value={value.participantPadding}
                onChange={(event) => update("participantPadding", event.target.value)}
                placeholder="Default"
              />
            </label>
            <label>
              Box padding
              <input
                type="number"
                min="0"
                value={value.boxPadding}
                onChange={(event) => update("boxPadding", event.target.value)}
                placeholder="Default"
              />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Colors</legend>
          <div className="sequence-settings-grid">
            {color("Arrow color", "arrowColor", "#2563EB")}
            {color("Lifeline color", "lifelineColor", "#64748B")}
            {color("Participant fill", "participantBackgroundColor", "#FFFFFF")}
            {color("Participant border", "participantBorderColor", "#2563EB")}
            {color("Note fill", "noteBackgroundColor", "#FEF3C7")}
            {color("Note border", "noteBorderColor", "#D97706")}
          </div>
          {color("Fragment border", "groupBorderColor", "#64748B")}
          <SharedColorDatalist id={colorListId} />
        </fieldset>

        <div className="inspector-actions">
          <button type="button" onClick={() => setValue(settings)}>
            Reset
          </button>
          <button className="primary" type="submit">
            Apply
          </button>
        </div>
      </form>
    </aside>
  );
}
