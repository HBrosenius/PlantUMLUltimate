import type { ProjectElement, ProjectLink } from "@plantuml-studio/project-model";
import type { VirtualProject } from "./project-index";
import { ProjectLinksPanel } from "./ProjectLinksPanel";

export function ProjectNavigator({
  project,
  onOpen,
  onAdd,
  onClose,
  onLinksChange,
  onElementsChange,
}: {
  project: VirtualProject;
  onOpen(documentId: string): void;
  onAdd(): void;
  onClose(): void;
  onLinksChange(links: readonly ProjectLink[]): void;
  onElementsChange(elements: readonly ProjectElement[]): void;
}) {
  return (
    <aside className="project-navigator" aria-label="Project navigator">
      <header>
        <div>
          <strong>{project.manifest.name}</strong>
          <small>{project.members.length} diagrams</small>
        </div>
        <button type="button" onClick={onClose} aria-label="Close project navigator">
          ×
        </button>
      </header>
      <button type="button" className="project-add-diagram" onClick={onAdd}>
        Add diagram…
      </button>
      <ul>
        {project.members.map((member) => (
          <li key={member.documentId}>
            <button type="button" disabled={member.state !== "available"} onClick={() => onOpen(member.documentId)}>
              <span>{member.path}</span>
              <small>
                {member.state === "available"
                  ? `${member.diagramKind} · ${member.linkCount} links`
                  : (member.reason ?? member.state)}
              </small>
            </button>
          </li>
        ))}
      </ul>
      <ProjectLinksPanel
        project={project}
        onChange={onLinksChange}
        onElementsChange={onElementsChange}
        onOpenDocument={onOpen}
      />
    </aside>
  );
}
