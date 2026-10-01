import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Diagnostic } from "@codemirror/lint";
import type { SourceHistory } from "@plantuml-studio/editor-core";
import { validateGeneratedSource } from "../../generated-source-validation";
import type { DiagramKind } from "../../model";
import type { WorkspaceSnapshot } from "../../workspace-storage";

type ForecastSettings = NonNullable<import("../../workspace-storage").DocumentSnapshot["progressForecast"]>;

/** History description for code-editor typing; consecutive edits merge into one undo step. */
export const SOURCE_EDIT_DESCRIPTION = "Edit source";

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
      history.record(currentSource, source, description, forecastChange, {
        coalesce: description === SOURCE_EDIT_DESCRIPTION,
      });
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

  /**
   * Undoes or redoes up to `steps` history entries in one source update. A step that also changes
   * forecast settings ends the batch, because those settings are read back from the document.
   */
  const travel = useCallback(
    (direction: "undo" | "redo", steps: number) => {
      if (readOnly) {
        setInteractionMessage(`Viewing only · ${direction} is available only to editors`);
        return;
      }
      let source = currentSource;
      let applied = 0;
      while (applied < steps) {
        const entry = direction === "undo" ? history.undoEntry(source) : history.redoEntry(source);
        if (!entry) break;
        source = direction === "undo" ? entry.sourceBefore : entry.sourceAfter;
        applied += 1;
        if (entry.contextAfter !== undefined) {
          if (direction === "undo")
            onForecastHistoryChange?.(
              entry.contextBefore as ForecastSettings | undefined,
              entry.contextAfter as ForecastSettings,
            );
          else
            onForecastHistoryChange?.(
              entry.contextAfter as ForecastSettings,
              entry.contextBefore as ForecastSettings | undefined,
            );
          break;
        }
      }
      if (!applied) return;
      setWorkspace((current) => ({ ...current, source, dirty: true }));
      refreshHistoryControls();
    },
    [
      currentSource,
      history,
      onForecastHistoryChange,
      readOnly,
      refreshHistoryControls,
      setInteractionMessage,
      setWorkspace,
    ],
  );
  // Also used directly as click handlers, so a non-number argument means one step.
  const undo = useCallback((steps?: unknown) => travel("undo", typeof steps === "number" ? steps : 1), [travel]);
  const redo = useCallback((steps?: unknown) => travel("redo", typeof steps === "number" ? steps : 1), [travel]);

  return { commitSource, commitGeneratedSource, undo, redo };
}
