import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseSequence } from "@plantuml-studio/diagram-sequence";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import { sha256 } from "@plantuml-studio/document-format";
import {
  parseProjectManifestJson,
  resolveElement,
  type ElementResolution,
  type ProjectManifest,
  type ResolvableDeclaration,
} from "@plantuml-studio/project-model";
import { detectDiagramKind } from "../diagram-kind";
import type { DiagramKind } from "../model";

export type ProjectMemberInput =
  | { state: "available"; source: string }
  | { state: "locked" }
  | { state: "missing" }
  | { state: "unsupported"; reason: string };

export type IndexedProjectMember = {
  documentId: string;
  path: string;
  diagramKind?: DiagramKind;
  state: "available" | "locked" | "missing" | "unsupported" | "parse-error";
  reason?: string;
  source?: string;
  declarations: readonly ResolvableDeclaration[];
  linkCount: number;
};

export interface VirtualProject {
  manifest: ProjectManifest;
  members: readonly IndexedProjectMember[];
  resolutions: ReadonlyMap<string, ElementResolution>;
}

const encode = new TextEncoder();

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Document indexing cancelled", "AbortError");
}

function linkCountsFor(manifest: ProjectManifest): ReadonlyMap<string, number> {
  const documents = new Map(manifest.elements.map((element) => [element.id, element.documentId]));
  const counts = new Map<string, number>();
  for (const link of manifest.links) {
    for (const documentId of new Set([documents.get(link.from), documents.get(link.to)])) {
      if (documentId) counts.set(documentId, (counts.get(documentId) ?? 0) + 1);
    }
  }
  return counts;
}

async function declaration(
  kind: ResolvableDeclaration["kind"],
  symbolKey: string,
  source: string,
  range: { from: number; to: number },
): Promise<ResolvableDeclaration> {
  return {
    kind,
    symbolKey,
    declarationHash: await sha256(encode.encode(source.slice(range.from, range.to))),
    from: range.from,
    to: range.to,
  };
}

async function declarationsFor(source: string, kind: DiagramKind): Promise<readonly ResolvableDeclaration[]> {
  if (kind === "sequence") {
    return Promise.all(
      parseSequence(source).participants.map((item) =>
        declaration("sequence-participant", item.alias ?? item.label, source, item.sourceRange),
      ),
    );
  }
  if (kind === "class" || kind === "component") {
    return Promise.all(
      parseClassDiagram(source).entities.map((item) =>
        declaration("class-entity", item.alias ?? item.id, source, item.sourceRange),
      ),
    );
  }
  if (kind === "gantt") {
    return Promise.all(
      parseGantt(source)
        .document.tasks.filter((item) => !item.milestone)
        .map((item) => declaration("gantt-task", item.alias?.value ?? item.label, source, item.sourceRange)),
    );
  }
  if (kind === "wbs") {
    return Promise.all(
      parseWbs(source).nodes.map((node) => declaration("wbs-node", node.alias ?? node.label, source, node.sourceRange)),
    );
  }
  return [];
}

export async function indexVirtualProject(
  manifestJson: string,
  inputs: ReadonlyMap<string, ProjectMemberInput>,
  signal?: AbortSignal,
): Promise<VirtualProject> {
  throwIfCancelled(signal);
  const manifest = parseProjectManifestJson(manifestJson);
  const linkCounts = linkCountsFor(manifest);
  const members = await Promise.all(
    manifest.documents.map(async (document): Promise<IndexedProjectMember> => {
      throwIfCancelled(signal);
      const input = inputs.get(document.path) ?? { state: "missing" as const };
      if (input.state !== "available")
        return {
          documentId: document.id,
          path: document.path,
          state: input.state,
          ...(input.state === "unsupported" ? { reason: input.reason } : {}),
          declarations: [],
          linkCount: linkCounts.get(document.id) ?? 0,
        };
      const diagramKind = detectDiagramKind(input.source);
      if (!diagramKind)
        return {
          documentId: document.id,
          path: document.path,
          state: "unsupported",
          reason: "Diagram type could not be identified",
          source: input.source,
          declarations: [],
          linkCount: linkCounts.get(document.id) ?? 0,
        };
      try {
        const declarations = await declarationsFor(input.source, diagramKind);
        throwIfCancelled(signal);
        return {
          documentId: document.id,
          path: document.path,
          state: "available",
          diagramKind,
          source: input.source,
          declarations,
          linkCount: linkCounts.get(document.id) ?? 0,
        };
      } catch (error) {
        return {
          documentId: document.id,
          path: document.path,
          state: "parse-error",
          diagramKind,
          source: input.source,
          reason: error instanceof Error ? error.message : "Could not parse source",
          declarations: [],
          linkCount: linkCounts.get(document.id) ?? 0,
        };
      }
    }),
  );
  throwIfCancelled(signal);
  const byId = new Map(members.map((member) => [member.documentId, member]));
  const resolutions = new Map<string, ElementResolution>();
  const sourceHashes = new Map<string, Promise<string>>();
  await Promise.all(
    manifest.elements.map(async (element) => {
      throwIfCancelled(signal);
      const member = byId.get(element.documentId);
      if (!member?.source || member.state !== "available") return;
      let pendingHash = sourceHashes.get(member.documentId);
      if (!pendingHash) {
        pendingHash = sha256(encode.encode(member.source));
        sourceHashes.set(member.documentId, pendingHash);
      }
      const sourceHash = await pendingHash;
      throwIfCancelled(signal);
      resolutions.set(element.id, resolveElement(element, sourceHash, member.declarations));
    }),
  );
  throwIfCancelled(signal);
  return { manifest, members, resolutions };
}
