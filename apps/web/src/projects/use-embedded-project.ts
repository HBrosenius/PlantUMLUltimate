import type { DiagramKind } from "../model";
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
import { enableMemoryOnlyHistory, importDocumentVersions, type DocumentSnapshot } from "../workspace-storage";

function persistentTabState(tab: {
  reportingHistory?: DocumentSnapshot["reportingHistory"];
  deliveryScenarios?: DocumentSnapshot["deliveryScenarios"];
  source: string;
  baselineVersionId?: string | undefined;
  historyMaxVersions?: number | undefined;
  historyMaxLogicalBytes?: number | undefined;
  resourceCapacities?: Record<string, number> | undefined;
  progressForecast?:
    { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string } | undefined;
  wbsGanttLinks?: Array<{ wbsAlias: string; ganttAlias: string }> | undefined;
  wbsGanttDependencies?: Array<{ from: string; to: string }> | undefined;
}): string {
  return JSON.stringify([
    tab.source,
    tab.baselineVersionId,
    tab.historyMaxVersions,
    tab.historyMaxLogicalBytes,
    Object.entries(tab.resourceCapacities ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    tab.progressForecast,
    tab.reportingHistory,
    tab.deliveryScenarios ?? [],
    tab.wbsGanttLinks,
    tab.wbsGanttDependencies,
  ]);
}

export type ProjectRecoveryStatus = "idle" | "saving" | "current" | "error" | "disabled";

/** Owns one embedded project snapshot and the transient tabs used to view its members. */
export function useEmbeddedProject(tabs: EmbeddedProjectTabs) {
  const [project, setProject] = useState<PortableProject>();
  const [encrypted, setEncrypted] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<ProjectRecoveryStatus>("idle");
  const memberTabs = useRef(new Map<string, string>());
  // Closing a view must not discard the member's current source or persistent settings.
  const retainedMemberTabs = useRef(new Map<string, DocumentSnapshot>());
  const projectRef = useRef(project);
  projectRef.current = project;
  const revisionRef = useRef(0);
  const [revision, setRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const persistentStateByMember = useRef(new Map<string, string>());
  const recoveryRevision = useRef(0);
  const historyReady = useRef(Promise.resolve());
  const restoreMemberHistory = useRef<(memberId: string) => Promise<void>>(async () => undefined);
  const baselineByMember = useRef(new Map<string, string>());
  const projectGeneration = useRef(0);

  const openProject = useCallback(
    (next: PortableProject, options: { encrypted?: boolean; unsaved?: boolean } = {}) => {
      next = {
        ...next,
        diagrams: next.diagrams.map((diagram) => ({ ...diagram, name: embeddedDiagramDisplayName(diagram.name) })),
      };
      const generation = ++projectGeneration.current;
      retainedMemberTabs.current.clear();
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
            reportingHistory: member.document.settings.reportingHistory,
            progressForecast: member.document.settings.progressForecast,
            deliveryScenarios: member.document.settings.deliveryScenarios ?? [],
            wbsGanttLinks: member.wbsGantt?.links,
            wbsGanttDependencies: member.wbsGantt?.dependencies,
          }),
        ]),
      );
      revisionRef.current = 0;
      setRevision(0);
      setSavedRevision(options.unsaved ? -1 : 0);
      recoveryRevision.current += 1;
      setRecoveryStatus(nextEncrypted ? "disabled" : "saving");
      setEncrypted(nextEncrypted);
      baselineByMember.current.clear();
      historyReady.current = Promise.resolve();
      const histories = new Map<string, Promise<void>>();
      restoreMemberHistory.current = (memberId) => {
        const existing = histories.get(memberId);
        if (existing) return existing;
        const member = next.diagrams.find((diagram) => diagram.id === memberId);
        if (!member) return Promise.resolve();
        const ready = (async () => {
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
          await importDocumentVersions(mapped.versions);
          if (projectGeneration.current === generation && mapped.baselineVersionId)
            baselineByMember.current.set(member.id, mapped.baselineVersionId);
        })().catch(() => undefined);
        histories.set(memberId, ready);
        historyReady.current = Promise.all([historyReady.current, ready]).then(() => undefined);
        return ready;
      };
      // Unopened members retain their complete portable history in the project snapshot.
      // Import only histories needed by existing/opened tabs. Encrypted projects still
      // eagerly clear persisted history and establish memory-only storage for every member.
      const initialMembers = nextEncrypted ? next.diagrams.map((member) => member.id) : [...memberTabs.current.keys()];
      initialMembers.forEach((memberId) => {
        void restoreMemberHistory.current(memberId);
      });
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
      retainedMemberTabs.current.set(member.id, tab);
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
    () =>
      project
        ? projectWithOpenTabSources(project, memberTabs.current, [
            ...retainedMemberTabs.current.values(),
            ...tabs.documents,
          ])
        : undefined,
    [project, tabs.documents],
  );

  useEffect(() => {
    if (!project) return;
    const revision = ++recoveryRevision.current;
    setRecoveryStatus(encrypted ? "disabled" : "saving");
    void historyReady.current
      .then(() =>
        snapshotEmbeddedProject(project, memberTabs.current, [
          ...retainedMemberTabs.current.values(),
          ...tabs.documents,
        ]),
      )
      .then((snapshot) => {
        if (recoveryRevision.current === revision) return saveEmbeddedProjectRecovery(snapshot, encrypted);
      })
      .then(() => {
        if (recoveryRevision.current === revision) setRecoveryStatus(encrypted ? "disabled" : "current");
      })
      .catch(() => {
        if (recoveryRevision.current === revision) setRecoveryStatus(encrypted ? "disabled" : "error");
      });
  }, [encrypted, project, tabs.documents]);

  const restoreProject = useCallback(async () => {
    const generation = projectGeneration.current;
    const recovery = await loadEmbeddedProjectRecovery();
    if (projectGeneration.current !== generation) return undefined;
    if (!recovery || recovery.state === "locked") return recovery;
    openProject(recovery.project, { unsaved: true });
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
      const generation = projectGeneration.current;
      const linkedWbsId = project.diagrams.find((member) => member.id === memberId)?.wbsGantt?.wbsDiagramId;
      await Promise.all(
        [memberId, ...(linkedWbsId ? [linkedWbsId] : [])].map((id) => restoreMemberHistory.current(id)),
      );
      const latest = projectRef.current;
      if (projectGeneration.current !== generation || !latest?.diagrams.some((member) => member.id === memberId))
        return undefined;
      const current = projectWithOpenTabSources(latest, memberTabs.current, [
        ...retainedMemberTabs.current.values(),
        ...tabs.documents,
      ]);
      const member = current.diagrams.find((item) => item.id === memberId);
      const wbsGantt = member?.wbsGantt;
      const wbsTabId = wbsGantt
        ? openEmbeddedMember(
            current,
            wbsGantt.wbsDiagramId,
            tabs,
            memberTabs.current,
            encrypted,
            retainedMemberTabs.current.has(wbsGantt.wbsDiagramId)
              ? retainedMemberTabs.current.get(wbsGantt.wbsDiagramId)?.baselineVersionId
              : baselineByMember.current.get(wbsGantt.wbsDiagramId),
          )
        : undefined;
      const tabId = openEmbeddedMember(
        current,
        memberId,
        tabs,
        memberTabs.current,
        encrypted,
        retainedMemberTabs.current.has(memberId)
          ? retainedMemberTabs.current.get(memberId)?.baselineVersionId
          : baselineByMember.current.get(memberId),
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
          reportingHistory: diagram.document.settings.reportingHistory,
          progressForecast: diagram.document.settings.progressForecast,
          deliveryScenarios: diagram.document.settings.deliveryScenarios ?? [],
        }),
      );
      revisionRef.current += 1;
      setRevision(revisionRef.current);
      setProject(next);
      return tabId;
    },
    [encrypted, tabs],
  );

  const renameDiagram = useCallback(
    (memberId: string, name: string) => {
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
      const tabId = memberTabs.current.get(memberId);
      if (tabId) tabs.updateDocumentFormat?.(tabId, { fileName: value });
      return true;
    },
    [tabs],
  );

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
      retainedMemberTabs.current.delete(memberId);
      persistentStateByMember.current.delete(memberId);
      // A Gantt linked to the deleted WBS keeps working as a plain Gantt; a dangling link fails validation on save.
      const diagrams = current.diagrams
        .filter((diagram) => diagram.id !== memberId)
        .map((diagram) => {
          if (diagram.wbsGantt?.wbsDiagramId !== memberId) return diagram;
          const unlinked = { ...diagram };
          delete unlinked.wbsGantt;
          const ganttTabId = memberTabs.current.get(diagram.id);
          if (ganttTabId)
            tabs.updateDocumentFormat?.(ganttTabId, {
              linkedWbsDocumentId: undefined,
              wbsGanttLinks: undefined,
              wbsGanttDependencies: undefined,
            });
          return unlinked;
        });
      revisionRef.current += 1;
      setRevision(revisionRef.current);
      setProject({
        ...current,
        revisionId: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        diagrams,
        elements: current.elements.filter((element) => !removedElementIds.has(element.id)),
        links: current.links.filter((link) => !removedElementIds.has(link.from) && !removedElementIds.has(link.to)),
      });
      return true;
    },
    [tabs],
  );

  // Remote content updates existing tabs without activating them. A collaborator's navigation
  // must never change the diagram another participant is editing.
  const receiveProject = useCallback(
    (next: PortableProject) => {
      const current = projectRef.current;
      if (!current || current.projectId !== next.projectId) {
        openProject(next);
        const first = next.diagrams[0];
        const generation = projectGeneration.current;
        if (first)
          void restoreMemberHistory.current(first.id).then(() => {
            if (projectGeneration.current !== generation || projectRef.current?.projectId !== next.projectId) return;
            openEmbeddedMember(next, first.id, tabs, memberTabs.current, false, baselineByMember.current.get(first.id));
          });
        return false;
      }
      const nextIds = new Set(next.diagrams.map((diagram) => diagram.id));
      for (const diagram of current.diagrams) {
        if (nextIds.has(diagram.id)) continue;
        const tabId = memberTabs.current.get(diagram.id);
        if (tabId) tabs.closeDocument?.(tabId);
        memberTabs.current.delete(diagram.id);
        retainedMemberTabs.current.delete(diagram.id);
      }
      for (const diagram of next.diagrams) {
        const tabId = memberTabs.current.get(diagram.id);
        const retained = retainedMemberTabs.current.get(diagram.id);
        if (retained && (!tabId || !tabs.documents.some((tab) => tab.id === tabId))) {
          retainedMemberTabs.current.set(diagram.id, {
            ...retained,
            source: diagram.document.current.source,
            diagramKind: diagram.document.current.diagramKind as DiagramKind,
            fileName: diagram.name,
            dirty: true,
            resourceCapacities: diagram.document.settings.resourceCapacities,
            reportingHistory: diagram.document.settings.reportingHistory,
            progressForecast: diagram.document.settings.progressForecast,
            deliveryScenarios: diagram.document.settings.deliveryScenarios ?? [],
            historyMaxVersions: diagram.document.historyPolicy.maxVersions,
            historyMaxLogicalBytes: diagram.document.historyPolicy.maxLogicalBytes,
            wbsGanttLinks: diagram.wbsGantt?.links,
            wbsGanttDependencies: diagram.wbsGantt?.dependencies,
          });
        }
        if (!tabId || !tabs.documents.some((tab) => tab.id === tabId)) continue;
        tabs.updateDocumentFormat?.(tabId, {
          fileName: diagram.name,
          source: diagram.document.current.source,
          diagramKind: diagram.document.current.diagramKind as DiagramKind,
          dirty: true,
          resourceCapacities: diagram.document.settings.resourceCapacities,
          reportingHistory: diagram.document.settings.reportingHistory,
          progressForecast: diagram.document.settings.progressForecast,
          deliveryScenarios: diagram.document.settings.deliveryScenarios ?? [],
          historyMaxVersions: diagram.document.historyPolicy.maxVersions,
          historyMaxLogicalBytes: diagram.document.historyPolicy.maxLogicalBytes,
          linkedWbsDocumentId: diagram.wbsGantt ? memberTabs.current.get(diagram.wbsGantt.wbsDiagramId) : undefined,
          wbsGanttLinks: diagram.wbsGantt?.links,
          wbsGanttDependencies: diagram.wbsGantt?.dependencies,
        });
      }
      revisionRef.current += 1;
      setRevision(revisionRef.current);
      setProject(next);
      return true;
    },
    [openProject, tabs],
  );

  const snapshot = useCallback(
    async (savedAt?: string) => {
      if (!project) return undefined;
      await historyReady.current;
      const next = await snapshotEmbeddedProject(
        project,
        memberTabs.current,
        [...retainedMemberTabs.current.values(), ...tabs.documents],
        savedAt,
      );
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
      project: await snapshotEmbeddedProject(current, memberTabs.current, [
        ...retainedMemberTabs.current.values(),
        ...tabs.documents,
      ]),
    };
  }, [tabs.documents]);

  const markSaved = useCallback((revision: number) => setSavedRevision(revision), []);
  const currentRevision = useCallback(() => revisionRef.current, []);

  const closeProject = useCallback(() => {
    projectGeneration.current += 1;
    recoveryRevision.current += 1;
    memberTabs.current.clear();
    retainedMemberTabs.current.clear();
    restoreMemberHistory.current = async () => undefined;
    historyReady.current = Promise.resolve();
    setEncrypted(false);
    setRecoveryStatus("idle");
    setProject(undefined);
    void clearEmbeddedProjectRecovery();
  }, []);

  return {
    project,
    effectiveProject,
    receiveProject,
    encrypted,
    recoveryStatus,
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
