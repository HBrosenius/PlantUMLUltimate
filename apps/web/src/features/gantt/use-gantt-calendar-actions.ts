import { useCallback } from "react";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { removeLegend, synchronizeLegend } from "../../legend";
import { parseProjectSettings, updateProjectSettings, type ProjectSettings } from "../../project-settings";

interface Options {
  source: string;
  highlightDate: string | undefined;
  commit(source: string, description: string): boolean;
  setHighlightDate(date: string | undefined): void;
  closeDateMenu(): void;
  closeProjectInspector(): void;
  report(message: string): void;
}

export function useGanttCalendarActions(options: Options) {
  const { source, highlightDate, commit, setHighlightDate, closeDateMenu, closeProjectInspector, report } = options;

  const applyTimelineDateHighlight = useCallback(
    (color: string) => {
      if (!highlightDate) return;
      const settings = parseProjectSettings(source);
      const existing = settings.dateRules.find(
        (rule) => rule.state === "colored" && rule.from === highlightDate && rule.to === highlightDate,
      );
      settings.dateRules = existing
        ? settings.dateRules.map((rule) => (rule.id === existing.id ? { ...rule, color } : rule))
        : [
            ...settings.dateRules,
            {
              id: `highlight-${highlightDate}`,
              from: highlightDate,
              to: highlightDate,
              state: "colored",
              color,
            },
          ];
      if (!commit(updateProjectSettings(source, settings), `Highlight ${highlightDate}`)) return;
      setHighlightDate(undefined);
      report(`Highlighted ${highlightDate}`);
    },
    [commit, highlightDate, report, setHighlightDate, source],
  );

  const clearTimelineDateHighlight = useCallback(() => {
    if (!highlightDate) return;
    const settings = parseProjectSettings(source);
    const remaining = settings.dateRules.filter(
      (rule) => !(rule.state === "colored" && rule.from === highlightDate && rule.to === highlightDate),
    );
    if (remaining.length === settings.dateRules.length) {
      setHighlightDate(undefined);
      return;
    }
    settings.dateRules = remaining;
    if (!commit(updateProjectSettings(source, settings), `Clear highlight ${highlightDate}`)) return;
    setHighlightDate(undefined);
    report(`Cleared highlight for ${highlightDate}`);
  }, [commit, highlightDate, report, setHighlightDate, source]);

  const applyTimelineDateClosed = useCallback(
    (date: string) => {
      const settings = parseProjectSettings(source);
      const existing = settings.dateRules.find(
        (rule) => rule.from === date && rule.to === date && rule.state !== "colored",
      );
      settings.dateRules = existing
        ? settings.dateRules.map((rule) => (rule.id === existing.id ? { ...rule, state: "closed" } : rule))
        : [...settings.dateRules, { id: `closed-${date}`, from: date, to: date, state: "closed" as const }];
      if (!commit(updateProjectSettings(source, settings), `Close ${date}`)) return;
      closeDateMenu();
      report(`Marked ${date} as a closed day`);
    },
    [closeDateMenu, commit, report, source],
  );

  const clearTimelineDateSetting = useCallback(
    (date: string) => {
      const settings = parseProjectSettings(source);
      const remaining = settings.dateRules.filter((rule) => !(rule.from === date && rule.to === date));
      if (remaining.length === settings.dateRules.length) {
        closeDateMenu();
        return;
      }
      settings.dateRules = remaining;
      if (!commit(updateProjectSettings(source, settings), `Clear date setting ${date}`)) return;
      closeDateMenu();
      report(`Cleared the date setting for ${date}`);
    },
    [closeDateMenu, commit, report, source],
  );

  const applyProjectSettings = useCallback(
    (value: ProjectSettings) => {
      const zoom = value.scaleZoom === "" ? undefined : Number(value.scaleZoom);
      if (zoom !== undefined && (!Number.isInteger(zoom) || zoom < 1)) {
        report("Scale zoom must be a positive whole number");
        return;
      }
      if (value.highlightToday && (!value.todayColor.trim() || /\s/.test(value.todayColor.trim()))) {
        report("Today color must be a PlantUML color name or hex value");
        return;
      }
      if (value.dateRules.some((rule) => !rule.from || !rule.to || rule.to < rule.from)) {
        report("Calendar dates need a valid start and end date");
        return;
      }
      if (
        value.dateRules.some(
          (rule) => rule.state === "colored" && (!rule.color?.trim() || /\s/.test(rule.color.trim())),
        )
      ) {
        report("Highlighted dates need a PlantUML color name or hex value");
        return;
      }
      const settingsSource = updateProjectSettings(source, value);
      const nextSource = value.showLegend
        ? synchronizeLegend(settingsSource, parseGantt(settingsSource).document.tasks)
        : removeLegend(settingsSource);
      if (!commit(nextSource, "Update project calendar")) return;
      closeProjectInspector();
      report("Updated project calendar");
    },
    [closeProjectInspector, commit, report, source],
  );

  return {
    applyTimelineDateHighlight,
    clearTimelineDateHighlight,
    applyTimelineDateClosed,
    clearTimelineDateSetting,
    applyProjectSettings,
  };
}
