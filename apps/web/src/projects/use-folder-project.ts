import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { loadActiveProject, saveActiveProject, type DocumentSnapshot } from "../workspace-storage";
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
import { parseProjectManifest, serializeProjectManifest, validateProjectPath } from "@plantuml-studio/project-model";
import { indexVirtualProject } from "./project-index";
import { starterSource } from "../use-workspace-documents";
import { convertLegacyProject } from "./legacy-project-conversion";

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

async function reindexActiveProject(project: ActiveProject, manifest = project.manifest): Promise<ActiveProject> {
  const indexed = await indexVirtualProject(
    serializeProjectManifest(manifest),
    new Map(
      project.members.map((member) => [
        member.path,
        member.source === undefined
          ? { state: "missing" as const }
          : { state: "available" as const, source: member.source },
      ]),
    ),
  );
  return "root" in project
    ? { ...indexed, root: project.root, nativeDocuments: project.nativeDocuments }
    : { ...indexed, archiveEntries: project.archiveEntries, nativeDocuments: project.nativeDocuments };
}

type ProjectSession = {
  manifest: unknown;
  sources: Record<string, string>;
};

function projectSession(project: ActiveProject): ProjectSession {
  const sources = Object.fromEntries(
    project.members.flatMap((member) => (member.source ? [[member.path, member.source]] : [])),
  );
  return { manifest: project.manifest, sources };
}

async function restoreProjectSession(): Promise<ZipProject | undefined> {
  const stored = await loadActiveProject();
  if (!stored) return undefined;
  try {
    const candidate = stored as Partial<ProjectSession>;
    if (!candidate.sources || typeof candidate.sources !== "object") return undefined;
    const manifest = parseProjectManifest(candidate.manifest);
    const sources = Object.entries(candidate.sources).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    const sourceByPath = new Map(sources);
    const indexed = await indexVirtualProject(
      serializeProjectManifest(manifest),
      new Map(
        manifest.documents.map((document) => {
          const source = sourceByPath.get(document.path);
          return [
            document.path,
            source === undefined ? { state: "missing" as const } : { state: "available" as const, source },
          ];
        }),
      ),
    );
    const entries = new Map<string, Uint8Array>([
      ["project.pumlproject", new TextEncoder().encode(serializeProjectManifest(manifest))],
      ...sources.map(([path, source]) => [path, new TextEncoder().encode(source)] as const),
    ]);
    return { ...indexed, archiveEntries: entries, nativeDocuments: new Map() };
  } catch {
    return undefined;
  }
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
  const projectRef = useRef(project);
  projectRef.current = project;
  const tabsByMember = useRef(new Map<string, string>());
  const saveCoordinator = useRef(new ProjectSaveCoordinator());

  useEffect(() => {
    void restoreProjectSession().then((restored) => {
      if (!restored) return;
      setProject((current) => current ?? restored);
    });
  }, []);

  useEffect(() => {
    if (!project) return;
    try {
      void saveActiveProject(projectSession(project));
    } catch {
      // Project restoration is a convenience; saving and editing remain available if browser storage is full.
    }
  }, [project]);

  useEffect(() => {
    if (!project) return;
    const tabById = new Map(tabs.documents.map((tab) => [tab.id, tab]));
    const sourceByPath = new Map<string, string>();
    for (const member of project.members) {
      const memberKey = `${project.manifest.projectId}:${member.documentId}`;
      const tab =
        tabById.get(tabsByMember.current.get(memberKey) ?? "") ??
        tabs.documents.find(
          (item) => item.historyId === `project-history-${project.manifest.projectId}-${member.documentId}`,
        );
      if (tab) {
        tabsByMember.current.set(memberKey, tab.id);
        sourceByPath.set(member.path, tab.source);
      } else if (member.source) {
        sourceByPath.set(member.path, member.source);
      }
    }
    const sourceChanged = project.members.some(
      (member) => sourceByPath.has(member.path) && sourceByPath.get(member.path) !== member.source,
    );
    if (!sourceChanged) return;
    const timer = window.setTimeout(() => {
      void indexVirtualProject(
        serializeProjectManifest(project.manifest),
        new Map(
          project.manifest.documents.map((document) => {
            const source = sourceByPath.get(document.path);
            return [
              document.path,
              source === undefined ? { state: "missing" as const } : { state: "available" as const, source },
            ];
          }),
        ),
      ).then((indexed) => {
        setProject((current) => {
          if (current !== project) return current;
          return "root" in project
            ? { ...indexed, root: project.root, nativeDocuments: project.nativeDocuments }
            : { ...indexed, archiveEntries: project.archiveEntries, nativeDocuments: project.nativeDocuments };
        });
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [project, tabs.documents]);

  const openAllMembers = useCallback(
    (next: ActiveProject) => {
      tabsByMember.current.clear();
      for (const member of next.members) {
        if (!member.source || member.state !== "available" || !member.diagramKind) continue;
        const tabId = tabs.addDocument({
          historyId: `project-history-${next.manifest.projectId}-${member.documentId}`,
          source: member.source,
          diagramKind: member.diagramKind,
          fileName: member.path,
          dirty: false,
          cursor: { line: 1, column: 1 },
        });
        tabsByMember.current.set(`${next.manifest.projectId}:${member.documentId}`, tabId);
      }
    },
    [tabs],
  );

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
      projectRef.current = staged;
      openAllMembers(staged);
      resetSelection();
      setInteractionMessage(`Opened project ${staged.manifest.name} with ${staged.members.length} diagrams`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      reportError(error);
    }
  }, [openAllMembers, reportError, resetSelection, setInteractionMessage]);
  const newProject = useCallback(async () => {
    const picker = (window as FolderPickerWindow).showDirectoryPicker;
    if (!picker)
      return setInteractionMessage("Creating a folder project requires a browser with folder access support");
    try {
      const root = await picker();
      const name = window.prompt("Project name", root.name);
      if (name === null) return;
      const created = await createFolderProject(root, name);
      setProject(created);
      projectRef.current = created;
      tabsByMember.current.clear();
      const member = created.members[0];
      if (member?.source && member.diagramKind) {
        const tabId = tabs.addDocument({
          historyId: `project-history-${created.manifest.projectId}-${member.documentId}`,
          source: member.source,
          diagramKind: member.diagramKind,
          fileName: member.path,
          dirty: false,
          cursor: { line: 1, column: 1 },
        });
        tabsByMember.current.set(`${created.manifest.projectId}:${member.documentId}`, tabId);
      }
      resetSelection();
      setInteractionMessage(`Created project ${name.trim() || root.name}`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) reportError(error);
    }
  }, [reportError, resetSelection, setInteractionMessage, tabs]);
  const newZipProject = useCallback(async () => {
    const name = window.prompt("Project name", "PlantUML project");
    if (name === null) return;
    try {
      const created = await createZipProject(name);
      setProject(created);
      projectRef.current = created;
      tabsByMember.current.clear();
      const member = created.members[0];
      if (member?.source && member.diagramKind) {
        const tabId = tabs.addDocument({
          historyId: `project-history-${created.manifest.projectId}-${member.documentId}`,
          source: member.source,
          diagramKind: member.diagramKind,
          fileName: member.path,
          dirty: false,
          cursor: { line: 1, column: 1 },
        });
        tabsByMember.current.set(`${created.manifest.projectId}:${member.documentId}`, tabId);
      }
      resetSelection();
      downloadZip(await createZipProjectSnapshot(created), created.manifest.name);
      setInteractionMessage(`Created and downloaded ${created.manifest.name}`);
    } catch (error) {
      reportError(error);
    }
  }, [reportError, resetSelection, setInteractionMessage, tabs]);

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

  const addProjectDiagram = useCallback(
    async (diagramKind: "gantt" | "class" | "sequence", path: string) => {
      if (!project) return;
      const normalizedPath = path.trim();
      if (
        validateProjectPath(normalizedPath) ||
        !/\.puml$/i.test(normalizedPath) ||
        project.manifest.documents.some((item) => item.path === normalizedPath)
      ) {
        setInteractionMessage("Choose a unique, safe .puml project-relative path");
        return;
      }
      const documentId = crypto.randomUUID();
      const source = starterSource(diagramKind);
      const manifest = {
        ...project.manifest,
        revisionId: crypto.randomUUID(),
        documents: [
          ...project.manifest.documents,
          { id: documentId, path: normalizedPath, format: "plantuml" as const },
        ],
      };
      const inputs = new Map(
        project.members
          .filter((member) => member.source)
          .map((member) => [member.path, { state: "available" as const, source: member.source! }]),
      );
      inputs.set(normalizedPath, { state: "available", source });
      const indexed = await indexVirtualProject(serializeProjectManifest(manifest), inputs);
      const next =
        "root" in project
          ? { ...indexed, root: project.root, nativeDocuments: project.nativeDocuments }
          : {
              ...indexed,
              archiveEntries: new Map([...project.archiveEntries, [normalizedPath, new TextEncoder().encode(source)]]),
              nativeDocuments: project.nativeDocuments,
            };
      setProject(next);
      const tabId = tabs.addDocument({
        historyId: `project-history-${manifest.projectId}-${documentId}`,
        source,
        diagramKind,
        fileName: normalizedPath,
        dirty: true,
        cursor: { line: 1, column: 1 },
      });
      tabsByMember.current.set(`${manifest.projectId}:${documentId}`, tabId);
      resetSelection();
      setInteractionMessage(`Added ${normalizedPath}; save the project to keep it`);
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
      projectRef.current = staged;
      openAllMembers(staged);
      resetSelection();
      setInteractionMessage(`Opened ZIP project ${staged.manifest.name} with ${staged.members.length} diagrams`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      reportError(error);
    }
  }, [openAllMembers, reportError, resetSelection, setInteractionMessage]);

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

  const updateProjectManifest = useCallback((patch: Partial<Pick<ActiveProject["manifest"], "links" | "elements">>) => {
    const current = projectRef.current;
    if (!current) return;
    const manifest = { ...current.manifest, ...patch };
    const pending = { ...current, manifest } as ActiveProject;
    projectRef.current = pending;
    setProject(pending);
    void reindexActiveProject(current, manifest).then((indexed) => {
      if (projectRef.current !== pending) return;
      projectRef.current = indexed;
      setProject(indexed);
    });
  }, []);
  const updateLinks = useCallback(
    (links: readonly ProjectLink[]) => updateProjectManifest({ links: [...links] }),
    [updateProjectManifest],
  );
  const updateElements = useCallback(
    (elements: readonly ProjectElement[]) => updateProjectManifest({ elements: [...elements] }),
    [updateProjectManifest],
  );
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
  const convertCurrentProject = useCallback(async () => {
    const current = projectRef.current;
    if (!current) return undefined;
    return convertLegacyProject(current, current.nativeDocuments);
  }, []);

  return {
    project,
    openProject,
    newProject,
    newZipProject,
    openZipProject,
    saveZipProject,
    saveFolderProject,
    openMember,
    addProjectDiagram,
    updateLinks,
    updateElements,
    applyRenameMappings,
    convertCurrentProject,
    isProjectMemberTab: (id: string) => [...tabsByMember.current.values()].includes(id),
    closeProject: () => setProject(undefined),
  };
}
