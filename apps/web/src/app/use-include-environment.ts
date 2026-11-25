import { useEffect, useRef } from "react";
import type { PortableProject } from "@plantuml-studio/document-format";
import { embeddedMemberHistoryId } from "../projects/embedded-project";
import type { ProjectDirectoryHandle } from "../projects/folder-project";
import { originProvider, originServer, type GitOrigin } from "../features/git/git-origin";
import { providerForTarget, targetOfOrigin } from "../features/git/git-hosts";
import { GitProviderError } from "../features/git/git-provider";
import { detectDiagramKind } from "../diagram-kind";
import {
  hashText,
  notifyIncludeEnvironment,
  setIncludeEnvironment,
  type IncludeEnvironment,
} from "../render/include-environment";
import { setIncludeActions } from "../render/include-state";
import type { IncludeContext, IncludeFileScope } from "../render/includes";
import type { DiagramKind } from "../model";
import type { DocumentSnapshot } from "../workspace-storage";

/**
 * Tells the renderer where the includes of each open diagram can come from (see `render/include-environment`):
 * the other diagrams of the same `.pumlu` document, or the repository or folder the file was opened from.
 * The tab list is read from the live render, so an edit to another diagram is seen by the next render of the
 * diagram that includes it. Documents, Git files and folder files are only ever read, never written, and
 * included Git text stays in the render's in-memory cache.
 */
let liveTabs: readonly DocumentSnapshot[] = [];

/** Call right after the tab list is created, before anything renders a diagram. */
export function useIncludeTabs(documents: readonly DocumentSnapshot[]): void {
  liveTabs = documents;
}

interface ProjectLike {
  manifest?: { name: string; documents: ReadonlyArray<{ path: string }> };
  root?: ProjectDirectoryHandle;
  archiveEntries?: ReadonlyMap<string, Uint8Array>;
}

export interface IncludeEnvironmentInputs {
  portable: PortableProject | undefined;
  /** The folder or ZIP document (a `.pumlu` document is `portable`). */
  project: ProjectLike | undefined;
  isProjectMemberTab(id: string): boolean;
  activeTab: DocumentSnapshot;
  addProjectDiagram(kind: DiagramKind, name: string, initialSource?: string): Promise<boolean>;
  openMember(memberId: string): unknown;
  notify(message: string): void;
}

const nameKey = (name: string) =>
  name
    .trim()
    .replace(/\.(?:puml|plantuml|pumlu|pu|iuml|wsd)$/i, "")
    .toLowerCase();

/** A path inside a folder document, read through the folder access the document was opened with. */
async function readFolderFile(root: ProjectDirectoryHandle, path: string): Promise<string> {
  const segments = path.split("/");
  try {
    let directory = root;
    for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment);
    const file = await (await directory.getFileHandle(segments.at(-1)!)).getFile();
    if (file.size > 1_000_000) throw new Error(`${path} is larger than 1 MB.`);
    return await file.text();
  } catch (error) {
    if (error instanceof Error && error.message.endsWith("is larger than 1 MB.")) throw error;
    throw new Error(`${path} wasn't found in the folder.`, { cause: error });
  }
}

function repositoryScope(origin: GitOrigin): IncludeFileScope {
  const server = originServer(origin);
  return {
    kind: "repository",
    scope: `git:${originProvider(origin)}:${server}/${origin.owner}/${origin.repo}@${origin.ref}`,
    path: origin.path,
    description: `${origin.owner}/${origin.repo} at ${origin.ref}`,
    async read(path) {
      try {
        // The same client, token and server checks as Open from GitHub or GitLab: only the origin's own host.
        const provider = await providerForTarget(targetOfOrigin(origin));
        return (await provider.getFile(origin.owner, origin.repo, origin.ref, path)).content;
      } catch (error) {
        throw new Error(
          error instanceof GitProviderError
            ? `${path}: ${error.message}`
            : `${path} could not be read from the repository.`,
          { cause: error },
        );
      }
    },
  };
}

function buildContext(inputs: IncludeEnvironmentInputs, documentId: string): IncludeContext | undefined {
  const tab = liveTabs.find((item) => item.id === documentId);
  const { portable, project } = inputs;
  // A diagram of the open document, by its tab or by its member id (the snapshot renders members that way).
  const member = portable?.diagrams.find((item) =>
    tab ? tab.historyId === embeddedMemberHistoryId(portable.projectId, item.id) : item.id === documentId,
  );
  if (portable && member) {
    const byHistory = new Map(liveTabs.map((item) => [item.historyId, item]));
    return {
      name: member.name,
      documents: portable.diagrams.map((item) => ({
        name: item.name,
        source:
          byHistory.get(embeddedMemberHistoryId(portable.projectId, item.id))?.source ?? item.document.current.source,
      })),
    };
  }
  if (!tab) return undefined;
  if (tab.githubOrigin) return { files: repositoryScope(tab.githubOrigin) };
  if (project && inputs.isProjectMemberTab(documentId) && (project.root || project.archiveEntries)) {
    const members = project.manifest?.documents ?? [];
    const open = new Map(
      liveTabs.filter((item) => inputs.isProjectMemberTab(item.id)).map((item) => [item.fileName, item]),
    );
    // Another member edited in its tab is read from the tab; other files from the folder or archive.
    const version = hashText(
      members.map((member) => `${member.path}\u0000${open.get(member.path)?.source ?? ""}`).join("\u0001"),
    );
    const text = (path: string) => open.get(path)?.source;
    const root = project.root;
    const entries = project.archiveEntries;
    return {
      files: {
        kind: "folder",
        scope: `folder:${project.manifest?.name ?? "document"}`,
        path: tab.fileName,
        description: project.manifest?.name ?? "the folder",
        version,
        async read(path) {
          const edited = text(path);
          if (edited !== undefined) return edited;
          if (root) return readFolderFile(root, path);
          const bytes = entries?.get(path);
          if (!bytes) throw new Error(`${path} wasn't found in the document.`);
          return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        },
      },
    };
  }
  return undefined;
}

const starterBody = "@startuml\n' Shared by the diagrams that include it\nskinparam shadowing false\n@enduml";

export function useIncludeEnvironment(inputs: IncludeEnvironmentInputs): void {
  const latest = useRef(inputs);
  latest.current = inputs;
  useEffect(() => {
    const environment: IncludeEnvironment = { contextFor: (documentId) => buildContext(latest.current, documentId) };
    setIncludeEnvironment(environment);
    setIncludeActions({
      get canAddDiagram() {
        const { portable, activeTab } = latest.current;
        return Boolean(portable && activeTab.historyId.startsWith(`project-history-${portable.projectId}-`));
      },
      addDiagram(name) {
        const { activeTab, addProjectDiagram, notify } = latest.current;
        const kind: DiagramKind = detectDiagramKind(activeTab.source) ?? activeTab.diagramKind;
        void addProjectDiagram(kind, name, starterBody).then((added) => {
          if (added) notify(`Added ${name} to the document. Include it by name; save the document to keep it.`);
        });
      },
      openDiagram(name) {
        const { portable, openMember } = latest.current;
        const member = portable?.diagrams.find((item) => nameKey(item.name) === nameKey(name));
        if (!member) return false;
        void openMember(member.id);
        return true;
      },
      notify: (message) => latest.current.notify(message),
    });
    notifyIncludeEnvironment();
    return () => {
      setIncludeEnvironment(undefined);
      setIncludeActions(undefined);
    };
  }, []);
  // What an include can reach changed: a document or folder opened, a diagram added, renamed or closed.
  const signature = JSON.stringify([
    inputs.portable?.projectId,
    inputs.portable?.diagrams.map((item) => item.name),
    inputs.project?.manifest?.name,
    inputs.project?.manifest?.documents.map((item) => item.path),
    liveTabs.map((tab) => [tab.id, tab.historyId, tab.fileName, tab.githubOrigin?.ref, tab.githubOrigin?.path]),
  ]);
  useEffect(() => {
    notifyIncludeEnvironment();
  }, [signature]);
}
