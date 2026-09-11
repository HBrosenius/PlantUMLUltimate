import { hashSource } from "@plantuml-studio/document-format";
import { canCreateLink, type ProjectElement, type ProjectLink } from "@plantuml-studio/project-model";
import { useEffect, useMemo, useState } from "react";
import type { VirtualProject } from "./project-index";

function elementLabel(project: VirtualProject, elementId: string): string {
  const element = project.manifest.elements.find((item) => item.id === elementId);
  if (!element) return "Unknown element";
  const path = project.members.find((member) => member.documentId === element.documentId)?.path ?? element.documentId;
  const state = project.resolutions.get(elementId)?.state;
  return `${path}: ${element.locator.symbolKey}${state && state !== "resolved" ? ` (${state})` : ""}`;
}

export function ProjectLinksPanel({
  project,
  onChange,
  onElementsChange,
  onOpenDocument,
}: {
  project: VirtualProject;
  onChange(links: readonly ProjectLink[]): void;
  onElementsChange(elements: readonly ProjectElement[]): void;
  onOpenDocument(documentId: string): void;
}) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const elements = project.manifest.elements;
  const from = elements.find((item) => item.id === fromId);
  const compatible = useMemo(
    () => elements.filter((item) => canCreateLink("represents", from, item) || canCreateLink("implements", from, item)),
    [elements, from],
  );
  const to = elements.find((item) => item.id === toId);
  const kind = canCreateLink("represents", from, to)
    ? "represents"
    : canCreateLink("implements", from, to)
      ? "implements"
      : undefined;
  const registrations = project.members.flatMap((member) =>
    member.source ? member.declarations.map((declaration) => ({ member, declaration })) : [],
  );
  useEffect(() => {
    const missing = registrations.filter(
      ({ member, declaration }) =>
        !elements.some(
          (element) =>
            element.documentId === member.documentId &&
            element.kind === declaration.kind &&
            element.locator.declarationHash === declaration.declarationHash,
        ),
    );
    if (!missing.length) return;
    void Promise.all(
      missing.map(async ({ member, declaration }) => ({
        id: crypto.randomUUID(),
        documentId: member.documentId,
        kind: declaration.kind,
        locator: {
          symbolKey: declaration.symbolKey,
          keyType: "semantic-key" as const,
          declarationHash: declaration.declarationHash,
          sourceHash: await hashSource(member.source!),
          from: declaration.from,
          to: declaration.to,
        },
      })),
    ).then((registered) => onElementsChange([...elements, ...registered]));
  }, [elements, onElementsChange, registrations]);
  const repair = (
    element: ProjectElement,
    candidate: { symbolKey: string; declarationHash: string; from: number; to: number },
  ) => {
    const member = project.members.find((item) => item.documentId === element.documentId);
    if (!member?.source) return;
    void hashSource(member.source).then((sourceHash) =>
      onElementsChange(
        elements.map((item) =>
          item.id === element.id
            ? {
                ...item,
                locator: {
                  ...item.locator,
                  symbolKey: candidate.symbolKey,
                  declarationHash: candidate.declarationHash,
                  sourceHash,
                  from: candidate.from,
                  to: candidate.to,
                },
              }
            : item,
        ),
      ),
    );
  };

  return (
    <section className="project-links" aria-label="Links between diagram items">
      <div className="project-section-heading">
        <div>
          <h2>Links between diagram items</h2>
          <p>Keep related tasks and model elements connected across diagrams.</p>
        </div>
        <span className="project-count">{project.manifest.links.length}</span>
      </div>
      <div className="project-links-workflow">
        <p className="project-links-help">
          A link records that one item relates to another. It does not alter either diagram or add a PlantUML arrow.
        </p>
        {elements.length === 0 ? (
          <p className="project-links-empty">No linkable tasks or diagram elements are available yet.</p>
        ) : (
          <form
            className="project-link-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!kind || !from || !to) return;
              onChange([...project.manifest.links, { id: crypto.randomUUID(), kind, from: from.id, to: to.id }]);
              setToId("");
            }}
          >
            <label>
              <span>1. Link from</span>
              <select
                value={fromId}
                onChange={(event) => {
                  setFromId(event.target.value);
                  setToId("");
                }}
              >
                <option value="">Choose the item that starts the link…</option>
                {elements.map((element) => (
                  <option key={element.id} value={element.id}>
                    {elementLabel(project, element.id)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>2. Link to</span>
              <select value={toId} disabled={!from} onChange={(event) => setToId(event.target.value)}>
                <option value="">Choose what it relates to…</option>
                {compatible.map((element) => (
                  <option key={element.id} value={element.id}>
                    {elementLabel(project, element.id)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="project-create-link" disabled={!kind}>
              Create {kind ?? ""} link
            </button>
          </form>
        )}
      </div>
      <section className="project-existing-links" aria-labelledby="project-existing-links-heading">
        <div className="project-subsection-heading">
          <h3 id="project-existing-links-heading">Existing links</h3>
          <span>{project.manifest.links.length}</span>
        </div>
        {project.manifest.links.length === 0 ? (
          <p className="project-links-empty">No links created yet.</p>
        ) : (
          <ul className="project-link-list">
            {project.manifest.links.map((link) => (
              <li key={link.id}>
                <span className="project-link-route">
                  <button
                    type="button"
                    onClick={() => onOpenDocument(elements.find((item) => item.id === link.from)?.documentId ?? "")}
                  >
                    {elementLabel(project, link.from)}
                  </button>
                  <span className="project-link-kind">{link.kind} →</span>
                  <button
                    type="button"
                    onClick={() => onOpenDocument(elements.find((item) => item.id === link.to)?.documentId ?? "")}
                  >
                    {elementLabel(project, link.to)}
                  </button>
                </span>
                <button
                  type="button"
                  className="project-link-remove"
                  onClick={() => onChange(project.manifest.links.filter((item) => item.id !== link.id))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {elements.some((element) => {
        const state = project.resolutions.get(element.id)?.state;
        return state === "needs-review" || state === "ambiguous";
      }) && (
        <section className="project-link-repairs" aria-labelledby="project-link-repairs-heading">
          <h3 id="project-link-repairs-heading">Items needing attention</h3>
          {elements.flatMap((element) => {
            const resolution = project.resolutions.get(element.id);
            if (resolution?.state !== "needs-review" && resolution?.state !== "ambiguous") return [];
            return (
              <div className="project-link-repair" key={element.id}>
                <strong>{elementLabel(project, element.id)}</strong>
                <span>Choose the matching item to repair this connection.</span>
                {resolution.candidates.map((candidate) => (
                  <button
                    type="button"
                    key={`${candidate.from}:${candidate.to}`}
                    onClick={() => repair(element, candidate)}
                  >
                    Use {candidate.symbolKey}
                  </button>
                ))}
              </div>
            );
          })}
        </section>
      )}
    </section>
  );
}
