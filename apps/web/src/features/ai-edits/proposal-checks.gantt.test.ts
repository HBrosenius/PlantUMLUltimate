// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { checkProposal, reviewProposal } from "./proposal-checks";
import { aiEditSupports } from "./use-ai-edit-launcher";

const PLAN = [
  "@startgantt",
  "Project starts 2026-09-01",
  "[Design] lasts 5 days",
  "[Backend] starts at [Design]'s end",
  "[Backend] lasts 10 days",
  "[Testing] starts at [Backend]'s end",
  "[Testing] lasts 5 days",
  "@endgantt",
].join("\n");
const REVISED = PLAN.replace("[Backend] lasts 10 days", "[Backend] lasts 15 days");
const selection = { startLine: 4, endLine: 5 };

describe("Gantt proposals", () => {
  it("accepts a valid Gantt change and groups it with the Gantt semantic review", () => {
    const result = checkProposal({ kind: "gantt", original: PLAN, current: PLAN, proposal: REVISED, selection });
    expect(result).toMatchObject({ ok: true, source: REVISED });
    const review = reviewProposal("gantt", PLAN, REVISED, selection);
    expect(review.groups.length).toBeGreaterThan(0);
    expect(review.outsideGroupIds.size).toBe(0);
  });

  it("rejects a proposal with the wrong frame and marks a change outside the selection", () => {
    expect(
      checkProposal({ kind: "gantt", original: PLAN, current: PLAN, proposal: REVISED.replace("@endgantt", "") }),
    ).toMatchObject({ ok: false, reason: "invalid" });
    const outside = REVISED.replace("Project starts 2026-09-01", "Project starts 2026-09-02");
    expect(reviewProposal("gantt", PLAN, outside, selection).outsideGroupIds.size).toBeGreaterThan(0);
  });
});

describe("AI edit support", () => {
  it("covers Sequence and Gantt only", () => {
    expect(aiEditSupports("sequence")).toBe(true);
    expect(aiEditSupports("gantt")).toBe(true);
    expect(aiEditSupports("class")).toBe(false);
  });
});
