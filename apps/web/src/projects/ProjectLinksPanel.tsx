import { hashSource } from "@plantuml-studio/document-format";
import { canCreateLink, reverseImpact, type ProjectElement, type ProjectLink } from "@plantuml-studio/project-model";
import { useEffect, useMemo, useState } from "react";
import type { VirtualProject } from "./project-index";
import type { WbsGanttProjectLink } from "./wbs-gantt-project-links";

function elementState(project: VirtualProject, elementId: string): string {
  const element = project.manifest.elements.find((item) => item.id === elementId);
  if (!element) return "missing";
  const member = project.members.find((item) => item.documentId === element.documentId);
  return (
    project.resolutions.get(elementId)?.state ??
    (member?.state !== "available" ? (member?.state ?? "missing") : "pending")
  );
}

function elementLabel(project: VirtualProject, elementId: string): string {
  const element = project.manifest.elements.find((item) => item.id === elementId);
  if (!element) return "Unknown element";
  const member = project.members.find((item) => item.documentId === element.documentId);
  const path = member?.path ?? element.documentId;
  const state = elementState(project, elementId);
  return `${path}: ${element.locator.symbolKey}${state && state !== "resolved" ? ` (${state})` : ""}`;
}

function attentionMessage(project: VirtualProject, element: ProjectElement): string {
  const resolution = project.resolutions.get(element.id);
  if (resolution?.state === "invalid-evidence") return "The saved location no longer matches the diagram source.";
  if (resolution?.state === "missing") return "The linked item no longer exists in this diagram.";
  const member = project.members.find((item) => item.documentId === element.documentId);
  if (member?.state === "parse-error") return member.reason ?? "This diagram could not be parsed.";
  if (member?.state === "missing") return "The diagram containing this item is missing.";
  if (member?.state === "locked") return "Unlock this diagram to check the linked item.";
  if (member?.state === "unsupported") return member.reason ?? "This diagram type cannot be indexed.";
  return "Choose the matching item to repair this connection.";
}

export function ProjectLinksPanel({
  project,
  onChange,
  onElementsChange,
  onElementsRegistered = onElementsChange,
  wbsGanttLinks = [],
  onOpenWbsGanttLink,
}: {
  project: VirtualProject;
  onChange(links: readonly ProjectLink[]): void;
  /** A user edit to the element set, such as repairing a link target. */
  onElementsChange(elements: readonly ProjectElement[]): void;
  /**
   * Declarations found by the index being recorded as elements. This is derived bookkeeping
   * that arrives asynchronously, so hosts may route it separately from user edits.
   */
  onElementsRegistered?(elements: readonly ProjectElement[]): void;
  wbsGanttLinks?: readonly WbsGanttProjectLink[];
  onOpenWbsGanttLink?(documentId: string, kind: "wbs" | "gantt", key: string): void;
}) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const elements = project.manifest.elements;
  const from = elements.find((item) => item.id === fromId);
  const compatible = useMemo(
    () =>
      elements.filter(
        (item) =>
          canCreateLink("relates", from, item) ||
          canCreateLink("represents", from, item) ||
          canCreateLink("implements", from, item),
      ),
    [elements, from],
  );
  const to = elements.find((item) => item.id === toId);
  const kind = canCreateLink("relates", from, to)
    ? "relates"
    : canCreateLink("represents", from, to)
      ? "represents"
      : canCreateLink("implements", from, to)
        ? "implements"
        : undefined;
  const registrations = project.members.flatMap((member) =>
    member.source ? member.declarations.map((declaration) => ({ member, declaration })) : [],
  );
  const linkedElementIds = new Set(project.manifest.links.flatMap((link) => [link.from, link.to]));
  const attentionElements = elements.filter((element) => {
    if (!linkedElementIds.has(element.id)) return false;
    const state = elementState(project, element.id);
    return state !== "resolved" && state !== "pending";
  });
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
    ).then((registered) => onElementsRegistered([...elements, ...registered]));
  }, [elements, onElementsRegistered, registrations]);
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
        <span className="project-count">{project.manifest.links.length + wbsGanttLinks.length}</span>
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
              {kind === "relates" ? "Create WBS link" : `Create ${kind ?? ""} link`}
            </button>
          </form>
        )}
      </div>
      <section className="project-existing-links" aria-labelledby="project-existing-links-heading">
        <div className="project-subsection-heading">
          <h3 id="project-existing-links-heading">Existing links</h3>
          <span>{project.manifest.links.length + wbsGanttLinks.length}</span>
        </div>
        {project.manifest.links.length === 0 && wbsGanttLinks.length === 0 ? (
          <p className="project-links-empty">No links created yet.</p>
        ) : (
          <ul className="project-link-list">
            {wbsGanttLinks.map((link) => (
              <li key={link.id}>
                <span className="project-link-route">
                  <button
                    type="button"
                    className="project-link-endpoint"
                    onClick={() => onOpenWbsGanttLink?.(link.wbsDocumentId, "wbs", link.wbsNodeId)}
                  >
                    {link.wbsDiagramName}: {link.wbsLabel}
                  </button>
                  <span className="project-link-kind">scheduled as →</span>
                  <button
                    type="button"
                    className="project-link-endpoint"
                    onClick={() => onOpenWbsGanttLink?.(link.ganttDocumentId, "gantt", link.ganttTaskId)}
                  >
                    {link.ganttDiagramName}: {link.ganttLabel}
                  </button>
                </span>
              </li>
            ))}
            {project.manifest.links.map((link) => (
              <li key={link.id}>
                <span className="project-link-route">
                  <span className="project-link-endpoint">{elementLabel(project, link.from)}</span>
                  <span className="project-link-kind">{link.kind} →</span>
                  <span className="project-link-endpoint">{elementLabel(project, link.to)}</span>
                  <span
                    className={`project-link-health ${
                      elementState(project, link.from) === "resolved" && elementState(project, link.to) === "resolved"
                        ? "is-confirmed"
                        : "needs-attention"
                    }`}
                  >
                    {elementState(project, link.from) === "resolved" && elementState(project, link.to) === "resolved"
                      ? "Confirmed"
                      : "Unresolved path"}
                  </span>
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
      {attentionElements.length > 0 && (
        <section className="project-link-repairs" aria-labelledby="project-link-repairs-heading">
          <h3 id="project-link-repairs-heading">Items needing attention</h3>
          {attentionElements.map((element) => {
            const resolution = project.resolutions.get(element.id);
            const impacts = reverseImpact(project.manifest.links, element.id).paths;
            const candidates =
              resolution?.state === "needs-review" || resolution?.state === "ambiguous" ? resolution.candidates : [];
            return (
              <div className="project-link-repair" key={element.id}>
                <strong>{elementLabel(project, element.id)}</strong>
                <span>Current target: {element.locator.symbolKey}</span>
                <span>{attentionMessage(project, element)}</span>
                {impacts.length > 0 && (
                  <span className="project-link-impact">
                    Affects {impacts.length} linked path{impacts.length === 1 ? "" : "s"}:{" "}
                    {impacts
                      .map((path) => path.elementIds.map((id) => elementLabel(project, id)).join(" → "))
                      .join("; ")}
                  </span>
                )}
                {candidates.map((candidate) => (
                  <button
                    type="button"
                    key={`${candidate.from}:${candidate.to}`}
                    onClick={() => repair(element, candidate)}
                  >
                    Repair: {element.locator.symbolKey} → {candidate.symbolKey}
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
