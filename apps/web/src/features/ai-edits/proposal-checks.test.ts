// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyReviewGroups } from "../../semantic-review";
import { checkProposal, groupsOutsideSelection, reviewProposal } from "./proposal-checks";
import { interpretProposalRender } from "./use-proposal-render-check";

const ORIGINAL = [
  "@startuml",
  "participant A",
  "participant B",
  "A -> B : save",
  "B --> A : saved",
  "A -> B : close",
  "B --> A : closed",
  "@enduml",
].join("\n");
const selection = { startLine: 4, endLine: 5 };
const withTimeout = ORIGINAL.replace(
  "A -> B : save\nB --> A : saved",
  "alt ok\nA -> B : save\nB --> A : saved\nelse timeout\nB --> A : timeout\nend",
);
const base = { kind: "sequence" as const, original: ORIGINAL, current: ORIGINAL, selection };

describe("checkProposal", () => {
  it("accepts a parsing proposal that adds no errors", () => {
    expect(checkProposal({ ...base, proposal: withTimeout })).toMatchObject({
      ok: true,
      source: withTimeout,
      rebased: false,
    });
  });

  it("rejects empty, unchanged, unparsable and marker-leaking proposals with plain messages", () => {
    expect(checkProposal({ ...base, proposal: "  " })).toMatchObject({ ok: false, reason: "empty" });
    expect(checkProposal({ ...base, proposal: ORIGINAL })).toMatchObject({ ok: false, reason: "unchanged" });
    expect(checkProposal({ ...base, proposal: "A -> B" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(
      checkProposal({ ...base, proposal: withTimeout.replace("alt ok", "[[[SELECTION_START]]]\nalt ok") }),
    ).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("rejects a proposal that adds errors and returns them for the retry", () => {
    const result = checkProposal({ ...base, proposal: withTimeout.replace("\nend\n", "\n") });
    expect(result).toMatchObject({ ok: false, reason: "errors" });
    expect(!result.ok && result.problems.length).toBeGreaterThan(0);
  });

  it("does not blame the proposal for errors the document already had", () => {
    const flawed = ORIGINAL.replace("@enduml", "alt open\n@enduml");
    const proposal = withTimeout.replace("@enduml", "alt open\n@enduml");
    expect(checkProposal({ ...base, original: flawed, current: flawed, proposal })).toMatchObject({ ok: true });
  });

  it("asks for confirmation when much more than the selection is rewritten", () => {
    const rewritten = withTimeout
      .replace("participant A", "actor A")
      .replace("participant B", "actor B")
      .replace("A -> B : close", "A -> B : done");
    const result = checkProposal({ ...base, proposal: rewritten });
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.rewrite?.share).toBeGreaterThan(0.3);
    const small = checkProposal({ ...base, proposal: withTimeout });
    expect(small.ok && small.rewrite).toBeUndefined();
  });

  it("rebases onto edits made while the request ran", () => {
    const current = ORIGINAL.replace("participant A", "participant A #LightBlue");
    const result = checkProposal({ ...base, current, proposal: withTimeout });
    expect(result).toMatchObject({ ok: true, rebased: true });
    expect(result.ok && result.source).toContain("alt ok");
    expect(result.ok && result.source).toContain("#LightBlue");
  });

  it("discards the proposal when the newer edits conflict with it", () => {
    const current = ORIGINAL.replace("B --> A : saved", "B --> A : stored");
    const result = checkProposal({ ...base, current, proposal: withTimeout });
    expect(result).toMatchObject({ ok: false, reason: "stale" });
  });

  it("reports when the newer edits already contain the change", () => {
    expect(checkProposal({ ...base, current: withTimeout, proposal: withTimeout })).toMatchObject({
      ok: false,
      reason: "unchanged",
    });
  });
});

describe("review groups for a proposal", () => {
  it("marks groups outside the selection, leaves them unchecked, and applies only the chosen ones", () => {
    const proposal = withTimeout.replace("A -> B : close", "A -> B : close now");
    const { groups, outsideGroupIds, initiallySelected } = reviewProposal("sequence", ORIGINAL, proposal, selection);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(outsideGroupIds.size).toBeGreaterThanOrEqual(1);
    for (const id of outsideGroupIds) expect(initiallySelected.has(id)).toBe(false);
    const applied = applyReviewGroups(ORIGINAL, groups, initiallySelected);
    expect(applied).not.toContain("close now");
  });

  it("treats everything as inside without a selection", () => {
    const { groups } = reviewProposal("sequence", ORIGINAL, withTimeout, undefined);
    expect(groupsOutsideSelection(groups, undefined).size).toBe(0);
  });
});

describe("interpretProposalRender", () => {
  const result = (over: object) => ({ requestId: 1, durationMs: 1, source: "S", ...over });
  it("only accepts a result for exactly this source and sanitises the SVG", () => {
    expect(interpretProposalRender("S", "rendering", undefined)).toEqual({ state: "rendering" });
    const ok = interpretProposalRender(
      "S",
      "idle",
      result({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script><rect/></svg>' }),
    );
    expect(ok.state).toBe("ok");
    expect(ok.state === "ok" && ok.svg).not.toContain("script");
    expect(interpretProposalRender("T", "idle", result({ svg: "<svg/>" })).state).toBe("rendering");
  });
  it("fails on render errors and oversized output", () => {
    expect(interpretProposalRender("S", "error", result({ error: "boom" }))).toMatchObject({ state: "failed" });
    expect(
      interpretProposalRender("S", "idle", result({ svg: `<svg>${"x".repeat(5 * 1024 * 1024 + 1)}</svg>` })),
    ).toMatchObject({ state: "failed" });
  });
});
