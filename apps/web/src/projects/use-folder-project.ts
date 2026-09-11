import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DocumentSnapshot } from "../workspace-storage";
import { readFolderProject, type FolderProject, type ProjectDirectoryHandle } from "./folder-project";
import { createZipProjectSnapshot, readZipProject, type ZipProject } from "./zip-project";

type FolderPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<ProjectDirectoryHandle>;
  showOpenFilePicker?: (options: object) => Promise<Array<{ getFile(): Promise<File> }>>;
};

type TabControls = {
  addDocument(input?: Partial<Omit<DocumentSnapshot, "id">>): string;
  activateDocument(id: string): void;
  documents: readonly DocumentSnapshot[];
};

type ActiveProject = FolderProject | ZipProject;

const PROJECT_SESSION_DATABASE = "plantuml-studio-project-session";
const PROJECT_SESSION_STORE = "active-project";
const PROJECT_SESSION_KEY = "current";

type StoredFolderProject = { kind: "folder"; root: ProjectDirectoryHandle };

function projectSessionDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROJECT_SESSION_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PROJECT_SESSION_STORE))
        request.result.createObjectStore(PROJECT_SESSION_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rememberFolderProject(root: ProjectDirectoryHandle): Promise<void> {
  const database = await projectSessionDatabase();
  if (!database) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_SESSION_STORE, "readwrite");
    transaction
      .objectStore(PROJECT_SESSION_STORE)
      .put({ kind: "folder", root } satisfies StoredFolderProject, PROJECT_SESSION_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function rememberedFolderProject(): Promise<ProjectDirectoryHandle | undefined> {
  const database = await projectSessionDatabase();
  if (!database) return undefined;
  const value = await new Promise<StoredFolderProject | undefined>((resolve, reject) => {
    const request = database
      .transaction(PROJECT_SESSION_STORE, "readonly")
      .objectStore(PROJECT_SESSION_STORE)
      .get(PROJECT_SESSION_KEY);
    request.onsuccess = () => resolve(request.result as StoredFolderProject | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return value?.kind === "folder" ? value.root : undefined;
}

async function forgetFolderProject(): Promise<void> {
  const database = await projectSessionDatabase();
  if (!database) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_SESSION_STORE, "readwrite");
    transaction.objectStore(PROJECT_SESSION_STORE).delete(PROJECT_SESSION_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

function downloadZip(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: "application/zip" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.replace(/[^a-z0-9._-]+/gi, "-") || "plantuml-project"}.pumlproject.zip`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function chooseZipFile(): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip,application/x-zip-compressed";
    input.onchange = () => resolve(input.files?.[0]);
    input.click();
  });
}

export function useFolderProject({
  tabs,
  resetSelection,
  setInteractionMessage,
  reportError,
}: {
  tabs: TabControls;
  resetSelection(): void;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
  reportError(error: unknown): void;
}) {
  const [project, setProject] = useState<ActiveProject>();
  const tabsByMember = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const root = await rememberedFolderProject();
        if (!root || cancelled) return;
        const staged = await readFolderProject(root);
        if (!cancelled) {
          setProject(staged);
          setInteractionMessage(`Restored project ${staged.manifest.name}`);
        }
      } catch {
        // A moved folder or revoked permission is recovered by choosing the project again.
        void forgetFolderProject();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setInteractionMessage]);

  const openProject = useCallback(async () => {
    const picker = (window as FolderPickerWindow).showDirectoryPicker;
    if (!picker) {
      setInteractionMessage("Opening a folder project requires a browser with folder access support");
      return;
    }
    try {
      const root = await picker();
      const staged = await readFolderProject(root);
      setProject(staged);
      tabsByMember.current.clear();
      await rememberFolderProject(root);
      setInteractionMessage(`Opened project ${staged.manifest.name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      reportError(error);
    }
  }, [reportError, setInteractionMessage]);

  const openMember = useCallback(
    (documentId: string) => {
      if (!project) return;
      const key = `${project.manifest.projectId}:${documentId}`;
      const existing = tabsByMember.current.get(key);
      if (existing) {
        tabs.activateDocument(existing);
        return;
      }
      const member = project.members.find((item) => item.documentId === documentId);
      if (!member?.source || member.state !== "available" || !member.diagramKind) return;
      const tabId = tabs.addDocument({
        historyId: `project-history-${project.manifest.projectId}-${documentId}`,
        source: member.source,
        diagramKind: member.diagramKind,
        fileName: member.path,
        dirty: false,
        cursor: { line: 1, column: 1 },
      });
      tabsByMember.current.set(key, tabId);
      resetSelection();
      setInteractionMessage(`Opened ${member.path} from ${project.manifest.name}`);
    },
    [project, resetSelection, setInteractionMessage, tabs],
  );

  const openZipProject = useCallback(async () => {
    try {
      const picker = (window as FolderPickerWindow).showOpenFilePicker;
      const selected = picker
        ? (
            await picker({
              multiple: false,
              types: [{ description: "PlantUML Ultimate project", accept: { "application/zip": [".zip"] } }],
            })
          )[0]
        : undefined;
      const file = selected ? await selected.getFile() : picker ? undefined : await chooseZipFile();
      if (!file) return;
      const staged = await readZipProject(new Uint8Array(await file.arrayBuffer()));
      setProject(staged);
      tabsByMember.current.clear();
      setInteractionMessage(`Opened ZIP project ${staged.manifest.name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      reportError(error);
    }
  }, [reportError, setInteractionMessage]);

  const saveZipProject = useCallback(async () => {
    if (!project || !("archiveEntries" in project)) return;
    const openProjectTabs = new Set(tabsByMember.current.values());
    if (tabs.documents.some((document) => openProjectTabs.has(document.id) && document.dirty)) {
      setInteractionMessage("Save changed project documents before exporting a project snapshot");
      return;
    }
    try {
      downloadZip(await createZipProjectSnapshot(project), project.manifest.name);
      setInteractionMessage("Downloaded project snapshot");
    } catch (error) {
      reportError(error);
    }
  }, [project, reportError, setInteractionMessage, tabs.documents]);

  return {
    project,
    openProject,
    openZipProject,
    saveZipProject,
    openMember,
    closeProject: () => {
      setProject(undefined);
      void forgetFolderProject();
    },
  };
}
