import { expect, it } from "vitest";
import type { ElementResolution, ProjectElement } from "@plantuml-studio/project-model";
import { projectElementForEdit } from "./project-edit-mapping";

const old: ProjectElement = {
  id: "template",
  documentId: "wbs",
  kind: "wbs-node",
  locator: { from: 10, to: 25, symbolKey: "Template", keyType: "alias", sourceHash: "old", declarationHash: "old" },
};
const current: ProjectElement = { ...old, id: "linked", locator: { ...old.locator, symbolKey: "research" } };
const resolutions = new Map<string, ElementResolution>([
  [old.id, { state: "missing", elementId: old.id }],
  [
    current.id,
    {
      state: "resolved",
      elementId: current.id,
      locator: current.locator,
      declaration: { kind: "wbs-node", symbolKey: "research", from: 10, to: 28, declarationHash: "current" },
    },
  ],
]);

it("maps the linked declaration rather than a missing template locator at the same offset", () => {
  expect(projectElementForEdit([old, current], resolutions, "wbs", "wbs-node", 10)).toBe(current);
});
it("does not guess among ambiguous stale locators while indexing", () => {
  expect(projectElementForEdit([old, current], new Map(), "wbs", "wbs-node", 10)).toBeUndefined();
});
it("uses the original symbol key to distinguish a linked node while its index is updating", () => {
  expect(projectElementForEdit([old, current], new Map(), "wbs", "wbs-node", 10, "research")).toBe(current);
  expect(projectElementForEdit([old, current], new Map(), "wbs", "wbs-node", 10, "unknown")).toBeUndefined();
});
it("uses a unique locator while indexing and keeps edits scoped to their document", () => {
  expect(projectElementForEdit([current], new Map(), "wbs", "wbs-node", 10)).toBe(current);
  expect(projectElementForEdit([current], resolutions, "other", "wbs-node", 10)).toBeUndefined();
});
