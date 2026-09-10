import type { ProjectElement, ProjectLink, ProjectLinkKind } from "./types";

export function canCreateLink(
  kind: ProjectLinkKind,
  from: ProjectElement | undefined,
  to: ProjectElement | undefined,
): boolean {
  return kind === "represents"
    ? from?.kind === "sequence-participant" && to?.kind === "class-entity"
    : from?.kind === "gantt-task" && (to?.kind === "sequence-participant" || to?.kind === "class-entity");
}

export function hasLink(links: readonly ProjectLink[], kind: ProjectLinkKind, from: string, to: string): boolean {
  return links.some((link) => link.kind === kind && link.from === from && link.to === to);
}

export function backlinks(links: readonly ProjectLink[], elementId: string): readonly ProjectLink[] {
  return links.filter((link) => link.to === elementId);
}

export function outgoingLinks(links: readonly ProjectLink[], elementId: string): readonly ProjectLink[] {
  return links.filter((link) => link.from === elementId);
}
