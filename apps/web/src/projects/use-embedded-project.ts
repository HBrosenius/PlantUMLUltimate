import { useCallback, useEffect, useRef, useState } from "react";
import type { PortableProject, PortableProjectDiagram } from "@plantuml-studio/document-format";
import {
  embeddedMemberHistoryId,
  embeddedMemberTabs,
  openEmbeddedMember,
  snapshotEmbeddedProject,
  type EmbeddedProjectTabs,
} from "./embedded-project";
import {
  clearEmbeddedProjectRecovery,
  loadEmbeddedProjectRecovery,
  saveEmbeddedProjectRecovery,
} from "./embedded-project-session";
import { enableMemoryOnlyHistory } from "../workspace-storage";

/** Owns one embedded project snapshot and the transient tabs used to view its members. */
export function useEmbeddedProject(tabs: EmbeddedProjectTabs) {
  const [project, setProject] = useState<PortableProject>();
  const [encrypted, setEncrypted] = useState(false);
  const memberTabs = useRef(new Map<string, string>());
  const projectRef = useRef(project);
  projectRef.current = project;
  const revisionRef = useRef(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const sourceByMember = useRef(new Map<string, string>());

  const openProject = useCallback(
    (next: PortableProject, options: { encrypted?: boolean } = {}) => {
      const nextEncrypted = options.encrypted ?? false;
      memberTabs.current = new Map(embeddedMemberTabs(next, tabs.documents));
      sourceByMember.current = new Map(next.diagrams.map((member) => [member.id, member.document.current.source]));
      revisionRef.current = 0;
      setSavedRevision(0);
      setEncrypted(nextEncrypted);
      if (nextEncrypted) {
        for (const member of next.diagrams)
          void enableMemoryOnlyHistory(embeddedMemberHistoryId(next.projectId, member.id));
      }
      setProject(next);
    },
    [tabs.documents],
  );

  useEffect(() => {
    if (!project) return;
    const byId = new Map(tabs.documents.map((tab) => [tab.id, tab]));
    let changed = false;
    for (const member of project.diagrams) {
      const source = byId.get(memberTabs.current.get(member.id) ?? "")?.source;
      if (source === undefined || sourceByMember.current.get(member.id) === source) continue;
      sourceByMember.current.set(member.id, source);
      changed = true;
    }
    if (!changed) return;
    revisionRef.current += 1;
    void snapshotEmbeddedProject(project, memberTabs.current, tabs.documents).then((next) => {
      setProject((current) => (current === project ? next : current));
    });
  }, [project, tabs.documents]);

  useEffect(() => {
    if (!project) return;
    void saveEmbeddedProjectRecovery(project, encrypted).catch(() => {
      // Recovery is a convenience; saving the actual project remains available if browser storage is full.
    });
  }, [encrypted, project]);

  const restoreProject = useCallback(async () => {
    const recovery = await loadEmbeddedProjectRecovery();
    if (!recovery || recovery.state === "locked") return recovery;
    openProject(recovery.project);
    return recovery;
  }, [openProject]);

  const updateProject = useCallback((update: (current: PortableProject) => PortableProject) => {
    setProject((current) => (current ? update(current) : current));
    revisionRef.current += 1;
  }, []);

  const openMember = useCallback(
    (memberId: string) => {
      if (!project) return undefined;
      return openEmbeddedMember(project, memberId, tabs, memberTabs.current, encrypted);
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
      sourceByMember.current.set(diagram.id, diagram.document.current.source);
      revisionRef.current += 1;
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
      sourceByMember.current.delete(memberId);
      revisionRef.current += 1;
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
    return {
      projectId: current.projectId,
      revision,
      project: await snapshotEmbeddedProject(current, memberTabs.current, tabs.documents),
    };
  }, [tabs.documents]);

  const markSaved = useCallback((revision: number) => setSavedRevision(revision), []);

  const closeProject = useCallback(() => {
    memberTabs.current.clear();
    setEncrypted(false);
    setProject(undefined);
    void clearEmbeddedProjectRecovery();
  }, []);

  return {
    project,
    encrypted,
    openProject,
    restoreProject,
    openMember,
    addDiagram,
    renameDiagram,
    deleteDiagram,
    snapshot,
    updateProject,
    captureSaveSnapshot,
    markSaved,
    dirty: Boolean(project) && revisionRef.current !== savedRevision,
    closeProject,
  };
}
