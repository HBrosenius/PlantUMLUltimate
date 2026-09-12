import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Diagnostic } from "@codemirror/lint";
import type { SourceHistory } from "@plantuml-studio/editor-core";
import { validateGeneratedSource } from "../../generated-source-validation";
import type { DiagramKind } from "../../model";
import type { WorkspaceSnapshot } from "../../workspace-storage";

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
}: UseSourceCommandsOptions) {
  const commitSource = useCallback(
    (source: string, description: string, validate = true): boolean => {
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
      history.record(currentSource, source, description);
      setWorkspace((current) => ({ ...current, source, dirty: true }));
      refreshHistoryControls();
      return true;
    },
    [
      captureBeforeCommit,
      currentSource,
      diagramKind,
      history,
      readOnly,
      refreshHistoryControls,
      setInteractionMessage,
      setProblemPreview,
      setProblemsOpen,
      setWorkspace,
    ],
  );

  const commitGeneratedSource = useCallback(
    (source: string, description: string): boolean => commitSource(source, description),
    [commitSource],
  );

  return { commitSource, commitGeneratedSource };
}
