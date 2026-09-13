import { useEffect, useState } from "react";
import type { DiagramKind } from "../../model";
import type { SchedulePreview } from "../../SchedulePreviewDialog";

export type GanttScheduleMode = "ask" | "single" | "cascade";

export function useGanttController(diagramKind: DiagramKind) {
  const [focusNoteTaskId, setFocusNoteTaskId] = useState<string>();
  const [projectInspectorOpen, setProjectInspectorOpen] = useState(false);
  const [legendInspectorOpen, setLegendInspectorOpen] = useState(false);
  const [legendFocusColor, setLegendFocusColor] = useState<string>();
  const [highlightDate, setHighlightDate] = useState<string>();
  const [dateMenuFor, setDateMenuFor] = useState<string>();
  const [resourceFilter, setResourceFilter] = useState("");
  const [schedulePreview, setSchedulePreview] = useState<SchedulePreview>();
  const [scheduleMode, setScheduleMode] = useState<GanttScheduleMode>(
    () => (localStorage.getItem("plantuml-studio.schedule-mode") as GanttScheduleMode | null) ?? "ask",
  );
  const [resourcePanelOpen, setResourcePanelOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("plantuml-studio.schedule-mode", scheduleMode);
  }, [scheduleMode]);

  useEffect(() => {
    if (diagramKind === "gantt") return;
    setFocusNoteTaskId(undefined);
    setProjectInspectorOpen(false);
    setLegendInspectorOpen(false);
    setLegendFocusColor(undefined);
    setHighlightDate(undefined);
    setDateMenuFor(undefined);
    setResourceFilter("");
    setSchedulePreview(undefined);
    setResourcePanelOpen(false);
  }, [diagramKind]);

  return {
    focusNoteTaskId,
    setFocusNoteTaskId,
    projectInspectorOpen,
    setProjectInspectorOpen,
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
    resourcePanelOpen,
    setResourcePanelOpen,
  };
}
