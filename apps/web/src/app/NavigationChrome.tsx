import { WorkspaceNavigation } from "../Ribbon";
import { diagramKindDisplayName } from "../use-workspace-documents";
import { requestSidePanelChange } from "../side-panel-events";
import { embeddedMemberHistoryId } from "../projects/embedded-project";
import { StageTopBar } from "../stage/StageTopBar";
import type { DocumentSnapshot, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";
import type { ActiveCollaboration } from "../use-collaboration-lifecycle";
import type { RefObject, Dispatch, SetStateAction } from "react";
import type { PortableProject } from "../../../../packages/document-format/src/types";
import type { VirtualProject } from "../projects/project-index";
import type { ViewMode } from "../model";
import type { useSingleFileProject } from "../projects/use-single-file-project";

export interface NavigationChromeProps {
  activateTab: (id: string) => void;
  activeDocument: DocumentSnapshot;
  closeOtherTabs: (id: string) => void;
  closeTab: (id: string) => void;
  collaboration: ActiveCollaboration | undefined;
  diagnosticCount: number;
  dismissAllInspectors: () => void;
  documentTabs: RefObject<HTMLElement | null>;
  draggedTabId: string | undefined;
  duplicateTab: (id: string) => void;
  fileSaving: boolean;
  isProjectMemberTab: (id: string) => boolean;
  mobileListActive: boolean;
  mobileSupported: boolean;
  newDocument: () => void;
  openTasksView: () => void;
  portable: PortableProject | undefined;
  project: VirtualProject | undefined;
  saveCurrentDocument: () => Promise<void>;
  selectNormalViewMode: (mode: ViewMode) => void;
  setDraggedTabId: Dispatch<SetStateAction<string | undefined>>;
  setMobileDiagramDocument: Dispatch<SetStateAction<string | undefined>>;
  setMobileReveal: Dispatch<
    SetStateAction<{ documentId: string; kind: "gantt" | "wbs"; id: string; source: string } | undefined>
  >;
  setProblemsOpen: (value: SetStateAction<boolean>) => void;
  setStageTrueRender: Dispatch<SetStateAction<boolean>>;
  setTabMenu: Dispatch<SetStateAction<{ id: string; x: number; y: number } | undefined>>;
  setTaskTablePane: Dispatch<SetStateAction<"table" | "chart">>;
  setTaskViewDocument: Dispatch<SetStateAction<string | undefined>>;
  singleFileProject: ReturnType<typeof useSingleFileProject>;
  stageActive: boolean;
  stageDark: boolean;
  stageTrueRender: boolean;
  tabLabels: Map<string, string>;
  tabMenu: { id: string; x: number; y: number } | undefined;
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
  taskTablePane: "table" | "chart";
  taskViewActive: boolean;
  tasksNarrow: boolean;
  toggleCommandPalette: () => void;
  unsupportedCount: number;
  update: <K extends keyof WorkspaceSnapshot>(key: K, value: WorkspaceSnapshot[K]) => void;
  viewMode: ViewMode;
  viewModes: ViewMode[];
  workspace: WorkspaceSnapshot;
}

export function NavigationChrome({
  activateTab,
  activeDocument,
  closeOtherTabs,
  closeTab,
  collaboration,
  diagnosticCount,
  dismissAllInspectors,
  documentTabs,
  draggedTabId,
  duplicateTab,
  fileSaving,
  isProjectMemberTab,
  mobileListActive,
  mobileSupported,
  newDocument,
  openTasksView,
  portable,
  project,
  saveCurrentDocument,
  selectNormalViewMode,
  setDraggedTabId,
  setMobileDiagramDocument,
  setMobileReveal,
  setProblemsOpen,
  setStageTrueRender,
  setTabMenu,
  setTaskTablePane,
  setTaskViewDocument,
  singleFileProject,
  stageActive,
  stageDark,
  stageTrueRender,
  tabLabels,
  tabMenu,
  tabs,
  taskTablePane,
  taskViewActive,
  tasksNarrow,
  toggleCommandPalette,
  unsupportedCount,
  update,
  viewMode,
  viewModes,
  workspace,
}: NavigationChromeProps) {
  return (
    <>
      <WorkspaceNavigation
        documents={
          <>
            <nav className="document-tabs" aria-label="Open documents" ref={documentTabs}>
              {tabs.documents.map((document) => (
                <div className="document-tab" key={document.id}>
                  <button
                    draggable
                    className={`${document.id === tabs.activeId ? "active" : ""}${document.id === draggedTabId ? " dragging" : ""}`}
                    onClick={() => activateTab(document.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setTabMenu({ id: document.id, x: event.clientX, y: event.clientY });
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                      event.preventDefault();
                      const bounds = event.currentTarget.getBoundingClientRect();
                      setTabMenu({
                        id: document.id,
                        x: Math.min(bounds.left, window.innerWidth - 210),
                        y: bounds.bottom,
                      });
                    }}
                    onDragStart={(event) => {
                      setDraggedTabId(document.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", document.id);
                    }}
                    onDragEnd={() => setDraggedTabId(undefined)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const id = event.dataTransfer.getData("text/plain") || draggedTabId;
                      if (id) tabs.reorderDocument(id, document.id);
                      setDraggedTabId(undefined);
                    }}
                    title={`${tabLabels.get(document.id)} — ${isProjectMemberTab(document.id) ? `Document: ${project?.manifest.name}; diagram: ${document.fileName}` : document.fileCopy === "new" ? "New separate file; not saved to a file" : `File: ${document.fileName}`}${document.dirty ? " — unsaved changes" : ""}`}
                  >
                    <span className="tab-label">
                      <span className={`dirty-dot${document.dirty ? " visible" : ""}`} aria-hidden="true">
                        ●
                      </span>
                      <small className="tab-type-badge">{diagramKindDisplayName(document.diagramKind)}</small>
                      <span className="tab-name">{tabLabels.get(document.id)}</span>
                      {isProjectMemberTab(document.id) && <small className="tab-project-badge">Document</small>}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="tab-close"
                    aria-label={`Close ${tabLabels.get(document.id)}${isProjectMemberTab(document.id) ? ` in ${project?.manifest.name}` : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(document.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button className="new-tab" onClick={newDocument} aria-label="New diagram tab">
                +
              </button>
            </nav>
          </>
        }
        views={
          <>
            <nav aria-label="View mode">
              {viewModes.map((mode) => (
                <button
                  className={!mobileListActive && !taskViewActive && viewMode === mode ? "active" : ""}
                  onClick={() => update("viewMode", mode)}
                  aria-pressed={!mobileListActive && !taskViewActive && viewMode === mode}
                  title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} view (Ctrl/Cmd+${mode === "code" ? 1 : mode === "split" ? 2 : mode === "diagram" ? 3 : 4})`}
                  key={mode}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
              {workspace.diagramKind === "gantt" && !mobileSupported && (
                <button
                  className={taskViewActive ? "active" : ""}
                  aria-pressed={taskViewActive}
                  onClick={openTasksView}
                >
                  Tasks
                </button>
              )}
              {mobileSupported && (
                <button
                  className={mobileListActive ? "active" : ""}
                  aria-pressed={mobileListActive}
                  onClick={() => {
                    if (!requestSidePanelChange()) return;
                    dismissAllInspectors();
                    setTaskViewDocument(undefined);
                    setMobileDiagramDocument(undefined);
                    setMobileReveal(undefined);
                    selectNormalViewMode("diagram");
                  }}
                >
                  {workspace.diagramKind === "gantt" ? "Task list" : "WBS list"}
                </button>
              )}
            </nav>
            {taskViewActive && tasksNarrow && (
              <nav aria-label="Tasks pane">
                <button aria-pressed={taskTablePane === "table"} onClick={() => setTaskTablePane("table")}>
                  Table
                </button>
                <button aria-pressed={taskTablePane === "chart"} onClick={() => setTaskTablePane("chart")}>
                  Chart
                </button>
              </nav>
            )}
          </>
        }
        hint={null}
      />
      {tabMenu && (
        <div
          className="tab-menu"
          role="menu"
          aria-label="Tab actions"
          style={{ left: tabMenu.x, top: tabMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setTabMenu(undefined);
              document.querySelector<HTMLButtonElement>(".document-tabs button.active")?.focus();
              return;
            }
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
            ];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
          }}
        >
          <button
            role="menuitem"
            disabled={collaboration?.role === "viewer" && isProjectMemberTab(tabMenu.id)}
            onClick={() => {
              const target = tabs.documents.find((item) => item.id === tabMenu.id);
              if (!target) return;
              const name = window.prompt("Diagram name", tabLabels.get(target.id));
              if (!name?.trim()) return;
              const member = portable?.diagrams.find(
                (item) => target.historyId === embeddedMemberHistoryId(portable.projectId, item.id),
              );
              if (member) singleFileProject.renameDiagram(member.id, name);
              else tabs.updateDocumentFormat(target.id, { displayName: name.trim() });
              setTabMenu(undefined);
            }}
          >
            Rename diagram…
          </button>
          <button
            role="menuitem"
            disabled={tabs.documents.findIndex((document) => document.id === tabMenu.id) <= 0}
            onClick={() => {
              const index = tabs.documents.findIndex((document) => document.id === tabMenu.id);
              const previous = tabs.documents[index - 1];
              if (previous) tabs.reorderDocument(tabMenu.id, previous.id);
              setTabMenu(undefined);
            }}
          >
            Move tab left
          </button>
          <button
            role="menuitem"
            disabled={tabs.documents.findIndex((document) => document.id === tabMenu.id) >= tabs.documents.length - 1}
            onClick={() => {
              const index = tabs.documents.findIndex((document) => document.id === tabMenu.id);
              const next = tabs.documents[index + 1];
              if (next) tabs.reorderDocument(next.id, tabMenu.id);
              setTabMenu(undefined);
            }}
          >
            Move tab right
          </button>
          <button role="menuitem" onClick={() => duplicateTab(tabMenu.id)}>
            Duplicate
          </button>
          <button role="menuitem" disabled={tabs.documents.length < 2} onClick={() => closeOtherTabs(tabMenu.id)}>
            Close other tabs
          </button>
          <button
            role="menuitem"
            onClick={() => {
              closeTab(tabMenu.id);
              setTabMenu(undefined);
            }}
          >
            Close
          </button>
        </div>
      )}
      {stageActive && (
        <StageTopBar
          documents={tabs.documents.map((document) => ({
            id: document.id,
            label: tabLabels.get(document.id) ?? document.displayName ?? document.fileName,
            dirty: document.dirty,
          }))}
          activeId={tabs.activeId}
          diagramKindLabel={diagramKindDisplayName(workspace.diagramKind)}
          onActivate={activateTab}
          onOpenPalette={toggleCommandPalette}
          onSave={() => void saveCurrentDocument()}
          saving={fileSaving}
          dirty={activeDocument.dirty}
          issueCount={diagnosticCount + unsupportedCount}
          onOpenIssues={() => setProblemsOpen(true)}
          trueRender={stageTrueRender}
          onTrueRenderChange={setStageTrueRender}
          recolorAvailable={stageDark}
          onExit={() => update("viewMode", "split")}
        />
      )}
    </>
  );
}
