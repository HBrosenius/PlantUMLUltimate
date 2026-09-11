import type { ProjectElement, ProjectLink } from "@plantuml-studio/project-model";
import { useState } from "react";
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
  onAdd(kind: "gantt" | "class" | "sequence", path: string): void;
  onClose(): void;
  onLinksChange(links: readonly ProjectLink[]): void;
  onElementsChange(elements: readonly ProjectElement[]): void;
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"gantt" | "class" | "sequence">("gantt");
  const [path, setPath] = useState("diagrams/gantt.puml");
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
      <button type="button" className="project-add-diagram" onClick={() => setAdding((value) => !value)}>
        Add diagram…
      </button>
      {adding && (
        <form
          className="project-add-diagram-form"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd(kind, path);
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
                setPath(`diagrams/${next}.puml`);
              }}
            >
              <option value="gantt">Gantt</option>
              <option value="class">Class</option>
              <option value="sequence">Sequence</option>
            </select>
          </label>
          <label>
            Project file path
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
