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
  it("covers Sequence, Gantt and C4", () => {
    expect(aiEditSupports("sequence")).toBe(true);
    expect(aiEditSupports("gantt")).toBe(true);
    expect(aiEditSupports("c4")).toBe(true);
    expect(aiEditSupports("class")).toBe(false);
  });
});

const C4 = [
  "@startuml",
  "!include <C4/C4_Container>",
  'Person(customer, "Customer", "Buys things")',
  'System_Boundary(shop, "Web shop") {',
  '  Container(web, "Web app", "React", "Shop front")',
  '  ContainerDb(db, "Database", "PostgreSQL", "Orders")',
  "}",
  'Rel(customer, web, "Uses", "HTTPS")',
  'Rel(web, db, "Reads and writes")',
  "@enduml",
].join("\n");
const WITH_CACHE = C4.replace(
  '  ContainerDb(db, "Database", "PostgreSQL", "Orders")',
  '  ContainerDb(db, "Database", "PostgreSQL", "Orders")\n  ContainerDb(cache, "Cache", "Redis", "Sessions")',
).replace('Rel(web, db, "Reads and writes")', 'Rel(web, db, "Reads and writes")\nRel(web, cache, "Caches sessions")');
const boundary = { startLine: 4, endLine: 7 };

describe("C4 proposals", () => {
  it("accepts a valid C4 change and reviews it by element and relationship", () => {
    const result = checkProposal({ kind: "c4", original: C4, current: C4, proposal: WITH_CACHE, selection: boundary });
    expect(result).toMatchObject({ ok: true, source: WITH_CACHE });
    const titles = reviewProposal("c4", C4, WITH_CACHE, boundary).groups.map((group) => group.title);
    expect(titles.join("\n")).toMatch(/cache/);
  });

  it("refuses a proposal that drops every C4 element", () => {
    const empty = "@startuml\n!include <C4/C4_Container>\n@enduml";
    expect(checkProposal({ kind: "c4", original: C4, current: C4, proposal: empty })).toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });

  it("refuses a proposal that adds a C4 error, such as an escaped quote in a label", () => {
    const broken = C4.replace('"Shop front"', '"The \\"shop\\" front"');
    expect(checkProposal({ kind: "c4", original: C4, current: C4, proposal: broken })).toMatchObject({
      ok: false,
      reason: "errors",
    });
  });
});
