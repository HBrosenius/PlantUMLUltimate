import { renderSizeLimit } from "../render/size-limit";
import { previewStatusLabel } from "../render/preview-status";
import { RenderSizeNotice } from "../render/RenderSizeNotice";
import { StorageStatus } from "../StorageStatus";
import type { DocumentSnapshot, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";
import type { ActiveCollaboration } from "../use-collaboration-lifecycle";
import type { usePwa } from "../pwa";
import type { RenderResult, RenderStatus, ViewMode } from "../model";
import type { Dispatch, SetStateAction } from "react";
import type { useSingleFileProject } from "../projects/use-single-file-project";

export interface StatusBarProps {
  activeDocument: DocumentSnapshot;
  activeInSingleFileProject: boolean;
  collaboration: ActiveCollaboration | undefined;
  diagnosticCount: number;
  hydrated: boolean;
  interactionMessage: string | undefined;
  mobileListActive: boolean;
  pwa: ReturnType<typeof usePwa>;
  result: RenderResult | undefined;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
  setProblemsOpen: (value: SetStateAction<boolean>) => void;
  setUnsupportedOpen: (value: SetStateAction<boolean>) => void;
  singleFileProject: ReturnType<typeof useSingleFileProject>;
  status: RenderStatus;
  tabs: {
    documents: DocumentSnapshot[];
    activeId: string;
    addDocument: (input?: Partial<Omit<DocumentSnapshot, "id">>) => string;
    closeDocument: (id: string) => void;
    activateDocument: (id: string) => void;
    duplicateDocument: (id: string) => string;
    closeOtherDocuments: (id: string) => void;
    reorderDocument: (draggedId: string, targetId: string) => void;
    restoreSession: (next: WorkspaceSession) => void;
    setDocumentHistoryId: (id: string, historyId: string) => void;
    setDocumentBaselineVersionId: (id: string, baselineVersionId?: string) => void;
    replaceDocumentFromFile: (
      id: string,
      input: Pick<DocumentSnapshot, "source" | "fileName" | "diagramKind">,
      dirty?: boolean,
    ) => void;
    updateDocumentSource: (id: string, source: string, diagramKind: DocumentSnapshot["diagramKind"]) => void;
    updateDocumentFormat: (id: string, patch: Partial<DocumentSnapshot>, flushRecovery?: boolean) => void;
    getDocument: (id: string) => DocumentSnapshot | undefined;
    setOnboarded: () => void;
    session: WorkspaceSession;
  };
  unsupportedCount: number;
  viewMode: ViewMode;
  workspace: WorkspaceSnapshot;
}

export function StatusBar({
  activeDocument,
  activeInSingleFileProject,
  collaboration,
  diagnosticCount,
  hydrated,
  interactionMessage,
  mobileListActive,
  pwa,
  result,
  setInteractionMessage,
  setProblemsOpen,
  setUnsupportedOpen,
  singleFileProject,
  status,
  tabs,
  unsupportedCount,
  viewMode,
  workspace,
}: StatusBarProps) {
  return (
    <>
      <footer className="statusbar">
        <span role="status" aria-live="polite">
          {result?.error ? `⚠ ${result.error}` : diagnosticCount ? "Source has problems" : (interactionMessage ?? "")}
        </span>
        <button
          type="button"
          className="problem-count"
          data-inspector-trigger
          onClick={() => {
            setProblemsOpen(true);
            setUnsupportedOpen(false);
          }}
        >
          {diagnosticCount + unsupportedCount > 0 ? `${diagnosticCount + unsupportedCount} issues` : "No issues"}
        </button>
        <span>
          {workspace.diagramKind === "sequence"
            ? "Sequence"
            : workspace.diagramKind === "usecase"
              ? "Use Case"
              : workspace.diagramKind === "class" || workspace.diagramKind === "component"
                ? workspace.diagramKind === "component"
                  ? "Component"
                  : "Class"
                : workspace.diagramKind === "activity"
                  ? "Activity"
                  : workspace.diagramKind === "wbs"
                    ? "WBS"
                    : "Gantt"}
        </span>
        <details className="render-details" open={renderSizeLimit(result?.error) ? true : undefined}>
          <summary>
            {mobileListActive
              ? "List view"
              : previewStatusLabel(viewMode === "code", status, result, workspace.source, tabs.activeId)}
          </summary>
          <div>
            <p>Render {Math.round(result?.durationMs ?? 0)} ms</p>
            <RenderSizeNotice
              error={result?.error}
              hasPreviousPreview={Boolean(result?.svg)}
              gantt={workspace.diagramKind === "gantt"}
            />
            {result?.error && <p role="alert">{result.error}</p>}
            <p>
              Changes are rendered locally. An older preview can remain visible while the current source is rendering or
              has an error.
            </p>
          </div>
        </details>
        {viewMode !== "diagram" && (
          <span className="source-cursor" aria-label="Source cursor position">
            Ln {workspace.cursor.line}, Col {workspace.cursor.column}
          </span>
        )}
        {hydrated ? (
          <StorageStatus
            onExplain={setInteractionMessage}
            recoveryStatus={activeInSingleFileProject ? singleFileProject.recoveryStatus : undefined}
            encrypted={Boolean(activeDocument.encrypted)}
          />
        ) : (
          <span>Restoring…</span>
        )}
        {!pwa.online && <span className="connection-offline">Offline · changes stay local</span>}
        {collaboration && (
          <span className={`collaboration-status ${collaboration.connection}`}>
            {collaboration.connection === "connected"
              ? collaboration.role === "viewer"
                ? "Viewing only"
                : "Live collaboration"
              : collaboration.connection === "connecting"
                ? "Collaboration connecting…"
                : collaboration.connection === "offline"
                  ? "Collaboration offline"
                  : "Collaboration stopped"}
          </span>
        )}
        {pwa.canInstall && (
          <button type="button" className="status-action" onClick={() => void pwa.install()}>
            Install app
          </button>
        )}
        {pwa.updateAvailable && (
          <button type="button" className="status-action" onClick={pwa.update}>
            Update available
          </button>
        )}
      </footer>
    </>
  );
}
