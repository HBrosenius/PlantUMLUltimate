import { useCallback, useRef, useState } from "react";
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

  const openProject = useCallback(
    (next: PortableProject) => {
      memberTabs.current = new Map(embeddedMemberTabs(next, tabs.documents));
      setProject(next);
    },
    [tabs.documents],
  );

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

  const closeProject = useCallback(() => {
    memberTabs.current.clear();
    setProject(undefined);
  }, []);

  return { project, openProject, openMember, snapshot, closeProject };
}
