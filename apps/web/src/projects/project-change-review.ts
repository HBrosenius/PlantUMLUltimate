import type { PortableProject, PortableProjectDiagram, PortableProjectLink } from "@plantuml-studio/document-format";
import { reverseImpact } from "@plantuml-studio/project-model";
import { buildReviewGroups, createUnifiedPatch } from "../semantic-review";
import { diffVersionSources } from "../version-diff";

export type DiagramChangeKind = "added" | "deleted" | "renamed" | "source" | "history" | "settings";

export interface ProjectDiagramChange {
  documentId: string;
  name: string;
  previousName?: string;
  kinds: readonly DiagramChangeKind[];
  linkedDocumentIds: readonly string[];
  sourceComparison?: {
    mode: "semantic" | "source";
    addedLines: number;
    removedLines: number;
    patch: string;
    summaries: readonly { title: string; detail: string; confidence: "confirmed" | "probable" | "unclassified" }[];
  };
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
  const sourceComparison = kinds.includes("source")
    ? (() => {
        const diff = diffVersionSources(before.document.current.source, after.document.current.source);
        const semantic =
          after.document.current.diagramKind === "gantt" ||
          after.document.current.diagramKind === "sequence" ||
          after.document.current.diagramKind === "component";
        return {
          mode: semantic ? ("semantic" as const) : ("source" as const),
          addedLines: diff.filter((line) => line.kind === "added").length,
          removedLines: diff.filter((line) => line.kind === "removed").length,
          patch: createUnifiedPatch(after.name, before.document.current.source, after.document.current.source),
          summaries: semantic
            ? buildReviewGroups(
                before.document.current.source,
                after.document.current.source,
                after.document.current.diagramKind,
              ).map(({ title, detail, confidence }) => ({ title, detail, confidence }))
            : [],
        };
      })()
    : undefined;
  return {
    documentId: after.id,
    name: after.name,
    ...(before.name !== after.name ? { previousName: before.name } : {}),
    kinds,
    linkedDocumentIds: linkedDocuments(current, after.id),
    ...(sourceComparison ? { sourceComparison } : {}),
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

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function createProjectReviewReport(
  projectName: string,
  review: ProjectChangeReview,
  documentNames: ReadonlyMap<string, string>,
  generatedAt = new Date().toISOString(),
): string {
  const diagrams = review.diagrams
    .map((change) => {
      const summaries = change.sourceComparison?.summaries
        .map(
          (summary) =>
            `<li><strong>${escapeHtml(summary.title)}</strong> <span>(${summary.confidence})</span><br>${escapeHtml(summary.detail)}</li>`,
        )
        .join("");
      const impact = change.linkedDocumentIds
        .map((id) => `<li>${escapeHtml(documentNames.get(id) ?? id)}</li>`)
        .join("");
      return [
        "<article>",
        `<h3>${escapeHtml(change.name)}</h3>`,
        change.previousName ? `<p>Previously: ${escapeHtml(change.previousName)}</p>` : "",
        `<p class="kinds">${change.kinds.map(escapeHtml).join(" · ")}</p>`,
        summaries ? `<h4>Semantic changes</h4><ul>${summaries}</ul>` : "",
        impact ? `<h4>Linked diagrams that may need review</h4><ul>${impact}</ul>` : "",
        change.sourceComparison ? `<h4>Source patch</h4><pre>${escapeHtml(change.sourceComparison.patch)}</pre>` : "",
        "</article>",
      ].join("\n");
    })
    .join("\n");
  const links = review.links
    .map((change) => {
      const names = change.documentIds.map((id) => documentNames.get(id) ?? id).join(" ↔ ");
      return `<li><strong>${escapeHtml(change.kind)} ${escapeHtml(change.link.kind)} relationship</strong><br>${escapeHtml(names)}</li>`;
    })
    .join("");
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer">',
    `<meta name="generator" content="PlantUML Ultimate"><title>${escapeHtml(projectName)} change review</title>`,
    "<style>body{font:15px system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 24px;color:#172033}article{border:1px solid #d8dee9;border-radius:8px;padding:16px;margin:14px 0}h1,h2,h3,h4{margin:.4em 0}.meta,.kinds,span{color:#5d687c}pre{overflow:auto;background:#f4f6f8;padding:12px;border-radius:6px}li{margin:.4em 0}</style></head><body>",
    `<h1>${escapeHtml(projectName)} change review</h1>`,
    `<p class="meta">Generated locally ${escapeHtml(generatedAt)} · ${review.diagrams.length} diagram change${review.diagrams.length === 1 ? "" : "s"} · ${review.links.length} relationship change${review.links.length === 1 ? "" : "s"}</p>`,
    review.hasChanges ? "" : "<p>No changes since the last successful save.</p>",
    diagrams ? `<h2>Diagrams</h2>${diagrams}` : "",
    links ? `<h2>Relationships</h2><ul>${links}</ul>` : "",
    "</body></html>",
  ].join("\n");
}
