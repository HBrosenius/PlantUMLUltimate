import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseSequence } from "@plantuml-studio/diagram-sequence";
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

function linkCountFor(manifest: ProjectManifest, documentId: string): number {
  const elementIds = new Set(
    manifest.elements.filter((element) => element.documentId === documentId).map((element) => element.id),
  );
  return manifest.links.filter((link) => elementIds.has(link.from) || elementIds.has(link.to)).length;
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
  if (kind === "class") {
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
  return [];
}

export async function indexVirtualProject(
  manifestJson: string,
  inputs: ReadonlyMap<string, ProjectMemberInput>,
): Promise<VirtualProject> {
  const manifest = parseProjectManifestJson(manifestJson);
  const members = await Promise.all(
    manifest.documents.map(async (document): Promise<IndexedProjectMember> => {
      const input = inputs.get(document.path) ?? { state: "missing" as const };
      if (input.state !== "available")
        return {
          documentId: document.id,
          path: document.path,
          state: input.state,
          ...(input.state === "unsupported" ? { reason: input.reason } : {}),
          declarations: [],
          linkCount: linkCountFor(manifest, document.id),
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
          linkCount: linkCountFor(manifest, document.id),
        };
      try {
        return {
          documentId: document.id,
          path: document.path,
          state: "available",
          diagramKind,
          source: input.source,
          declarations: await declarationsFor(input.source, diagramKind),
          linkCount: linkCountFor(manifest, document.id),
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
          linkCount: linkCountFor(manifest, document.id),
        };
      }
    }),
  );
  const byId = new Map(members.map((member) => [member.documentId, member]));
  const resolutions = new Map<string, ElementResolution>();
  await Promise.all(
    manifest.elements.map(async (element) => {
      const member = byId.get(element.documentId);
      if (!member?.source || member.state !== "available") return;
      resolutions.set(
        element.id,
        resolveElement(element, await sha256(encode.encode(member.source)), member.declarations),
      );
    }),
  );
  return { manifest, members, resolutions };
}
