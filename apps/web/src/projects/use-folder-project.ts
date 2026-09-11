import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DocumentSnapshot } from "../workspace-storage";
import {
  createFolderProject,
  folderProjectStore,
  readFolderProject,
  type FolderProject,
  type ProjectDirectoryHandle,
} from "./folder-project";
import { ProjectSaveCoordinator } from "./project-save-coordinator";
import { ensureProjectMembersUnchanged, planFolderProjectSave } from "./project-save-plan";
import { createZipProject, createZipProjectSnapshot, readZipProject, type ZipProject } from "./zip-project";
import {
  applyIdentityMappings,
  type IdentityMapping,
  type ProjectElement,
  type ProjectLink,
} from "@plantuml-studio/project-model";
import { hashSource } from "@plantuml-studio/document-format";
import { serializeProjectManifest } from "@plantuml-studio/project-model";

type FolderPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<ProjectDirectoryHandle>;
  showOpenFilePicker?: (options: object) => Promise<Array<{ getFile(): Promise<File> }>>;
};

type TabControls = {
  addDocument(input?: Partial<Omit<DocumentSnapshot, "id">>): string;
  activateDocument(id: string): void;
  getDocument(id: string): DocumentSnapshot | undefined;
  updateDocumentFormat(id: string, patch: Partial<DocumentSnapshot>): void;
  documents: readonly DocumentSnapshot[];
};

type ActiveProject = FolderProject | ZipProject;

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

function savedProjectTabs(
  project: ActiveProject,
  tabsByMember: ReadonlyMap<string, string>,
  tabs: readonly DocumentSnapshot[],
): Array<{ id: string; source: string }> {
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  return project.manifest.documents.flatMap((document) => {
    const tab = byId.get(tabsByMember.get(`${project.manifest.projectId}:${document.id}`) ?? "");
    return tab?.dirty ? [{ id: tab.id, source: tab.source }] : [];
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
  const saveCoordinator = useRef(new ProjectSaveCoordinator());

  const openProject = useCallback(async () => {
    const picker = (window as FolderPickerWindow).showDirectoryPicker;
    if (!picker) {
      setInteractionMessage("Opening a folder project requires a browser with folder access support");
      return;
    }
    try {
      const root = await picker();
      await saveCoordinator.current.recover(folderProjectStore(root));
      const staged = await readFolderProject(
        root,
        async (document) => window.prompt(`Enter the password for ${document.path}`) ?? undefined,
      );
      setProject(staged);
      tabsByMember.current.clear();
      setInteractionMessage(`Opened project ${staged.manifest.name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      reportError(error);
    }
  }, [reportError, setInteractionMessage]);
  const newProject = useCallback(async () => {
    const picker = (window as FolderPickerWindow).showDirectoryPicker;
    if (!picker)
      return setInteractionMessage("Creating a folder project requires a browser with folder access support");
    try {
      const root = await picker();
      const name = window.prompt("Project name", root.name);
      if (name === null) return;
      setProject(await createFolderProject(root, name));
      tabsByMember.current.clear();
      setInteractionMessage(`Created project ${name.trim() || root.name}`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) reportError(error);
    }
  }, [reportError, setInteractionMessage]);
  const newZipProject = useCallback(async () => {
    const name = window.prompt("Project name", "PlantUML project");
    if (name === null) return;
    try {
      const created = await createZipProject(name);
      setProject(created);
      tabsByMember.current.clear();
      downloadZip(await createZipProjectSnapshot(created), created.manifest.name);
      setInteractionMessage(`Created and downloaded ${created.manifest.name}`);
    } catch (error) {
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
      const staged = await readZipProject(
        new Uint8Array(await file.arrayBuffer()),
        async (document) => window.prompt(`Enter the password for ${document.path}`) ?? undefined,
      );
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
    try {
      const savedTabs = savedProjectTabs(project, tabsByMember.current, tabs.documents);
      const plan = await planFolderProjectSave(
        project.manifest,
        tabsByMember.current,
        tabs.documents,
        project.nativeDocuments,
      );
      const archiveEntries = new Map(project.archiveEntries);
      for (const member of plan.members) archiveEntries.set(member.path, member.bytes);
      const snapshot = { ...project, manifest: plan.manifest, archiveEntries };
      downloadZip(await createZipProjectSnapshot(snapshot), snapshot.manifest.name);
      setProject(snapshot);
      for (const saved of savedTabs) {
        if (tabs.getDocument(saved.id)?.source === saved.source) tabs.updateDocumentFormat(saved.id, { dirty: false });
      }
      setInteractionMessage(
        plan.members.length
          ? `Downloaded project snapshot with ${plan.members.length} changed document${plan.members.length === 1 ? "" : "s"}`
          : "Downloaded project snapshot",
      );
    } catch (error) {
      reportError(error);
    }
  }, [project, reportError, setInteractionMessage, tabs.documents]);
  const saveFolderProject = useCallback(async () => {
    if (!project || !("root" in project)) return;
    try {
      const savedTabs = savedProjectTabs(project, tabsByMember.current, tabs.documents);
      const plan = await planFolderProjectSave(
        project.manifest,
        tabsByMember.current,
        tabs.documents,
        project.nativeDocuments,
      );
      const store = folderProjectStore(project.root);
      await ensureProjectMembersUnchanged(store, project.manifest, plan.members);
      await saveCoordinator.current.save(store, plan.members, {
        path: "project.pumlproject",
        bytes: new TextEncoder().encode(serializeProjectManifest(plan.manifest)),
      });
      setProject((current) => (current && "root" in current ? { ...current, manifest: plan.manifest } : current));
      for (const saved of savedTabs) {
        if (tabs.getDocument(saved.id)?.source === saved.source) tabs.updateDocumentFormat(saved.id, { dirty: false });
      }
      setInteractionMessage(
        plan.members.length
          ? `Saved ${plan.members.length} changed project document${plan.members.length === 1 ? "" : "s"}`
          : "Saved project metadata",
      );
    } catch (error) {
      reportError(error);
    }
  }, [project, reportError, setInteractionMessage, tabs.documents]);

  const updateLinks = useCallback((links: readonly ProjectLink[]) => {
    setProject((current) => (current ? { ...current, manifest: { ...current.manifest, links: [...links] } } : current));
  }, []);
  const updateElements = useCallback((elements: readonly ProjectElement[]) => {
    setProject((current) =>
      current ? { ...current, manifest: { ...current.manifest, elements: [...elements] } } : current,
    );
  }, []);
  const applyRenameMappings = useCallback(
    async (documentId: string, mappings: readonly IdentityMapping[], source: string) => {
      if (!mappings.length) return;
      const sourceHash = await hashSource(source);
      setProject((current) => {
        if (!current) return current;
        const scoped = current.manifest.elements.filter((element) => element.documentId === documentId);
        const untouched = current.manifest.elements.filter((element) => element.documentId !== documentId);
        return {
          ...current,
          manifest: {
            ...current.manifest,
            elements: [...untouched, ...applyIdentityMappings(scoped, mappings, sourceHash)],
          },
        };
      });
    },
    [],
  );

  return {
    project,
    openProject,
    newProject,
    newZipProject,
    openZipProject,
    saveZipProject,
    saveFolderProject,
    openMember,
    updateLinks,
    updateElements,
    applyRenameMappings,
    closeProject: () => setProject(undefined),
  };
}
