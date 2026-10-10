import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { diagramBulkItems } from "./diagram-bulk-operations";
import type { DiagramKind } from "./model";

export interface PresentationDocument {
  id: string;
  name: string;
  kind: DiagramKind;
  source: string;
}
export interface PresentationAnchor {
  key: string;
  label: string;
  source: string;
  excerpt: string;
  stableAlias?: string;
  ambiguous?: boolean;
}
export interface PresentationView {
  id: string;
  name: string;
  steps: PresentationAnchor[];
  zoom: number;
}
export interface ReviewNote {
  id: string;
  text: string;
  createdAt: string;
  anchor: PresentationAnchor;
  resolved: boolean;
}
export interface PresentationReview {
  schemaVersion: 1;
  views: PresentationView[];
  notes: ReviewNote[];
}
export const emptyPresentationReview = (): PresentationReview => ({ schemaVersion: 1, views: [], notes: [] });

export function presentationTargets(doc: PresentationDocument): PresentationAnchor[] {
  if (doc.kind === "gantt") {
    return parseGantt(doc.source).document.tasks.map((task) => {
      // The Gantt parser merges declarations by alias. Inspect their complete
      // source lines so two different labels claiming one alias stay ambiguous.
      const aliasLabels = new Set(
        task.declarations.flatMap((declaration) => {
          const from = doc.source.lastIndexOf("\n", declaration.range.from - 1) + 1;
          const lineEnd = doc.source.indexOf("\n", declaration.range.from);
          const line = doc.source.slice(from, lineEnd < 0 ? undefined : lineEnd);
          const match = line.match(/^\s*\[([^\]]+)\]\s+as\s+\[([^\]]+)\]/i);
          return match && match[2]!.trim().toLowerCase() === task.alias?.value.trim().toLowerCase()
            ? [match[1]!.trim()]
            : [];
        }),
      );
      return {
        key: `task:${task.id}`,
        label: task.label,
        source: doc.source,
        excerpt: doc.source.slice(task.sourceRange.from, task.sourceRange.to),
        ...(task.alias ? { stableAlias: task.alias.value.trim().toLowerCase() } : {}),
        ...(aliasLabels.size > 1 ? { ambiguous: true } : {}),
      };
    });
  }
  return diagramBulkItems(doc.kind, doc.source).map((item) => ({
    key: item.key,
    label: item.label,
    source: doc.source,
    excerpt: doc.source.slice(item.range.from, item.range.to),
  }));
}

export function resolvePresentationAnchor(
  doc: PresentationDocument,
  anchor: PresentationAnchor,
): {
  state: "Current" | "Updated" | "Stale" | "Missing" | "Ambiguous";
  target?: PresentationAnchor;
} {
  const targets = presentationTargets(doc);
  const candidates = targets.filter((item) =>
    anchor.stableAlias ? item.stableAlias === anchor.stableAlias : item.key === anchor.key,
  );
  if (!candidates.length) return { state: "Missing" };
  if (candidates.length !== 1 || candidates.some((item) => item.ambiguous)) return { state: "Ambiguous" };
  if (doc.source === anchor.source) return { state: "Current", target: candidates[0]! };
  if (anchor.stableAlias) return { state: "Updated", target: candidates[0]! };
  return { state: "Stale" };
}

const storageKey = (documentId: string) => `plantuml-presentation-review-v1:${documentId}`;
export function loadPresentationReview(documentId: string): PresentationReview {
  const raw = localStorage.getItem(storageKey(documentId));
  if (!raw) return emptyPresentationReview();
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("Invalid local review data");
  const data = value as PresentationReview;
  const anchor = (a: PresentationAnchor) =>
    a &&
    typeof a.key === "string" &&
    typeof a.label === "string" &&
    typeof a.source === "string" &&
    typeof a.excerpt === "string" &&
    (a.stableAlias === undefined || typeof a.stableAlias === "string");
  if (
    data.schemaVersion !== 1 ||
    !Array.isArray(data.views) ||
    !Array.isArray(data.notes) ||
    !data.views.every(
      (v) =>
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        Number.isFinite(v.zoom) &&
        v.zoom >= 0.25 &&
        v.zoom <= 3 &&
        Array.isArray(v.steps) &&
        v.steps.every(anchor),
    ) ||
    !data.notes.every(
      (n) =>
        typeof n.id === "string" &&
        typeof n.text === "string" &&
        typeof n.createdAt === "string" &&
        typeof n.resolved === "boolean" &&
        anchor(n.anchor),
    )
  )
    throw new Error("Unsupported or invalid local review data");
  return data;
}
export function savePresentationReview(documentId: string, data: PresentationReview): void {
  localStorage.setItem(storageKey(documentId), JSON.stringify(data));
}
