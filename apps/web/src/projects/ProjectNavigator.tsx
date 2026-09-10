import type { VirtualProject } from "./project-index";

export function ProjectNavigator({
  project,
  onOpen,
  onClose,
}: {
  project: VirtualProject;
  onOpen(documentId: string): void;
  onClose(): void;
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
    </aside>
  );
}
