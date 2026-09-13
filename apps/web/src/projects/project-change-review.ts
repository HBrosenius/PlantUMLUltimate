import type { PortableProject, PortableProjectDiagram, PortableProjectLink } from "@plantuml-studio/document-format";
import { reverseImpact } from "@plantuml-studio/project-model";

export type DiagramChangeKind = "added" | "deleted" | "renamed" | "source" | "history" | "settings";

export interface ProjectDiagramChange {
  documentId: string;
  name: string;
  previousName?: string;
  kinds: readonly DiagramChangeKind[];
  linkedDocumentIds: readonly string[];
}

export interface ProjectLinkChange {
  linkId: string;
  kind: "added" | "deleted" | "changed";
  link: PortableProjectLink;
  previous?: PortableProjectLink;
  documentIds: readonly string[];
}

export interface ProjectChangeReview {
  diagrams: readonly ProjectDiagramChange[];
  links: readonly ProjectLinkChange[];
  hasChanges: boolean;
}

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function documentsForLink(project: PortableProject, link: PortableProjectLink): string[] {
  const elementDocuments = new Map(project.elements.map((element) => [element.id, element.documentId]));
  return [...new Set([elementDocuments.get(link.from), elementDocuments.get(link.to)].filter(Boolean) as string[])];
}

function linkedDocuments(project: PortableProject, documentId: string): string[] {
  const elements = project.elements.filter((element) => element.documentId === documentId);
  const elementDocuments = new Map(project.elements.map((element) => [element.id, element.documentId]));
  const result = new Set<string>();
  for (const element of elements) {
    const related = project.links.filter((link) => link.from === element.id || link.to === element.id);
    for (const link of related) {
      for (const id of [link.from, link.to]) {
        const linked = elementDocuments.get(id);
        if (linked && linked !== documentId) result.add(linked);
      }
    }
    for (const path of reverseImpact(project.links, element.id, 2).paths) {
      for (const id of path.elementIds) {
        const linked = elementDocuments.get(id);
        if (linked && linked !== documentId) result.add(linked);
      }
    }
  }
  return [...result];
}

function changedDiagram(
  before: PortableProjectDiagram,
  after: PortableProjectDiagram,
  current: PortableProject,
): ProjectDiagramChange | undefined {
  const kinds: DiagramChangeKind[] = [];
  if (before.name !== after.name) kinds.push("renamed");
  if (before.document.current.source !== after.document.current.source) kinds.push("source");
  if (
    !same(before.document.versions, after.document.versions) ||
    !same(before.document.contents, after.document.contents)
  )
    kinds.push("history");
  if (
    before.document.current.baselineVersionId !== after.document.current.baselineVersionId ||
    !same(before.document.settings, after.document.settings) ||
    !same(before.document.historyPolicy, after.document.historyPolicy)
  )
    kinds.push("settings");
  if (!kinds.length) return undefined;
  return {
    documentId: after.id,
    name: after.name,
    ...(before.name !== after.name ? { previousName: before.name } : {}),
    kinds,
    linkedDocumentIds: linkedDocuments(current, after.id),
  };
}

export function reviewProjectChanges(before: PortableProject, after: PortableProject): ProjectChangeReview {
  const beforeDiagrams = new Map(before.diagrams.map((diagram) => [diagram.id, diagram]));
  const afterDiagrams = new Map(after.diagrams.map((diagram) => [diagram.id, diagram]));
  const diagrams: ProjectDiagramChange[] = [];
  for (const diagram of after.diagrams) {
    const previous = beforeDiagrams.get(diagram.id);
    const change = previous
      ? changedDiagram(previous, diagram, after)
      : {
          documentId: diagram.id,
          name: diagram.name,
          kinds: ["added"] as const,
          linkedDocumentIds: linkedDocuments(after, diagram.id),
        };
    if (change) diagrams.push(change);
  }
  for (const diagram of before.diagrams) {
    if (!afterDiagrams.has(diagram.id))
      diagrams.push({ documentId: diagram.id, name: diagram.name, kinds: ["deleted"], linkedDocumentIds: [] });
  }

  const beforeLinks = new Map(before.links.map((link) => [link.id, link]));
  const afterLinks = new Map(after.links.map((link) => [link.id, link]));
  const links: ProjectLinkChange[] = [];
  for (const link of after.links) {
    const previous = beforeLinks.get(link.id);
    if (!previous) links.push({ linkId: link.id, kind: "added", link, documentIds: documentsForLink(after, link) });
    else if (!same(previous, link))
      links.push({ linkId: link.id, kind: "changed", link, previous, documentIds: documentsForLink(after, link) });
  }
  for (const link of before.links) {
    if (!afterLinks.has(link.id))
      links.push({ linkId: link.id, kind: "deleted", link, documentIds: documentsForLink(before, link) });
  }
  return { diagrams, links, hasChanges: diagrams.length > 0 || links.length > 0 };
}
