import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Diagnostic } from "@codemirror/lint";
import type { SourceHistory } from "@plantuml-studio/editor-core";
import { validateGeneratedSource } from "../../generated-source-validation";
import type { DiagramKind } from "../../model";
import type { WorkspaceSnapshot } from "../../workspace-storage";

type ForecastSettings = NonNullable<import("../../workspace-storage").DocumentSnapshot["progressForecast"]>;

export interface SourceProblemPreview {
  source: string;
  diagnostics: Diagnostic[];
  message: string;
}

interface UseSourceCommandsOptions {
  source: string;
  diagramKind: DiagramKind;
  readOnly: boolean;
  history: SourceHistory;
  setWorkspace: Dispatch<SetStateAction<WorkspaceSnapshot>>;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
  setProblemPreview: Dispatch<SetStateAction<SourceProblemPreview | undefined>>;
  setProblemsOpen: Dispatch<SetStateAction<boolean>>;
  captureBeforeCommit: () => void;
  refreshHistoryControls: () => void;
  onForecastHistoryChange?: (value: ForecastSettings | undefined, previous: ForecastSettings | undefined) => void;
}

export function useSourceCommands({
  source: currentSource,
  diagramKind,
  readOnly,
  history,
  setWorkspace,
  setInteractionMessage,
  setProblemPreview,
  setProblemsOpen,
  captureBeforeCommit,
  refreshHistoryControls,
  onForecastHistoryChange,
}: UseSourceCommandsOptions) {
  const commitSource = useCallback(
    (
      source: string,
      description: string,
      validate = true,
      forecastChange?: { before: ForecastSettings | undefined; after: ForecastSettings },
    ): boolean => {
      if (readOnly) {
        setInteractionMessage("Viewing only · ask the room owner for an editor link to make changes");
        return false;
      }
      if (source === currentSource) return true;
      if (validate) {
        const validation = validateGeneratedSource(diagramKind, currentSource, source);
        if (!validation.valid) {
          setInteractionMessage(
            `Cancelled ${description.toLowerCase()}: ${validation.message ?? "the operation would produce invalid PlantUML"}`,
          );
          setProblemPreview({
            source,
            diagnostics: validation.introduced,
            message: validation.message ?? "The operation would produce invalid PlantUML.",
          });
          setProblemsOpen(true);
          return false;
        }
      }
      captureBeforeCommit();
      setProblemPreview(undefined);
      history.record(currentSource, source, description, forecastChange);
      setWorkspace((current) => ({ ...current, source, dirty: true }));
      if (forecastChange) onForecastHistoryChange?.(forecastChange.after, forecastChange.before);
      refreshHistoryControls();
      return true;
    },
    [
      captureBeforeCommit,
      currentSource,
      diagramKind,
      history,
      onForecastHistoryChange,
      readOnly,
      refreshHistoryControls,
      setInteractionMessage,
      setProblemPreview,
      setProblemsOpen,
      setWorkspace,
    ],
  );

  const commitGeneratedSource = useCallback(
    (
      source: string,
      description: string,
      forecastChange?: { before: ForecastSettings | undefined; after: ForecastSettings },
    ): boolean => commitSource(source, description, true, forecastChange),
    [commitSource],
  );

  const undo = useCallback(() => {
    if (readOnly) {
      setInteractionMessage("Viewing only · undo is available only to editors");
      return;
    }
    const entry = history.undoEntry(currentSource);
    if (!entry) return;
    setWorkspace((current) => ({ ...current, source: entry.sourceBefore, dirty: true }));
    if (entry.contextAfter !== undefined)
      onForecastHistoryChange?.(
        entry.contextBefore as ForecastSettings | undefined,
        entry.contextAfter as ForecastSettings,
      );
    refreshHistoryControls();
  }, [
    currentSource,
    history,
    onForecastHistoryChange,
    readOnly,
    refreshHistoryControls,
    setInteractionMessage,
    setWorkspace,
  ]);

  const redo = useCallback(() => {
    if (readOnly) {
      setInteractionMessage("Viewing only · redo is available only to editors");
      return;
    }
    const entry = history.redoEntry(currentSource);
    if (!entry) return;
    setWorkspace((current) => ({ ...current, source: entry.sourceAfter, dirty: true }));
    if (entry.contextAfter !== undefined)
      onForecastHistoryChange?.(
        entry.contextAfter as ForecastSettings,
        entry.contextBefore as ForecastSettings | undefined,
      );
    refreshHistoryControls();
  }, [
    currentSource,
    history,
    onForecastHistoryChange,
    readOnly,
    refreshHistoryControls,
    setInteractionMessage,
    setWorkspace,
  ]);

  return { commitSource, commitGeneratedSource, undo, redo };
}
