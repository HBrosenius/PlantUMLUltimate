import * as Y from "yjs";
import { snapshotEmbeddedProject } from "./projects/embedded-project";
import { describe, expect, it } from "vitest";
import { decodeProject, encodeProject, projectFromPlantUml } from "@plantuml-studio/document-format";
import {
  SharedDocumentModel,
  liveProjectFromSharedDocument,
  sharedDocumentFromProject,
  type SharedDocument,
} from "./collaboration-document";

async function fixture() {
  const wbs = await projectFromPlantUml("@startwbs\n*(root) Root\n**(work) Work\n@endwbs", "wbs", "Plan");
  const gantt = await projectFromPlantUml("@startgantt\n[Work] as [work] lasts 2 days\n@endgantt", "gantt", "Schedule");
  wbs.diagrams.push({
    ...gantt.diagrams[0]!,
    wbsGantt: {
      wbsDiagramId: wbs.diagrams[0]!.id,
      links: [{ wbsAlias: "work", ganttAlias: "work" }],
      dependencies: [],
    },
  });
  return wbs;
}
function peers(initial: SharedDocument) {
  const left = new Y.Doc();
  const right = new Y.Doc();
  const a = new SharedDocumentModel(left);
  const b = new SharedDocumentModel(right);
  a.apply(initial);
  Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
  return { left, right, a, b };
}
function merge(left: Y.Doc, right: Y.Doc) {
  const a = Y.encodeStateAsUpdate(left);
  const b = Y.encodeStateAsUpdate(right);
  Y.applyUpdate(left, b);
  Y.applyUpdate(right, a);
}
describe("shared Documents", () => {
  it("merges offline edits to different diagrams and independent metadata", async () => {
    const initial = sharedDocumentFromProject(await fixture());
    const { left, right, a, b } = peers(initial);
    const first = structuredClone(initial);
    first.diagrams[0]!.source = first.diagrams[0]!.source.replace("Work", "API work");
    const second = structuredClone(initial);
    second.diagrams[1]!.source = second.diagrams[1]!.source.replace("2 days", "5 days");
    second.diagrams[0]!.name = "Scope";
    a.apply(first, initial);
    b.apply(second, initial);
    merge(left, right);
    expect(a.snapshot).toEqual(b.snapshot);
    expect(a.snapshot!.diagrams[0]).toMatchObject({ name: "Scope", source: first.diagrams[0]!.source });
    expect(a.snapshot!.diagrams[1]!.source).toBe(second.diagrams[1]!.source);
    left.destroy();
    right.destroy();
  });
  it("merges simultaneous source insertions in the same diagram", async () => {
    const initial = sharedDocumentFromProject(await fixture());
    const { left, right, a, b } = peers(initial);
    const first = structuredClone(initial),
      second = structuredClone(initial);
    first.diagrams[0]!.source = first.diagrams[0]!.source.replace("@startwbs", "@startwbs\n' Alice");
    second.diagrams[0]!.source = second.diagrams[0]!.source.replace("@endwbs", "' Bob\n@endwbs");
    a.apply(first, initial);
    b.apply(second, initial);
    merge(left, right);
    expect(a.snapshot).toEqual(b.snapshot);
    expect(a.snapshot!.diagrams[0]!.source).toContain("' Alice");
    expect(a.snapshot!.diagrams[0]!.source).toContain("' Bob");
    left.destroy();
    right.destroy();
  });
  it("does not resurrect a deleted diagram from a stale local snapshot", async () => {
    const initial = sharedDocumentFromProject(await fixture());
    const { left, right, a, b } = peers(initial);
    const deleted = structuredClone(initial);
    deleted.diagrams.splice(1, 1);
    a.apply(deleted, initial);
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
    const stale = structuredClone(initial);
    stale.diagrams[1]!.name = "Changed offline";
    b.apply(stale, initial);
    expect(b.snapshot!.diagrams).toHaveLength(1);
    left.destroy();
    right.destroy();
  });
  it("saves and reopens shared sources, settings and WBS–Gantt links as one portable file", async () => {
    const original = await fixture();
    const shared = sharedDocumentFromProject(original);
    shared.diagrams[1]!.source = shared.diagrams[1]!.source.replace("2 days", "7 days");
    const project = await snapshotEmbeddedProject(liveProjectFromSharedDocument(shared, original), new Map(), []);
    const encoded = await encodeProject(project);
    const reopened = await decodeProject(encoded.bytes);
    expect(sharedDocumentFromProject(reopened.project)).toEqual(shared);
    expect(project.diagrams[0]!.document.versions).toEqual(original.diagrams[0]!.document.versions);
  });
});
