import { importedDiagramKind } from "../import-source";
import { rememberRecentFile } from "../recent-files";
import type { FileSaveState } from "../FileSaveStatus";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  decodeDocument,
  decodeEnvelope,
  decodeProject,
  DocumentFormatError,
  encodeProject,
  hashSource,
  projectFromDocument,
  projectFromPlantUml,
  sha256,
  type PortableProject,
  type PortableProjectElement,
  type PortableProjectLink,
  type UnlockedDocumentKey,
} from "@plantuml-studio/document-format";
import {
  applyIdentityMappings,
  serializeProjectManifest,
  type IdentityMapping,
  type ProjectElement,
  type ProjectLink,
  type ProjectManifest,
} from "@plantuml-studio/project-model";
import {
  isPortableDocument,
  downloadText,
  openDocumentFile,
  readDocumentBytes,
  savePortableDocumentAs,
  type OpenedFileBytes,
  type WritableFileHandle,
} from "../file-service";
import {
  liveProjectFromSharedDocument,
  sharedDocumentFromProject,
  type SharedDocument,
} from "../collaboration-document";
import { detectDiagramKind } from "../diagram-kind";
import { starterSource } from "../use-workspace-documents";
import type { DocumentSnapshot } from "../workspace-storage";
import type { DiagramKind } from "../model";
import { indexVirtualProject, type IndexedProjectMember, type VirtualProject } from "./project-index";
import { EmbeddedProjectSaveCoordinator, settleSavedRevision } from "./embedded-project-save";
import { createProjectReviewReport, reviewProjectChanges as buildProjectChangeReview } from "./project-change-review";
import { useEmbeddedProject } from "./use-embedded-project";
import { useUnsavedProjectGuard } from "./use-unsaved-project-guard";
import { embeddedDiagramDisplayName } from "./embedded-project";
import { embeddedMemberHistoryId } from "./embedded-project";
import type { WbsGanttConversion } from "../wbs-gantt";

type Tabs = {
  addDocument(input?: Partial<Omit<DocumentSnapshot, "id">>): string;
  activateDocument(id: string): void;
  closeDocument(id: string): void;
  updateDocumentSource(id: string, source: string, diagramKind: DiagramKind): void;
  updateDocumentFormat(id: string, patch: Partial<DocumentSnapshot>): void;
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

/** Keeps the navigator responsive while the full declaration/link resolver catches up. */
function immediateIndex(project: PortableProject): VirtualProject {
  const manifest = manifestFor(project);
  const members: IndexedProjectMember[] = project.diagrams.map((diagram) => {
    const diagramKind = detectDiagramKind(diagram.document.current.source);
    const elementIds = new Set(
      project.elements.filter((element) => element.documentId === diagram.id).map((element) => element.id),
    );
    return {
      documentId: diagram.id,
      path: diagram.name,
      state: diagramKind ? "available" : "unsupported",
      ...(diagramKind ? { diagramKind } : { reason: "Diagram type could not be identified" }),
      source: diagram.document.current.source,
      declarations: [],
      linkCount: project.links.filter((link) => elementIds.has(link.from) || elementIds.has(link.to)).length,
    };
  });
  return { manifest, members, resolutions: new Map() };
}

/**
 * Extracting declarations can involve the renderer worker. Keep it away from
 * the interaction that creates a diagram, then replace the lightweight index
 * once the browser is idle enough to do the richer work.
 */
function resolveIndex(project: PortableProject, signal?: AbortSignal): Promise<VirtualProject> {
  return indexVirtualProject(
    serializeProjectManifest(manifestFor(project)),
    new Map(
      project.diagrams.map((diagram) => [
        diagram.name,
        { state: "available" as const, source: diagram.document.current.source },
      ]),
    ),
    signal,
  );
}

function projectName(name: string): string {
  const value = name.trim();
  return value || "PlantUML document";
}

export function projectDiagramName(name: string, fallback = "Diagram"): string {
  const value = embeddedDiagramDisplayName(name);
  return value === "Diagram" ? fallback : value;
}

export function applyPortableProjectRenameMappings(
  project: PortableProject,
  documentId: string,
  mappings: readonly IdentityMapping[],
  sourceHash: string,
): PortableProject {
  const elementIds = new Set(
    project.elements.filter((element) => element.documentId === documentId).map((element) => element.id),
  );
  const scopedMappings = mappings.filter((mapping) => elementIds.has(mapping.elementId));
  return {
    ...project,
    revisionId: crypto.randomUUID(),
    elements: applyIdentityMappings(
      project.elements as ProjectElement[],
      scopedMappings,
      sourceHash,
    ) as PortableProjectElement[],
  };
}

export async function decodePortableProjectFile(
  bytes: Uint8Array,
  fileName: string,
  requestPassword: (fileName: string) => Promise<string | undefined>,
): Promise<{ project: PortableProject; key?: UnlockedDocumentKey; encrypted: boolean } | undefined> {
  const envelope = decodeEnvelope(bytes);
  const decode = async (password?: string) => {
    if (envelope.version === 2) {
      const decoded = await decodeProject(bytes, password ? { password } : {});
      return { project: decoded.project, key: decoded.unlockedKey };
    }
    const decoded = await decodeDocument(bytes, password ? { password } : {});
    return {
      project: projectFromDocument(decoded.document, fileName, new Date().toISOString()),
      key: decoded.unlockedKey,
    };
  };
  try {
    const decoded = await decode();
    return {
      project: decoded.project,
      ...(decoded.key ? { key: decoded.key } : {}),
      encrypted: Boolean(decoded.key),
    };
  } catch (error) {
    if (!(error instanceof DocumentFormatError) || error.code !== "password-required") throw error;
    const password = await requestPassword(fileName);
    if (password === undefined) return undefined;
    const decoded = await decode(password);
    return {
      project: decoded.project,
      ...(decoded.key ? { key: decoded.key } : {}),
      encrypted: Boolean(decoded.key),
    };
  }
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
/** Raised when the project file was changed by another tab, app or synced folder since it was read. */
class ProjectFileChangedError extends Error {
  constructor() {
    super(
      "The document file changed on disk since it was opened or saved here. Use Save As to keep both versions, or reopen the file.",
    );
  }
}

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
  const projectGeneration = useRef(0);
  const saveBeforeLeaving = useRef<() => Promise<boolean>>(async () => false);
  const {
    request: leaveRequest,
    decide: decideLeave,
    confirmLeave,
  } = useUnsavedProjectGuard({
    dirty: embedded.dirty,
    projectId: embedded.project?.projectId,
    projectName: embedded.project?.name,
    save: () => saveBeforeLeaving.current(),
  });
  const [indexed, setIndexed] = useState<VirtualProject>();
  const [indexStatus, setIndexStatus] = useState<{
    state: "idle" | "indexing" | "ready" | "error";
    message?: string;
  }>({ state: "idle" });
  const [unlockRequest, setUnlockRequest] = useState<{ fileName: string }>();
  const [saving, setSaving] = useState(false);
  const [fileSaveState, setFileSaveState] = useState<FileSaveState>();
  const [savedBaseline, setSavedBaseline] = useState<PortableProject>();
  const unlockResolver = useRef<((password: string | undefined) => void) | undefined>(undefined);
  const handle = useRef<WritableFileHandle | undefined>(undefined);
  // Digest of the bytes last read from or written to `handle`, used to detect changes made elsewhere.
  const handleDigest = useRef<string | undefined>(undefined);
  const unlockedKey = useRef<UnlockedDocumentKey | undefined>(undefined);
  const saveCoordinator = useRef(new EmbeddedProjectSaveCoordinator());
  const saveAbort = useRef<AbortController | undefined>(undefined);
  const restored = useRef(false);
  const indexRevision = useRef(0);
  const effectiveProject = embedded.effectiveProject;
  const restoreEmbeddedProject = embedded.restoreProject;

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    void restoreEmbeddedProject().then((recovery) => {
      if (recovery?.state === "unlocked")
        setInteractionMessage("Restored local recovery. Save the document to keep a file copy.");
      if (recovery?.state === "locked")
        setInteractionMessage("An encrypted document was open here. Reopen its .pumlu file to unlock it.");
    });
  }, [restoreEmbeddedProject, setInteractionMessage]);

  useEffect(() => {
    if (!effectiveProject) {
      indexRevision.current += 1;
      setIndexed(undefined);
      setIndexStatus({ state: "idle" });
      return;
    }
    setIndexed(immediateIndex(effectiveProject));
    setIndexStatus({ state: "indexing" });
  }, [effectiveProject]);

  useEffect(() => {
    const project = effectiveProject;
    if (!project) return;
    const revision = ++indexRevision.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void resolveIndex(project, controller.signal)
        .then((next) => {
          if (indexRevision.current !== revision) return;
          setIndexed(next);
          setIndexStatus({ state: "ready" });
        })
        .catch((error: unknown) => {
          if (indexRevision.current !== revision) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setIndexStatus({
            state: "error",
            message: error instanceof Error ? error.message : "The document index could not be updated",
          });
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [effectiveProject]);

  const newProject = useCallback(
    async (name: string) => {
      if (!name.trim()) return;
      const created = await projectFromPlantUml("", "gantt", new Date().toISOString());
      const project = { ...created, name: projectName(name), diagrams: [] };
      if (!(await confirmLeave("create a new document"))) return;
      projectGeneration.current += 1;
      setFileSaveState(undefined);
      saveAbort.current?.abort();
      embedded.openProject(project, { unsaved: true });
      setIndexed(immediateIndex(project));
      handle.current = undefined;
      handleDigest.current = undefined;
      unlockedKey.current = undefined;
      setSavedBaseline(undefined);
      resetSelection();
      setInteractionMessage(`Created ${projectName(name)}. Add a diagram to begin.`);
    },
    [confirmLeave, embedded, resetSelection, setInteractionMessage],
  );

  const createWbsGanttProject = useCallback(
    async (name: string, converted: WbsGanttConversion, sourceTabId: string) => {
      const title = projectName(name);
      const wbs = await projectFromPlantUml(converted.wbsSource, "wbs", `${title} WBS`);
      const gantt = await projectFromPlantUml(converted.ganttSource, "gantt", `${title} schedule`);
      const wbsDiagram = wbs.diagrams[0]!;
      const ganttDiagram = {
        ...gantt.diagrams[0]!,
        wbsGantt: { wbsDiagramId: wbsDiagram.id, links: converted.links, dependencies: converted.dependencies },
      };
      const project: PortableProject = {
        ...wbs,
        name: title,
        revisionId: crypto.randomUUID(),
        diagrams: [wbsDiagram, ganttDiagram],
      };
      if (!(await confirmLeave("create a new document"))) return;
      projectGeneration.current += 1;
      setFileSaveState(undefined);
      saveAbort.current?.abort();
      embedded.openProject(project, { unsaved: true });
      embedded.updateProject((current) => ({ ...current, revisionId: crypto.randomUUID() }));
      handle.current = undefined;
      handleDigest.current = undefined;
      unlockedKey.current = undefined;
      setSavedBaseline(undefined);
      const wbsTabId = tabs.addDocument({
        historyId: embeddedMemberHistoryId(project.projectId, wbsDiagram.id),
        diagramKind: "wbs",
        source: converted.wbsSource,
        fileName: wbsDiagram.name,
        dirty: true,
        portableDocumentId: wbsDiagram.document.documentId,
      });
      tabs.addDocument({
        historyId: embeddedMemberHistoryId(project.projectId, ganttDiagram.id),
        diagramKind: "gantt",
        source: converted.ganttSource,
        fileName: ganttDiagram.name,
        dirty: true,
        portableDocumentId: ganttDiagram.document.documentId,
        linkedWbsDocumentId: wbsTabId,
        wbsGanttLinks: converted.links,
        wbsGanttDependencies: converted.dependencies,
      });
      tabs.closeDocument(sourceTabId);
      resetSelection();
      setInteractionMessage(
        `Created ${title} with linked WBS and Gantt diagrams. Save the document to keep them together.`,
      );
    },
    [confirmLeave, embedded, resetSelection, setInteractionMessage, tabs],
  );

  const addGanttFromWbs = useCallback(
    async (wbsDiagramId: string, converted: WbsGanttConversion, sourceTabId: string) => {
      const current = embedded.project;
      const wbs = current?.diagrams.find((diagram) => diagram.id === wbsDiagramId);
      if (!current || !wbs) throw new Error("The WBS diagram is no longer in this document");
      if (current.diagrams.some((diagram) => diagram.wbsGantt?.wbsDiagramId === wbsDiagramId))
        throw new Error("This WBS diagram already has a linked Gantt chart");
      const baseName = `${wbs.name} schedule`;
      let name = baseName;
      for (let suffix = 2; current.diagrams.some((diagram) => diagram.name === name); suffix++)
        name = `${baseName} ${suffix}`;
      const staged = await projectFromPlantUml(converted.ganttSource, "gantt", name);
      const gantt = {
        ...staged.diagrams[0]!,
        name,
        wbsGantt: { wbsDiagramId, links: converted.links, dependencies: converted.dependencies },
      };
      if (converted.wbsSource !== tabs.documents.find((tab) => tab.id === sourceTabId)?.source)
        tabs.updateDocumentSource(sourceTabId, converted.wbsSource, "wbs");
      const ganttTabId = embedded.addDiagram(gantt);
      if (!ganttTabId) throw new Error("Could not add the Gantt chart to this document");
      tabs.updateDocumentFormat(ganttTabId, {
        linkedWbsDocumentId: sourceTabId,
        wbsGanttLinks: converted.links,
        wbsGanttDependencies: converted.dependencies,
      });
      setIndexed(immediateIndex({ ...current, diagrams: [...current.diagrams, gantt] }));
      resetSelection();
      setInteractionMessage(`Added ${name} to ${current.name}. Save the document to keep the linked chart.`);
    },
    [embedded, resetSelection, setInteractionMessage, tabs],
  );

  const requestPassword = useCallback((fileName: string) => {
    unlockResolver.current?.(undefined);
    return new Promise<string | undefined>((resolve) => {
      unlockResolver.current = resolve;
      setUnlockRequest({ fileName });
    });
  }, []);
  const finishUnlock = useCallback((password: string | undefined) => {
    const resolve = unlockResolver.current;
    unlockResolver.current = undefined;
    setUnlockRequest(undefined);
    resolve?.(password);
  }, []);
  const unlock = useCallback((password: string) => finishUnlock(password), [finishUnlock]);
  const cancelUnlock = useCallback(() => finishUnlock(undefined), [finishUnlock]);

  const addPortableDiagram = useCallback(
    (diagram: PortableProject["diagrams"][number]) => {
      const current = embedded.project;
      if (!current || !embedded.addDiagram(diagram)) throw new Error("Open a document before adding a diagram");
      setIndexed(immediateIndex({ ...current, diagrams: [...current.diagrams, diagram] }));
      resetSelection();
      setInteractionMessage(`Added ${diagram.name}. Save the document to keep it.`);
    },
    [embedded, resetSelection, setInteractionMessage],
  );
  const addProjectDiagram = useCallback(
    async (kind: DiagramKind, name: string, initialSource?: string) => {
      try {
        const displayName = projectDiagramName(name, `${kind} diagram`);
        const staged = await projectFromPlantUml(initialSource ?? starterSource(kind), kind, displayName);
        addPortableDiagram({ ...staged.diagrams[0]!, name: displayName });
        return true;
      } catch (error) {
        reportError(error);
        return false;
      }
    },
    [addPortableDiagram, reportError],
  );
  const importDiagram = useCallback(async () => {
    const file = await chooseDiagramFile();
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (isPortableDocument(bytes)) {
        let decoded;
        try {
          decoded = await decodeDocument(bytes);
        } catch (error) {
          if (!(error instanceof DocumentFormatError) || error.code !== "password-required") throw error;
          const password = await requestPassword(file.name);
          if (password === undefined) return;
          decoded = await decodeDocument(bytes, { password });
        }
        const displayName = projectDiagramName(file.name);
        const staged = projectFromDocument(decoded.document, displayName, new Date().toISOString());
        addPortableDiagram({ ...staged.diagrams[0]!, name: displayName });
        return;
      }
      const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const kind = detectDiagramKind(source);
      if (!kind) {
        setInteractionMessage("Choose a supported PlantUML diagram");
        return;
      }
      const staged = await projectFromPlantUml(source, kind, new Date().toISOString());
      addPortableDiagram({ ...staged.diagrams[0]!, name: projectDiagramName(file.name) });
    } catch (error) {
      reportError(error);
    }
  }, [addPortableDiagram, reportError, requestPassword, setInteractionMessage]);

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
          const kind = importedDiagramKind(source);
          project = await projectFromPlantUml(source, kind, opened.fileName.replace(/\.(?:puml|plantuml)$/i, ""));
          project = { ...project, name: opened.fileName.replace(/\.(?:puml|plantuml)$/i, "") };
        } else {
          const decoded = await decodePortableProjectFile(opened.bytes, opened.fileName, requestPassword);
          if (!decoded) return false;
          project = decoded.project;
          key = decoded.key;
          encrypted = decoded.encrypted;
        }
        if (!(await confirmLeave("open another document"))) return false;
        projectGeneration.current += 1;
        setFileSaveState(undefined);
        saveAbort.current?.abort();
        unlockedKey.current = key;
        handle.current = opened.handle;
        handleDigest.current = opened.handle ? await sha256(opened.bytes) : undefined;
        embedded.openProject(project, { encrypted, unsaved: Boolean(opened.importedSource) });
        setSavedBaseline(opened.kind === "legacy" ? undefined : structuredClone(project));
        resetSelection();
        setInteractionMessage(
          `Opened ${project.name} with ${project.diagrams.length} diagram${project.diagrams.length === 1 ? "" : "s"}`,
        );
        if (!opened.importedSource)
          await rememberRecentFile(opened.fileName, opened.handle, "document").catch(() => undefined);
        return true;
      } catch (error) {
        reportError(error);
        return false;
      }
    },
    [confirmLeave, embedded, reportError, requestPassword, resetSelection, setInteractionMessage],
  );
  const openProject = useCallback(async () => openOpenedProject(await openDocumentFile()), [openOpenedProject]);
  const openPortableProject = useCallback(
    async (project: PortableProject) => {
      if (!(await confirmLeave("import another document"))) return;
      unlockedKey.current = undefined;
      handle.current = undefined;
      handleDigest.current = undefined;
      projectGeneration.current += 1;
      setFileSaveState(undefined);
      saveAbort.current?.abort();
      embedded.openProject(project, { unsaved: true });
      setSavedBaseline(undefined);
      resetSelection();
      setInteractionMessage(`Imported ${project.name}; save to create its one-file document.`);
    },
    [confirmLeave, embedded, resetSelection, setInteractionMessage],
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
  /**
   * Elements the link index registers from diagram declarations are derived, not edited, so
   * recording them must not mark a project that was just saved as having unsaved changes.
   */
  const registerElements = useCallback(
    (elements: readonly ProjectElement[]) =>
      embedded.updateDerivedProject((current) => ({
        ...current,
        elements: elements as PortableProjectElement[],
      })),
    [embedded],
  );
  const applyRenameMappings = useCallback(
    async (documentId: string, mappings: readonly IdentityMapping[], source: string) => {
      if (!mappings.length) return;
      const sourceHash = await hashSource(source);
      embedded.updateProject((current) =>
        applyPortableProjectRenameMappings(current, documentId, mappings, sourceHash),
      );
    },
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
    if (!handle.current) return undefined;
    saveAbort.current?.abort();
    const controller = new AbortController();
    saveAbort.current = controller;
    setSaving(true);
    const documentId = embedded.project?.projectId ?? "";
    setFileSaveState({ documentId, status: "saving" });
    const generation = projectGeneration.current;
    const isCurrent = () => projectGeneration.current === generation;
    const target = handle.current;
    let writtenBytes: Uint8Array | undefined;
    try {
      const snapshot = await embedded.captureSaveSnapshot();
      if (!snapshot) return;
      const written = await saveCoordinator.current.save(
        snapshot,
        async (value, signal) => {
          // Checked inside the save queue so an earlier write from this tab is already reflected.
          // An unreadable file (deleted or permission revoked) is rewritten as before.
          const observed = handleDigest.current ? await readDocumentBytes(target).catch(() => undefined) : undefined;
          if (observed && (await sha256(observed.bytes)) !== handleDigest.current) throw new ProjectFileChangedError();
          writtenBytes = (
            await encodeProject(value, {
              ...(unlockedKey.current ? { unlockedKey: unlockedKey.current } : {}),
              ...(signal ? { signal } : {}),
            })
          ).bytes;
          return writtenBytes;
        },
        target,
        embedded.currentRevision,
        controller.signal,
      );
      if (!isCurrent()) return { clean: false, message: "Saved previous document snapshot" };
      if (writtenBytes) {
        const digest = await sha256(writtenBytes);
        if (isCurrent() && handle.current === target) handleDigest.current = digest;
      }
      const result = (await settleSavedRevision(snapshot, embedded, isCurrent))
        ? { clean: true, message: "Saved document" }
        : written;
      if (!isCurrent()) return { clean: false, message: "Saved previous document snapshot" };
      setSavedBaseline(structuredClone(snapshot.project));
      setFileSaveState({ documentId, status: "saved" });
      setInteractionMessage(result.message);
      return result;
    } catch (error) {
      if (!isCurrent()) return { clean: false, message: "Previous document save cancelled" };
      if (error instanceof ProjectFileChangedError) {
        setFileSaveState({ documentId, status: "error", message: error.message });
        setInteractionMessage(error.message);
        return { clean: false, message: error.message };
      }
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      const detail = error instanceof Error ? error.message : "The file could not be written";
      const result = {
        clean: false,
        message: cancelled
          ? "Document save cancelled. Your changes remain in the workspace."
          : `Document save failed: ${detail}. Your changes remain in the workspace. Retry Save, or use Save As to choose another file.`,
      };
      setFileSaveState({ documentId, status: cancelled ? "cancelled" : "error", message: result.message });
      setInteractionMessage(result.message);
      if (!cancelled) reportError(new Error(result.message));
      return result;
    } finally {
      if (saveAbort.current === controller) {
        saveAbort.current = undefined;
        setSaving(false);
        setFileSaveState((current) =>
          current?.documentId === documentId && current.status === "saving"
            ? { documentId, status: "cancelled" }
            : current,
        );
      }
    }
  }, [embedded, reportError, setInteractionMessage]);

  const saveProjectAs = useCallback(async () => {
    saveAbort.current?.abort();
    const controller = new AbortController();
    saveAbort.current = controller;
    setSaving(true);
    const documentId = embedded.project?.projectId ?? "";
    setFileSaveState({ documentId, status: "saving" });
    const generation = projectGeneration.current;
    const isCurrent = () => projectGeneration.current === generation;
    try {
      const snapshot = await embedded.captureSaveSnapshot();
      if (!snapshot) return;
      const encoded = await encodeProject(snapshot.project, {
        ...(unlockedKey.current ? { unlockedKey: unlockedKey.current } : {}),
        signal: controller.signal,
      });
      const saved = await savePortableDocumentAs(encoded.bytes, snapshot.project.name, controller.signal);
      if (!isCurrent()) return;
      if (!saved) {
        setFileSaveState({ documentId, status: "cancelled" });
        setInteractionMessage("Document save cancelled. Your changes remain in the workspace.");
        return;
      }
      const digest = saved.handle ? await sha256(encoded.bytes) : undefined;
      if (!isCurrent()) return;
      handle.current = saved.handle;
      handleDigest.current = digest;
      unlockedKey.current = encoded.unlockedKey;
      const clean = await settleSavedRevision(snapshot, embedded, isCurrent);
      if (!isCurrent()) return;
      setSavedBaseline(structuredClone(snapshot.project));
      setFileSaveState({ documentId, status: saved.downloaded ? "downloaded" : "saved" });
      setInteractionMessage(
        saved.downloaded
          ? "Downloaded document snapshot"
          : clean
            ? `Saved ${saved.fileName}`
            : `Saved snapshot ${saved.fileName}; newer changes remain unsaved`,
      );
      return { clean };
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof DOMException && error.name === "AbortError") {
        setFileSaveState({ documentId, status: "cancelled" });
        setInteractionMessage("Document save cancelled. Your changes remain in the workspace.");
      } else {
        const detail = error instanceof Error ? error.message : "The file could not be written";
        const message = `Document Save As failed: ${detail}. Your changes remain in the workspace. Retry Save As to choose a writable file.`;
        setFileSaveState({ documentId, status: "error", message });
        setInteractionMessage(message);
        reportError(new Error(message));
      }
    } finally {
      if (saveAbort.current === controller) {
        saveAbort.current = undefined;
        setSaving(false);
        setFileSaveState((current) =>
          current?.documentId === documentId && current.status === "saving"
            ? { documentId, status: "cancelled" }
            : current,
        );
      }
    }
  }, [embedded, reportError, setInteractionMessage]);

  saveBeforeLeaving.current = async () => {
    const result = await saveProject();
    return Boolean((result ?? (await saveProjectAs()))?.clean);
  };

  const cancelSave = useCallback(() => saveAbort.current?.abort(), []);
  const reviewChanges = useCallback(async () => {
    if (!savedBaseline) return undefined;
    const current = await embedded.captureSaveSnapshot();
    return current ? buildProjectChangeReview(savedBaseline, current.project) : undefined;
  }, [embedded, savedBaseline]);
  const exportReviewReport = useCallback(async () => {
    if (!savedBaseline) return;
    const current = await embedded.captureSaveSnapshot();
    if (!current) return;
    const review = buildProjectChangeReview(savedBaseline, current.project);
    const names = new Map(
      [...savedBaseline.diagrams, ...current.project.diagrams].map((diagram) => [diagram.id, diagram.name]),
    );
    const report = createProjectReviewReport(current.project.name, review, names);
    const fileName = `${current.project.name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "document"}-review.html`;
    downloadText(report, fileName, "text/html;charset=utf-8");
    setInteractionMessage(`Exported ${fileName}`);
  }, [embedded, savedBaseline, setInteractionMessage]);
  const closeProject = useCallback(async () => {
    if (!(await confirmLeave("close this document"))) return;
    projectGeneration.current += 1;
    setFileSaveState(undefined);
    saveAbort.current?.abort();
    setSavedBaseline(undefined);
    embedded.closeProject();
    handle.current = undefined;
    handleDigest.current = undefined;
    unlockedKey.current = undefined;
  }, [confirmLeave, embedded]);

  const receiveSharedDocument = useCallback(
    (shared: SharedDocument) => {
      const next = liveProjectFromSharedDocument(shared, embedded.effectiveProject);
      const sameDocument = embedded.project?.projectId === next.projectId;
      if (!sameDocument) {
        projectGeneration.current += 1;
        setFileSaveState(undefined);
        saveAbort.current?.abort();
      }
      embedded.receiveProject(next);
      if (!sameDocument) {
        handle.current = undefined;
        handleDigest.current = undefined;
        unlockedKey.current = undefined;
        setSavedBaseline(undefined);
        // Joining a shared document leaves unrelated local tabs alone.
      }
    },
    [embedded],
  );

  return useMemo(
    () => ({
      portableProject: embedded.project,
      sharedDocument: embedded.effectiveProject ? sharedDocumentFromProject(embedded.effectiveProject) : undefined,
      receiveSharedDocument,
      project: indexed,
      indexStatus,
      dirty: embedded.dirty,
      recoveryStatus: embedded.recoveryStatus,
      saving,
      fileSaveState,
      newProject,
      createWbsGanttProject,
      addGanttFromWbs,
      addProjectDiagram,
      importDiagram,
      openProject,
      openOpenedProject,
      openPortableProject,
      openMember: embedded.openMember,
      updateLinks,
      updateElements,
      registerElements,
      applyRenameMappings,
      renameDiagram,
      deleteDiagram,
      saveProject,
      saveProjectAs,
      restoreProject: embedded.restoreProject,
      unlockRequest,
      unlock,
      cancelUnlock,
      cancelSave,
      leaveRequest,
      decideLeave,
      reviewChanges,
      exportReviewReport,
      hasReviewBaseline: Boolean(savedBaseline),
      closeProject,
    }),
    [
      receiveSharedDocument,
      addProjectDiagram,
      deleteDiagram,
      embedded,
      importDiagram,
      indexed,
      indexStatus,
      saving,
      fileSaveState,
      newProject,
      createWbsGanttProject,
      addGanttFromWbs,
      openProject,
      openOpenedProject,
      openPortableProject,
      renameDiagram,
      saveProject,
      saveProjectAs,
      updateElements,
      registerElements,
      applyRenameMappings,
      updateLinks,
      unlockRequest,
      unlock,
      cancelUnlock,
      cancelSave,
      leaveRequest,
      decideLeave,
      reviewChanges,
      exportReviewReport,
      savedBaseline,
      closeProject,
    ],
  );
}
