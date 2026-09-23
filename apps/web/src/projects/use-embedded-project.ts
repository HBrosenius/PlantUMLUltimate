import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  reconstructContents,
  type PortableProject,
  type PortableProjectDiagram,
} from "@plantuml-studio/document-format";
import { mapPortableHistoryToLocal } from "../document-format/history-mapping";
import {
  embeddedMemberHistoryId,
  embeddedMemberVersionId,
  embeddedDiagramDisplayName,
  embeddedMemberTabs,
  openEmbeddedMember,
  projectWithOpenTabSources,
  snapshotEmbeddedProject,
  type EmbeddedProjectTabs,
} from "./embedded-project";
import {
  clearEmbeddedProjectRecovery,
  loadEmbeddedProjectRecovery,
  saveEmbeddedProjectRecovery,
} from "./embedded-project-session";
import { enableMemoryOnlyHistory, importDocumentVersions } from "../workspace-storage";

function persistentTabState(tab: {
  source: string;
  baselineVersionId?: string | undefined;
  historyMaxVersions?: number | undefined;
  historyMaxLogicalBytes?: number | undefined;
  resourceCapacities?: Record<string, number> | undefined;
  wbsGanttLinks?: Array<{ wbsAlias: string; ganttAlias: string }> | undefined;
  wbsGanttDependencies?: Array<{ from: string; to: string }> | undefined;
}): string {
  return JSON.stringify([
    tab.source,
    tab.baselineVersionId,
    tab.historyMaxVersions,
    tab.historyMaxLogicalBytes,
    Object.entries(tab.resourceCapacities ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    tab.wbsGanttLinks,
    tab.wbsGanttDependencies,
  ]);
}

/** Owns one embedded project snapshot and the transient tabs used to view its members. */
export function useEmbeddedProject(tabs: EmbeddedProjectTabs) {
  const [project, setProject] = useState<PortableProject>();
  const [encrypted, setEncrypted] = useState(false);
  const memberTabs = useRef(new Map<string, string>());
  const projectRef = useRef(project);
  projectRef.current = project;
  const revisionRef = useRef(0);
  const [revision, setRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const persistentStateByMember = useRef(new Map<string, string>());
  const recoveryRevision = useRef(0);
  const historyReady = useRef(Promise.resolve());
  const baselineByMember = useRef(new Map<string, string>());
  const projectGeneration = useRef(0);

  const openProject = useCallback(
    (next: PortableProject, options: { encrypted?: boolean } = {}) => {
      next = {
        ...next,
        diagrams: next.diagrams.map((diagram) => ({ ...diagram, name: embeddedDiagramDisplayName(diagram.name) })),
      };
      const generation = ++projectGeneration.current;
      const nextEncrypted = options.encrypted ?? false;
      memberTabs.current = new Map(embeddedMemberTabs(next, tabs.documents));
      persistentStateByMember.current = new Map(
        next.diagrams.map((member) => [
          member.id,
          persistentTabState({
            source: member.document.current.source,
            baselineVersionId: member.document.current.baselineVersionId,
            historyMaxVersions: member.document.historyPolicy.maxVersions,
            historyMaxLogicalBytes: member.document.historyPolicy.maxLogicalBytes,
            resourceCapacities: member.document.settings.resourceCapacities,
            wbsGanttLinks: member.wbsGantt?.links,
            wbsGanttDependencies: member.wbsGantt?.dependencies,
          }),
        ]),
      );
      revisionRef.current = 0;
      setRevision(0);
      setSavedRevision(0);
      setEncrypted(nextEncrypted);
      baselineByMember.current.clear();
      const nextBaselines = new Map<string, string>();
      historyReady.current = Promise.all(
        next.diagrams.map(async (member) => {
          const historyId = embeddedMemberHistoryId(next.projectId, member.id);
          if (nextEncrypted) await enableMemoryOnlyHistory(historyId);
          const mapped = mapPortableHistoryToLocal(
            member.document.versions,
            await reconstructContents(member.document.contents),
            member.name,
            member.document.current.baselineVersionId,
            undefined,
            {
              historyId,
              versionId: (portableId) => embeddedMemberVersionId(next.projectId, member.id, portableId),
            },
          );
          if (mapped.baselineVersionId) nextBaselines.set(member.id, mapped.baselineVersionId);
          await importDocumentVersions(mapped.versions);
        }),
      )
        .then(() => {
          if (projectGeneration.current === generation) baselineByMember.current = nextBaselines;
        })
        .catch(() => undefined);
      setProject(next);
    },
    [tabs.documents],
  );

  useEffect(() => {
    if (!project) return;
    memberTabs.current = new Map([...memberTabs.current, ...embeddedMemberTabs(project, tabs.documents)]);
    const byId = new Map(tabs.documents.map((tab) => [tab.id, tab]));
    let changed = false;
    for (const member of project.diagrams) {
      const tab = byId.get(memberTabs.current.get(member.id) ?? "");
      if (!tab) continue;
      const state = persistentTabState(tab);
      if (persistentStateByMember.current.get(member.id) === state) continue;
      persistentStateByMember.current.set(member.id, state);
      changed = true;
    }
    // The live tabs are the source of truth until an explicit save snapshot.  Updating
    // project state here used to feed the new state back into this effect and could
    // repeatedly re-index a project immediately after adding its first diagram.
    if (changed) {
      revisionRef.current += 1;
      setRevision(revisionRef.current);
    }
  }, [project, tabs.documents]);

  const effectiveProject = useMemo(
    () => (project ? projectWithOpenTabSources(project, memberTabs.current, tabs.documents) : undefined),
    [project, tabs.documents],
  );

  useEffect(() => {
    if (!project) return;
    const revision = ++recoveryRevision.current;
    void historyReady.current
      .then(() => snapshotEmbeddedProject(project, memberTabs.current, tabs.documents))
      .then((snapshot) => {
        if (recoveryRevision.current === revision) return saveEmbeddedProjectRecovery(snapshot, encrypted);
      })
      .catch(() => {
        // Recovery is a convenience; saving the actual project remains available if browser storage is full.
      });
  }, [encrypted, project, tabs.documents]);

  const restoreProject = useCallback(async () => {
    const recovery = await loadEmbeddedProjectRecovery();
    if (!recovery || recovery.state === "locked") return recovery;
    openProject(recovery.project);
    return recovery;
  }, [openProject]);

  const updateProject = useCallback((update: (current: PortableProject) => PortableProject) => {
    setProject((current) => (current ? update(current) : current));
    revisionRef.current += 1;
    setRevision(revisionRef.current);
  }, []);

  /**
   * Apply bookkeeping the app derives from the diagrams themselves (e.g. registering indexed
   * declarations as project elements) without treating it as an unsaved user change. The
   * index resolves asynchronously after a diagram is added or opened, so it can land after a
   * save completed; flagging that as dirty would tell the user their just-saved project has
   * unsaved changes. The derived state is idempotent and is written by the next real save.
   */
  const updateDerivedProject = useCallback((update: (current: PortableProject) => PortableProject) => {
    setProject((current) => (current ? update(current) : current));
  }, []);

  const openMember = useCallback(
    async (memberId: string) => {
      if (!project) return undefined;
      await historyReady.current;
      const member = project.diagrams.find((item) => item.id === memberId);
      const wbsGantt = member?.wbsGantt;
      const wbsTabId = wbsGantt
        ? openEmbeddedMember(
            project,
            wbsGantt.wbsDiagramId,
            tabs,
            memberTabs.current,
            encrypted,
            baselineByMember.current.get(wbsGantt.wbsDiagramId),
          )
        : undefined;
      const tabId = openEmbeddedMember(
        project,
        memberId,
        tabs,
        memberTabs.current,
        encrypted,
        baselineByMember.current.get(memberId),
      );
      if (tabId && wbsGantt && wbsTabId) {
        tabs.updateDocumentFormat?.(tabId, {
          linkedWbsDocumentId: wbsTabId,
          wbsGanttLinks: wbsGantt.links,
          wbsGanttDependencies: wbsGantt.dependencies,
        });
      }
      return tabId;
    },
    [encrypted, project, tabs],
  );

  const addDiagram = useCallback(
    (diagram: PortableProjectDiagram) => {
      const current = projectRef.current;
      if (!current) return undefined;
      const next = {
        ...current,
        revisionId: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        diagrams: [...current.diagrams, diagram],
      };
      const tabId = openEmbeddedMember(next, diagram.id, tabs, memberTabs.current, encrypted);
      persistentStateByMember.current.set(
        diagram.id,
        persistentTabState({
          source: diagram.document.current.source,
          baselineVersionId: diagram.document.current.baselineVersionId,
          historyMaxVersions: diagram.document.historyPolicy.maxVersions,
          historyMaxLogicalBytes: diagram.document.historyPolicy.maxLogicalBytes,
          resourceCapacities: diagram.document.settings.resourceCapacities,
        }),
      );
      revisionRef.current += 1;
      setRevision(revisionRef.current);
      setProject(next);
      return tabId;
    },
    [encrypted, tabs],
  );

  const renameDiagram = useCallback((memberId: string, name: string) => {
    const value = name.trim();
    if (!value) return false;
    const current = projectRef.current;
    if (!current?.diagrams.some((diagram) => diagram.id === memberId)) return false;
    revisionRef.current += 1;
    setRevision(revisionRef.current);
    setProject({
      ...current,
      revisionId: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      diagrams: current.diagrams.map((diagram) => (diagram.id === memberId ? { ...diagram, name: value } : diagram)),
    });
    return true;
  }, []);

  const deleteDiagram = useCallback(
    (memberId: string) => {
      const current = projectRef.current;
      if (!current) return false;
      const removed = current.diagrams.find((diagram) => diagram.id === memberId);
      if (!removed) return false;
      const removedElementIds = new Set(
        current.elements.filter((element) => element.documentId === memberId).map((element) => element.id),
      );
      const tabId = memberTabs.current.get(memberId);
      if (tabId) tabs.closeDocument?.(tabId);
      memberTabs.current.delete(memberId);
      persistentStateByMember.current.delete(memberId);
      revisionRef.current += 1;
      setRevision(revisionRef.current);
      setProject({
        ...current,
        revisionId: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        diagrams: current.diagrams.filter((diagram) => diagram.id !== memberId),
        elements: current.elements.filter((element) => !removedElementIds.has(element.id)),
        links: current.links.filter((link) => !removedElementIds.has(link.from) && !removedElementIds.has(link.to)),
      });
      return true;
    },
    [tabs],
  );

  const snapshot = useCallback(
    async (savedAt?: string) => {
      if (!project) return undefined;
      await historyReady.current;
      const next = await snapshotEmbeddedProject(project, memberTabs.current, tabs.documents, savedAt);
      setProject(next);
      return next;
    },
    [project, tabs.documents],
  );

  const captureSaveSnapshot = useCallback(async () => {
    const current = projectRef.current;
    if (!current) return undefined;
    const revision = revisionRef.current;
    await historyReady.current;
    memberTabs.current = new Map([...memberTabs.current, ...embeddedMemberTabs(current, tabs.documents)]);
    return {
      projectId: current.projectId,
      revision,
      project: await snapshotEmbeddedProject(current, memberTabs.current, tabs.documents),
    };
  }, [tabs.documents]);

  const markSaved = useCallback((revision: number) => setSavedRevision(revision), []);
  const currentRevision = useCallback(() => revisionRef.current, []);

  const closeProject = useCallback(() => {
    projectGeneration.current += 1;
    recoveryRevision.current += 1;
    memberTabs.current.clear();
    setEncrypted(false);
    setProject(undefined);
    void clearEmbeddedProjectRecovery();
  }, []);

  return {
    project,
    effectiveProject,
    encrypted,
    openProject,
    restoreProject,
    openMember,
    addDiagram,
    renameDiagram,
    deleteDiagram,
    snapshot,
    updateProject,
    updateDerivedProject,
    captureSaveSnapshot,
    currentRevision,
    markSaved,
    dirty: Boolean(project) && revision !== savedRevision,
    closeProject,
  };
}
