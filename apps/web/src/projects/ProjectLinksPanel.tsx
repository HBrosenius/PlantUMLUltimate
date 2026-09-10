import { hashSource } from "@plantuml-studio/document-format";
import {
  backlinks,
  canCreateLink,
  reverseImpact,
  type ProjectElement,
  type ProjectLink,
} from "@plantuml-studio/project-model";
import { useMemo, useState } from "react";
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
  const impact = toId ? reverseImpact(project.manifest.links, toId) : undefined;
  const registrations = project.members.flatMap((member) =>
    member.source ? member.declarations.map((declaration) => ({ member, declaration })) : [],
  );
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
    <section className="project-links" aria-label="Diagram connections">
      <h2>Connections</h2>
      <label>
        Register diagram item
        <select
          value=""
          onChange={(event) => {
            const [documentId, index] = event.target.value.split(":");
            const candidate = registrations[Number(index)];
            if (!candidate || candidate.member.documentId !== documentId) return;
            if (
              elements.some(
                (item) =>
                  item.documentId === documentId &&
                  item.kind === candidate.declaration.kind &&
                  item.locator.declarationHash === candidate.declaration.declarationHash,
              )
            )
              return;
            void hashSource(candidate.member.source!).then((sourceHash) =>
              onElementsChange([
                ...elements,
                {
                  id: crypto.randomUUID(),
                  documentId,
                  kind: candidate.declaration.kind,
                  locator: {
                    symbolKey: candidate.declaration.symbolKey,
                    keyType: "semantic-key",
                    declarationHash: candidate.declaration.declarationHash,
                    sourceHash,
                    from: candidate.declaration.from,
                    to: candidate.declaration.to,
                  },
                },
              ]),
            );
          }}
        >
          <option value="">Choose a declaration…</option>
          {registrations.map(({ member, declaration }, index) => (
            <option key={`${member.documentId}:${declaration.from}`} value={`${member.documentId}:${index}`}>
              {member.path}: {declaration.symbolKey}
            </option>
          ))}
        </select>
      </label>
      {elements.length === 0 ? (
        <p>Connections become available when this project contains registered diagram elements.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!kind || !from || !to) return;
            onChange([...project.manifest.links, { id: crypto.randomUUID(), kind, from: from.id, to: to.id }]);
            setToId("");
          }}
        >
          <label>
            From
            <select
              value={fromId}
              onChange={(event) => {
                setFromId(event.target.value);
                setToId("");
              }}
            >
              <option value="">Choose an element…</option>
              {elements.map((element) => (
                <option key={element.id} value={element.id}>
                  {elementLabel(project, element.id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            To
            <select value={toId} disabled={!from} onChange={(event) => setToId(event.target.value)}>
              <option value="">Choose a compatible element…</option>
              {compatible.map((element) => (
                <option key={element.id} value={element.id}>
                  {elementLabel(project, element.id)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!kind}>
            Create {kind ?? ""} link
          </button>
        </form>
      )}
      <ul className="project-link-list">
        {project.manifest.links.map((link) => (
          <li key={link.id}>
            <span>
              <button
                type="button"
                onClick={() => onOpenDocument(elements.find((item) => item.id === link.from)?.documentId ?? "")}
              >
                {elementLabel(project, link.from)}
              </button>
              <strong>{link.kind}</strong>
              <button
                type="button"
                onClick={() => onOpenDocument(elements.find((item) => item.id === link.to)?.documentId ?? "")}
              >
                {elementLabel(project, link.to)}
              </button>
            </span>
            <button
              type="button"
              onClick={() => onChange(project.manifest.links.filter((item) => item.id !== link.id))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {elements.flatMap((element) => {
        const resolution = project.resolutions.get(element.id);
        if (resolution?.state !== "needs-review" && resolution?.state !== "ambiguous") return [];
        return (
          <div className="project-link-repair" key={element.id}>
            <strong>Repair {elementLabel(project, element.id)}</strong>
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
      {toId && (
        <p>
          {backlinks(project.manifest.links, toId).length} direct backlink(s)
          {impact?.truncated ? "; impact list truncated" : ""}.
        </p>
      )}
      <p className="project-links-note">
        Connection changes are staged for this session; recovery-safe project saving arrives in the next delivery.
      </p>
    </section>
  );
}
