import { useCallback, useEffect, useRef, useState } from "react";
import type { PortableProject } from "@plantuml-studio/document-format";
import {
  embeddedMemberTabs,
  openEmbeddedMember,
  snapshotEmbeddedProject,
  type EmbeddedProjectTabs,
} from "./embedded-project";

/** Owns one embedded project snapshot and the transient tabs used to view its members. */
export function useEmbeddedProject(tabs: EmbeddedProjectTabs) {
  const [project, setProject] = useState<PortableProject>();
  const memberTabs = useRef(new Map<string, string>());
  const projectRef = useRef(project);
  projectRef.current = project;
  const revisionRef = useRef(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const sourceByMember = useRef(new Map<string, string>());

  const openProject = useCallback(
    (next: PortableProject) => {
      memberTabs.current = new Map(embeddedMemberTabs(next, tabs.documents));
      sourceByMember.current = new Map(next.diagrams.map((member) => [member.id, member.document.current.source]));
      revisionRef.current = 0;
      setSavedRevision(0);
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
    if (changed) revisionRef.current += 1;
  }, [project, tabs.documents]);

  const updateProject = useCallback((update: (current: PortableProject) => PortableProject) => {
    setProject((current) => (current ? update(current) : current));
    revisionRef.current += 1;
  }, []);

  const openMember = useCallback(
    (memberId: string) => {
      if (!project) return undefined;
      return openEmbeddedMember(project, memberId, tabs, memberTabs.current);
    },
    [project, tabs],
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
    setProject(undefined);
  }, []);

  return {
    project,
    openProject,
    openMember,
    snapshot,
    updateProject,
    captureSaveSnapshot,
    markSaved,
    dirty: Boolean(project) && revisionRef.current !== savedRevision,
    closeProject,
  };
}
