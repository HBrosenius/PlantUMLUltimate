import { expect, it } from "vitest";
import { applyReviewGroups, buildReviewGroups } from "./semantic-review";
import { validateGeneratedSource } from "./generated-source-validation";

it("recognizes an aliased label rename as one identity", () => {
  const before = "@startgantt\n[Build] as [b] lasts 2 days\n@endgantt";
  const groups = buildReviewGroups(before, before.replace("Build", "Compile"), "gantt");
  expect(groups[0]).toMatchObject({ title: "Rename task Build to Compile", confidence: "confirmed" });
  expect(groups[0]!.leftTargets).toEqual([{ kind: "gantt-task", id: "b", label: "Build" }]);
  expect(groups[0]!.rightTargets).toEqual([{ kind: "gantt-task", id: "b", label: "Compile" }]);
});
it("does not classify a mixed unsupported block as a task-only edit", () => {
  const before = "@startgantt\n[A] lasts 2 days\n@endgantt";
  const groups = buildReviewGroups(before, before.replace("2 days", "3 days\ncustom unknown syntax"), "gantt");
  expect(groups[0]).toMatchObject({ confidence: "unclassified", title: "Unclassified source change" });
});
it("flags a separated unaliased rename or replacement instead of confirming unrelated add/remove", () => {
  const before = "@startgantt\n[Build] lasts 2 days\n\n[Other] lasts 1 day\n@endgantt";
  const after = "@startgantt\n\n[Other] lasts 1 day\n\n[Compile] lasts 2 days\n@endgantt";
  const groups = buildReviewGroups(before, after, "gantt");
  expect(groups.length).toBeGreaterThan(1);
  expect(groups.every((group) => group.confidence === "probable")).toBe(true);
  expect(groups.every((group) => group.title.includes("rename or replacement"))).toBe(true);
});
it("requires related dependency changes when a task is removed", () => {
  const before = "@startgantt\n[A] lasts 2 days\n\n[B] lasts 1 day\n[B] starts at [A]'s end\n@endgantt";
  const after = "@startgantt\n\n[B] lasts 1 day\n@endgantt";
  const groups = buildReviewGroups(before, after, "gantt");
  const removal = groups.find((group) => group.title === "Remove task A")!;
  expect(removal).toBeDefined();
  const partial = applyReviewGroups(before, groups, new Set([removal.id]));
  expect(validateGeneratedSource("gantt", before, partial).valid).toBe(false);
  expect(
    validateGeneratedSource(
      "gantt",
      before,
      applyReviewGroups(before, groups, new Set(groups.map((group) => group.id))),
    ).valid,
  ).toBe(true);
});
