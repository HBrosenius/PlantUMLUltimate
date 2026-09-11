import type { ProjectElement, ProjectLink } from "@plantuml-studio/project-model";
import { useState } from "react";
import type { VirtualProject } from "./project-index";
import { ProjectLinksPanel } from "./ProjectLinksPanel";

export function ProjectNavigator({
  project,
  onOpen,
  onAdd,
  onImport,
  onClose,
  onCloseProject,
  onLinksChange,
  onElementsChange,
  onRename,
  onDelete,
}: {
  project: VirtualProject;
  onOpen(documentId: string): void;
  onAdd(kind: "gantt" | "class" | "sequence", path: string): void | Promise<void>;
  onImport?(): void;
  onClose(): void;
  onCloseProject?(): void;
  onLinksChange(links: readonly ProjectLink[]): void;
  onElementsChange(elements: readonly ProjectElement[]): void;
  onRename?(documentId: string, name: string): void;
  onDelete?(documentId: string): void;
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"gantt" | "class" | "sequence">("gantt");
  const [path, setPath] = useState("Gantt diagram");
  return (
    <aside className="project-navigator" aria-label="Project navigator">
      <header>
        <div>
          <span className="project-navigator-kicker">Project</span>
          <strong>{project.manifest.name}</strong>
          <small>
            {project.members.length} diagram{project.members.length === 1 ? "" : "s"} · {project.manifest.links.length}{" "}
            connection
            {project.manifest.links.length === 1 ? "" : "s"}
          </small>
        </div>
        <button type="button" onClick={onClose} aria-label="Close project navigator">
          ×
        </button>
        {onCloseProject && (
          <button type="button" onClick={onCloseProject}>
            Close project
          </button>
        )}
      </header>
      <section className="project-navigator-section" aria-labelledby="project-diagrams-heading">
        <div className="project-section-heading">
          <div>
            <h2 id="project-diagrams-heading">Diagrams</h2>
            <p>Diagrams included in this project</p>
          </div>
          <button type="button" className="project-add-diagram" onClick={() => setAdding((value) => !value)}>
            Add diagram
          </button>
          {onImport && (
            <button type="button" onClick={onImport}>
              Import diagram
            </button>
          )}
        </div>
        {adding && (
          <form
            className="project-add-diagram-form"
            onSubmit={async (event) => {
              event.preventDefault();
              await onAdd(kind, path);
              setAdding(false);
            }}
          >
            <label>
              Diagram type
              <select
                value={kind}
                onChange={(event) => {
                  const next = event.target.value as "gantt" | "class" | "sequence";
                  setKind(next);
                  setPath(`${next[0]!.toUpperCase()}${next.slice(1)} diagram`);
                }}
              >
                <option value="gantt">Gantt</option>
                <option value="class">Class</option>
                <option value="sequence">Sequence</option>
              </select>
            </label>
            <label>
              Diagram name
              <input value={path} onChange={(event) => setPath(event.target.value)} required />
            </label>
            <div>
              <button type="submit">Add to project</button>
              <button type="button" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        <ul>
          {project.members.map((member) => (
            <li key={member.documentId}>
              <div>
                <button type="button" disabled={member.state !== "available"} onClick={() => onOpen(member.documentId)}>
                  <span>{member.path}</span>
                  <small>
                    {member.state === "available"
                      ? `${member.diagramKind} · ${member.linkCount} links`
                      : (member.reason ?? member.state)}
                  </small>
                </button>
                {onRename && (
                  <button
                    type="button"
                    aria-label={`Rename ${member.path}`}
                    onClick={() =>
                      onRename(member.documentId, window.prompt("Diagram name", member.path) ?? member.path)
                    }
                  >
                    Rename
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    aria-label={`Delete ${member.path}`}
                    onClick={() => onDelete(member.documentId)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <ProjectLinksPanel project={project} onChange={onLinksChange} onElementsChange={onElementsChange} />
    </aside>
  );
}
