import { useCallback, useLayoutEffect, useRef, useState, type SetStateAction } from "react";
import type { DiagramKind } from "./model";

type SidePanel = "calendar" | "workload" | "issues" | "preserved";

/** One owner for utility panels; property selection returns ownership to its inspector. */
export function useSidePanelState(
  diagramKind: DiagramKind,
  propertySelection: string | undefined,
  onOpen: () => boolean,
) {
  const [panel, setPanel] = useState<SidePanel>();
  const currentPanel = useRef(panel);
  currentPanel.current = panel;
  useLayoutEffect(() => {
    if (propertySelection && currentPanel.current !== undefined) setPanel(undefined);
  }, [propertySelection]);
  useLayoutEffect(() => {
    if (diagramKind !== "gantt" && (currentPanel.current === "calendar" || currentPanel.current === "workload"))
      setPanel(undefined);
  }, [diagramKind]);

  const setOpen = useCallback(
    (name: SidePanel, value: SetStateAction<boolean>) => {
      const current = currentPanel.current;
      const open = typeof value === "function" ? value(current === name) : value;
      if (open && current === name) return;
      if (open && !onOpen()) return;
      const next = open ? name : current === name ? undefined : current;
      if (next === current) return;
      currentPanel.current = next;
      setPanel(next);
    },
    [onOpen],
  );
  const setProjectInspectorOpen = useCallback(
    (value: SetStateAction<boolean>) => setOpen("calendar", value),
    [setOpen],
  );
  const setResourcePanelOpen = useCallback((value: SetStateAction<boolean>) => setOpen("workload", value), [setOpen]);
  const setProblemsOpen = useCallback((value: SetStateAction<boolean>) => setOpen("issues", value), [setOpen]);
  const setUnsupportedOpen = useCallback((value: SetStateAction<boolean>) => setOpen("preserved", value), [setOpen]);
  return {
    projectInspectorOpen: panel === "calendar",
    setProjectInspectorOpen,
    resourcePanelOpen: panel === "workload",
    setResourcePanelOpen,
    problemsOpen: panel === "issues",
    setProblemsOpen,
    unsupportedOpen: panel === "preserved",
    setUnsupportedOpen,
  };
}
