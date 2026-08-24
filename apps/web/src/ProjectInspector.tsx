import { useEffect, useState } from "react";
import { WEEKDAY_NAMES, type ProjectSettings } from "./project-settings";

export function ProjectInspector({
  settings,
  onApply,
  onClose,
}: {
  settings: ProjectSettings;
  onApply(value: ProjectSettings): void;
  onClose(): void;
}) {
  const [value, setValue] = useState(settings);
  useEffect(() => setValue(settings), [settings]);
  const update = <K extends keyof ProjectSettings>(key: K, next: ProjectSettings[K]) =>
    setValue((current) => ({ ...current, [key]: next }));
  const mondayFirstWeekdays = [1, 2, 3, 4, 5, 6, 0];
  return (
    <aside className="task-inspector project-inspector" aria-label="Project and calendar inspector">
      <header>
        <strong>Project &amp; calendar</strong>
        <button onClick={onClose} aria-label="Close project inspector">
          ×
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply(value);
        }}
      >
        <label>
          Diagram title
          <input
            type="text"
            placeholder="Optional project title"
            value={value.title}
            onChange={(event) => update("title", event.target.value)}
          />
        </label>
        <label>
          Header
          <input
            type="text"
            placeholder="Optional page header"
            value={value.header}
            onChange={(event) => update("header", event.target.value)}
          />
        </label>
        <label>
          Footer
          <input
            type="text"
            placeholder="Optional page footer"
            value={value.footer}
            onChange={(event) => update("footer", event.target.value)}
          />
        </label>
        <label>
          Caption
          <input
            type="text"
            placeholder="Optional diagram caption"
            value={value.caption}
            onChange={(event) => update("caption", event.target.value)}
          />
        </label>
        <label>
          Project starts
          <input type="date" value={value.startDate} onChange={(event) => update("startDate", event.target.value)} />
        </label>
        <label>
          Time scale
          <select
            value={value.scale}
            onChange={(event) => update("scale", event.target.value as ProjectSettings["scale"])}
          >
            {["daily", "weekly", "monthly", "quarterly", "yearly"].map((scale) => (
              <option key={scale}>{scale}</option>
            ))}
          </select>
        </label>
        <label>
          Scale zoom
          <input
            type="number"
            min="1"
            step="1"
            placeholder="PlantUML default"
            value={value.scaleZoom}
            onChange={(event) => update("scaleZoom", event.target.value)}
          />
        </label>
        <fieldset>
          <legend>Closed weekdays</legend>
          <div className="weekday-grid">
            {mondayFirstWeekdays.map((index) => {
              const day = WEEKDAY_NAMES[index]!;
              return (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={value.closedWeekdays.includes(index)}
                    onChange={(event) =>
                      update(
                        "closedWeekdays",
                        event.target.checked
                          ? [...value.closedWeekdays, index]
                          : value.closedWeekdays.filter((item) => item !== index),
                      )
                    }
                  />
                  {day.slice(0, 1).toUpperCase() + day.slice(1, 3)}
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend>Date exceptions</legend>
          {value.dateRules
            .filter((rule) => rule.state !== "colored")
            .map((rule) => (
              <div className="date-rule" key={rule.id}>
                <input
                  aria-label="From date"
                  type="date"
                  value={rule.from}
                  onChange={(event) =>
                    update(
                      "dateRules",
                      value.dateRules.map((item) =>
                        item.id === rule.id ? { ...item, from: event.target.value } : item,
                      ),
                    )
                  }
                />
                <input
                  aria-label="To date"
                  type="date"
                  value={rule.to}
                  onChange={(event) =>
                    update(
                      "dateRules",
                      value.dateRules.map((item) => (item.id === rule.id ? { ...item, to: event.target.value } : item)),
                    )
                  }
                />
                <select
                  aria-label="Date state"
                  value={rule.state}
                  onChange={(event) =>
                    update(
                      "dateRules",
                      value.dateRules.map((item) =>
                        item.id === rule.id ? { ...item, state: event.target.value as "closed" | "opened" } : item,
                      ),
                    )
                  }
                >
                  <option value="closed">closed</option>
                  <option value="opened">opened</option>
                </select>
                <button
                  type="button"
                  aria-label="Remove date rule"
                  onClick={() =>
                    update(
                      "dateRules",
                      value.dateRules.filter((item) => item.id !== rule.id),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          <button
            type="button"
            onClick={() =>
              update("dateRules", [
                ...value.dateRules,
                { id: `rule-${Date.now()}`, from: value.startDate, to: value.startDate, state: "closed" },
              ])
            }
          >
            + Add exception
          </button>
        </fieldset>
        <fieldset>
          <legend>Highlighted dates</legend>
          <p className="fieldset-help">Mark deadlines, releases, or other critical dates with a timeline color.</p>
          {value.dateRules
            .filter((rule) => rule.state === "colored")
            .map((rule) => (
              <div className="date-rule date-highlight-rule" key={rule.id}>
                <input
                  aria-label="Highlight date"
                  type="date"
                  value={rule.from}
                  onChange={(event) =>
                    update(
                      "dateRules",
                      value.dateRules.map((item) =>
                        item.id === rule.id
                          ? { ...item, from: event.target.value, to: item.to || event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <input
                  aria-label="Highlight through date"
                  type="date"
                  title="Use the same date for a single highlighted day"
                  value={rule.to}
                  onChange={(event) =>
                    update(
                      "dateRules",
                      value.dateRules.map((item) => (item.id === rule.id ? { ...item, to: event.target.value } : item)),
                    )
                  }
                />
                <input
                  aria-label="Highlight color"
                  placeholder="#ef4444 or Salmon"
                  value={rule.color ?? ""}
                  onChange={(event) =>
                    update(
                      "dateRules",
                      value.dateRules.map((item) =>
                        item.id === rule.id ? { ...item, color: event.target.value } : item,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label="Remove highlighted date"
                  onClick={() =>
                    update(
                      "dateRules",
                      value.dateRules.filter((item) => item.id !== rule.id),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          <button
            type="button"
            onClick={() =>
              update("dateRules", [
                ...value.dateRules,
                {
                  id: `highlight-${Date.now()}`,
                  from: value.startDate,
                  to: value.startDate,
                  state: "colored",
                  color: "#ef4444",
                },
              ])
            }
          >
            + Add highlighted date
          </button>
        </fieldset>
        <fieldset>
          <legend>Display</legend>
          <label className="check">
            <input type="checkbox" checked={value.showLegend} onChange={(event) => update("showLegend", event.target.checked)} />
            Show color legend
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={value.highlightToday}
              onChange={(event) => update("highlightToday", event.target.checked)}
            />
            Highlight today
          </label>
          {value.highlightToday && (
            <label className="today-color">
              Today color
              <input
                aria-label="Today color"
                placeholder="#AAF or LightBlue"
                value={value.todayColor}
                onChange={(event) => update("todayColor", event.target.value)}
              />
            </label>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={value.hideFootbox}
              onChange={(event) => update("hideFootbox", event.target.checked)}
            />
            Hide footbox
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={value.hideResourceNames}
              onChange={(event) => update("hideResourceNames", event.target.checked)}
            />
            Hide resource names
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={value.hideResourceFootbox}
              onChange={(event) => update("hideResourceFootbox", event.target.checked)}
            />
            Hide resource footbox
          </label>
        </fieldset>
        <p className="inspector-note">
          Scale zoom changes PlantUML’s timeline density. The diagram zoom buttons only magnify the preview.
        </p>
        <div className="inspector-actions">
          <span />
          <button type="submit" className="primary">
            Apply
          </button>
        </div>
      </form>
    </aside>
  );
}
