import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  decodeDocument,
  decodeProject,
  encodeProject,
  projectFromDocument,
  projectFromPlantUml,
  type PortableProject,
  type PortableProjectElement,
  type PortableProjectLink,
  type UnlockedDocumentKey,
} from "@plantuml-studio/document-format";
import {
  serializeProjectManifest,
  type ProjectElement,
  type ProjectLink,
  type ProjectManifest,
} from "@plantuml-studio/project-model";
import {
  isPortableDocument,
  openDocumentFile,
  savePortableDocumentAs,
  type OpenedFileBytes,
  type WritableFileHandle,
} from "../file-service";
import { detectDiagramKind } from "../diagram-kind";
import { starterSource } from "../use-workspace-documents";
import type { DocumentSnapshot } from "../workspace-storage";
import { indexVirtualProject, type VirtualProject } from "./project-index";
import { EmbeddedProjectSaveCoordinator } from "./embedded-project-save";
import { useEmbeddedProject } from "./use-embedded-project";

type Tabs = {
  addDocument(input?: Partial<Omit<DocumentSnapshot, "id">>): string;
  activateDocument(id: string): void;
  closeDocument(id: string): void;
  documents: readonly DocumentSnapshot[];
};

function manifestFor(project: PortableProject): ProjectManifest {
  return {
    format: "plantuml-ultimate-project",
    schemaVersion: 1,
    projectId: project.projectId,
    revisionId: project.revisionId,
    name: project.name,
    documents: project.diagrams.map((diagram) => ({ id: diagram.id, path: diagram.name, format: "pumlu" as const })),
    elements: project.elements as ProjectElement[],
    links: project.links as ProjectLink[],
  };
}

async function indexProject(project: PortableProject): Promise<VirtualProject> {
  const manifest = manifestFor(project);
  return indexVirtualProject(
    serializeProjectManifest(manifest),
    new Map(
      project.diagrams.map((diagram) => [
        diagram.name,
        { state: "available" as const, source: diagram.document.current.source },
      ]),
    ),
  );
}

function projectName(name: string): string {
  const value = name.trim();
  return value || "PlantUML project";
}

function chooseDiagramFile(): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".puml,.plantuml,.pumlu,text/plain,application/octet-stream";
    input.onchange = () => resolve(input.files?.[0]);
    input.click();
  });
}

/** The ordinary one-file project workflow. Legacy folder/ZIP projects remain separate import paths. */
export function useSingleFileProject({
  tabs,
  resetSelection,
  setInteractionMessage,
  reportError,
}: {
  tabs: Tabs;
  resetSelection(): void;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
  reportError(error: unknown): void;
}) {
  const embedded = useEmbeddedProject(tabs);
  const [indexed, setIndexed] = useState<VirtualProject>();
  const handle = useRef<WritableFileHandle | undefined>(undefined);
  const unlockedKey = useRef<UnlockedDocumentKey | undefined>(undefined);
  const saveCoordinator = useRef(new EmbeddedProjectSaveCoordinator());
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    void embedded.restoreProject().then((recovery) => {
      if (recovery?.state === "locked")
        setInteractionMessage("An encrypted project was open here. Reopen its .pumlu file to unlock it.");
    });
  }, [embedded.restoreProject, setInteractionMessage]);

  useEffect(() => {
    if (!embedded.project) {
      setIndexed(undefined);
      return;
    }
    let active = true;
    void indexProject(embedded.project).then((next) => {
      if (active) setIndexed(next);
    });
    return () => {
      active = false;
    };
  }, [embedded.project]);

  const newProject = useCallback(
    async (name = window.prompt("Project name", "PlantUML project") ?? "") => {
      if (!name.trim()) return;
      const created = await projectFromPlantUml("", "gantt", new Date().toISOString());
      embedded.openProject({ ...created, name: projectName(name), diagrams: [] });
      handle.current = undefined;
      unlockedKey.current = undefined;
      resetSelection();
      setInteractionMessage(`Created ${projectName(name)}. Add a diagram to begin.`);
    },
    [embedded, resetSelection, setInteractionMessage],
  );

  const addPortableDiagram = useCallback(
    (diagram: PortableProject["diagrams"][number]) => {
      if (!embedded.project || !embedded.addDiagram(diagram)) throw new Error("Open a project before adding a diagram");
      resetSelection();
      setInteractionMessage(`Added ${diagram.name}. Save the project to keep it.`);
    },
    [embedded, resetSelection, setInteractionMessage],
  );
  const addProjectDiagram = useCallback(
    async (kind: "gantt" | "class" | "sequence", name: string) => {
      try {
        const displayName = projectName(name).replace(/\.(?:puml|pumlu)$/i, "") + ".pumlu";
        const staged = await projectFromPlantUml(starterSource(kind), kind, displayName);
        addPortableDiagram({ ...staged.diagrams[0]!, name: displayName });
      } catch (error) {
        reportError(error);
      }
    },
    [addPortableDiagram, embedded.project, reportError],
  );
  const importDiagram = useCallback(async () => {
    const file = await chooseDiagramFile();
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (isPortableDocument(bytes)) {
        const password = window.prompt(`Password for ${file.name} (leave blank if it is not encrypted)`) ?? undefined;
        const decoded = await decodeDocument(bytes, password ? { password } : {});
        const staged = projectFromDocument(decoded.document, file.name, new Date().toISOString());
        addPortableDiagram(staged.diagrams[0]!);
        return;
      }
      const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const kind = detectDiagramKind(source);
      if (!kind || !["gantt", "class", "sequence"].includes(kind)) {
        setInteractionMessage("Choose a supported Gantt, Class, or Sequence PlantUML diagram");
        return;
      }
      const staged = await projectFromPlantUml(source, kind, new Date().toISOString());
      addPortableDiagram({ ...staged.diagrams[0]!, name: file.name });
    } catch (error) {
      reportError(error);
    }
  }, [addPortableDiagram, reportError, setInteractionMessage]);

  const openOpenedProject = useCallback(
    async (opened: OpenedFileBytes | undefined): Promise<boolean> => {
      try {
        if (!opened) return false;
        let project: PortableProject;
        let key: UnlockedDocumentKey | undefined;
        let encrypted = false;
        if (opened.kind === "legacy") {
          const source = opened.source;
          if (source === undefined) throw new Error("Could not read this PlantUML file");
          const kind = detectDiagramKind(source);
          if (!kind) throw new Error("Could not identify this PlantUML diagram type");
          project = await projectFromPlantUml(source, kind, new Date().toISOString());
          project = { ...project, name: opened.fileName.replace(/\.(?:puml|plantuml)$/i, "") };
        } else {
          const password =
            window.prompt(`Password for ${opened.fileName} (leave blank if it is not encrypted)`) ?? undefined;
          try {
            const decoded = await decodeProject(opened.bytes, password ? { password } : {});
            project = decoded.project;
            key = decoded.unlockedKey;
            encrypted = Boolean(key);
          } catch {
            const decoded = await decodeDocument(opened.bytes, password ? { password } : {});
            project = projectFromDocument(decoded.document, opened.fileName, new Date().toISOString());
            key = decoded.unlockedKey;
            encrypted = Boolean(key);
          }
        }
        unlockedKey.current = key;
        handle.current = opened.handle;
        embedded.openProject(project, { encrypted });
        resetSelection();
        setInteractionMessage(
          `Opened ${project.name} with ${project.diagrams.length} diagram${project.diagrams.length === 1 ? "" : "s"}`,
        );
        return true;
      } catch (error) {
        reportError(error);
        return false;
      }
    },
    [embedded, reportError, resetSelection, setInteractionMessage],
  );
  const openProject = useCallback(async () => openOpenedProject(await openDocumentFile()), [openOpenedProject]);
  const openPortableProject = useCallback(
    (project: PortableProject) => {
      unlockedKey.current = undefined;
      handle.current = undefined;
      embedded.openProject(project);
      resetSelection();
      setInteractionMessage(`Imported ${project.name}; save to create its one-file project.`);
    },
    [embedded, resetSelection, setInteractionMessage],
  );

  const updateLinks = useCallback(
    (links: readonly ProjectLink[]) =>
      embedded.updateProject((current) => ({
        ...current,
        revisionId: crypto.randomUUID(),
        links: links as PortableProjectLink[],
      })),
    [embedded],
  );
  const updateElements = useCallback(
    (elements: readonly ProjectElement[]) =>
      embedded.updateProject((current) => ({
        ...current,
        revisionId: crypto.randomUUID(),
        elements: elements as PortableProjectElement[],
      })),
    [embedded],
  );
  const renameDiagram = useCallback(
    (memberId: string, name: string) => {
      if (!embedded.renameDiagram(memberId, name)) return;
      setInteractionMessage(`Renamed diagram to ${name.trim()}`);
    },
    [embedded, setInteractionMessage],
  );
  const deleteDiagram = useCallback(
    (memberId: string) => {
      const current = embedded.project;
      if (!current) return;
      const linked = current.elements.filter((element) => element.documentId === memberId);
      const affected = current.links.filter((link) =>
        linked.some((element) => element.id === link.from || element.id === link.to),
      );
      const diagram = current.diagrams.find((item) => item.id === memberId);
      if (!diagram) return;
      if (
        !window.confirm(
          `Delete ${diagram.name}? This also removes ${affected.length} incident connection${affected.length === 1 ? "" : "s"}.`,
        )
      )
        return;
      if (embedded.deleteDiagram(memberId)) setInteractionMessage(`Deleted ${diagram.name}`);
    },
    [embedded, setInteractionMessage],
  );

  const saveProject = useCallback(async () => {
    const snapshot = await embedded.captureSaveSnapshot();
    if (!snapshot) return;
    if (!handle.current) return undefined;
    const result = await saveCoordinator.current.save(
      snapshot,
      async (value) =>
        (await encodeProject(value, unlockedKey.current ? { unlockedKey: unlockedKey.current } : {})).bytes,
      handle.current,
      () => snapshot.revision,
    );
    if (result.clean) embedded.markSaved(snapshot.revision);
    setInteractionMessage(result.message);
    return result;
  }, [embedded, setInteractionMessage]);

  const saveProjectAs = useCallback(async () => {
    const snapshot = await embedded.captureSaveSnapshot();
    if (!snapshot) return;
    const encoded = await encodeProject(
      snapshot.project,
      unlockedKey.current ? { unlockedKey: unlockedKey.current } : {},
    );
    const bytes = encoded.bytes;
    const saved = await savePortableDocumentAs(bytes, snapshot.project.name);
    if (!saved) return;
    handle.current = saved.handle;
    unlockedKey.current = encoded.unlockedKey;
    embedded.markSaved(snapshot.revision);
    setInteractionMessage(saved.downloaded ? "Downloaded project snapshot" : `Saved ${saved.fileName}`);
  }, [embedded, setInteractionMessage]);

  return useMemo(
    () => ({
      portableProject: embedded.project,
      project: indexed,
      dirty: embedded.dirty,
      newProject,
      addProjectDiagram,
      importDiagram,
      openProject,
      openOpenedProject,
      openPortableProject,
      openMember: embedded.openMember,
      updateLinks,
      updateElements,
      renameDiagram,
      deleteDiagram,
      saveProject,
      saveProjectAs,
      closeProject: embedded.closeProject,
      restoreProject: embedded.restoreProject,
    }),
    [
      addProjectDiagram,
      deleteDiagram,
      embedded,
      importDiagram,
      indexed,
      newProject,
      openProject,
      openOpenedProject,
      openPortableProject,
      renameDiagram,
      saveProject,
      saveProjectAs,
      updateElements,
      updateLinks,
    ],
  );
}
