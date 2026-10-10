import { useEffect, useState } from "react";
import type { DiagramKind } from "../../model";
import type { SchedulePreview } from "../../SchedulePreviewDialog";
import { savePreference } from "../../browser-preferences";
import { storageGet } from "../../safe-storage";

export type GanttScheduleMode = "ask" | "single" | "cascade";

export function useGanttController(diagramKind: DiagramKind) {
  const [focusNoteTaskId, setFocusNoteTaskId] = useState<string>();
  const [legendInspectorOpen, setLegendInspectorOpen] = useState(false);
  const [legendFocusColor, setLegendFocusColor] = useState<string>();
  const [highlightDate, setHighlightDate] = useState<string>();
  const [dateMenuFor, setDateMenuFor] = useState<string>();
  const [resourceFilter, setResourceFilter] = useState("");
  const [schedulePreview, setSchedulePreview] = useState<SchedulePreview>();
  const [scheduleMode, setScheduleMode] = useState<GanttScheduleMode>(
    () => (storageGet("plantuml-studio.schedule-mode") as GanttScheduleMode | null) ?? "ask",
  );

  useEffect(() => {
    savePreference("plantuml-studio.schedule-mode", scheduleMode);
  }, [scheduleMode]);

  useEffect(() => {
    if (diagramKind === "gantt") return;
    setFocusNoteTaskId(undefined);
    setLegendInspectorOpen(false);
    setLegendFocusColor(undefined);
    setHighlightDate(undefined);
    setDateMenuFor(undefined);
    setResourceFilter("");
    setSchedulePreview(undefined);
  }, [diagramKind]);

  return {
    focusNoteTaskId,
    setFocusNoteTaskId,
    legendInspectorOpen,
    setLegendInspectorOpen,
    legendFocusColor,
    setLegendFocusColor,
    highlightDate,
    setHighlightDate,
    dateMenuFor,
    setDateMenuFor,
    resourceFilter,
    setResourceFilter,
    schedulePreview,
    setSchedulePreview,
    scheduleMode,
    setScheduleMode,
  };
}
