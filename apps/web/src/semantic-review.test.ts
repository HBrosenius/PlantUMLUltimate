import { describe, expect, it } from "vitest";
import { applyReviewGroups, buildReviewGroups, createReviewReport, createUnifiedPatch } from "./semantic-review";

describe("semantic review", () => {
  it("classifies a participant rename when its alias remains stable", () => {
    const before = '@startuml\nparticipant "Payment API" as Pay\nPay -> Store: Save\n@enduml';
    const after = '@startuml\nparticipant "Billing API" as Pay\nPay -> Store: Save\n@enduml';
    expect(buildReviewGroups(before, after, "sequence")).toMatchObject([
      {
        title: "Rename participant Payment API to Billing API",
        changeKind: "modified",
        confidence: "confirmed",
        startLeft: 1,
        startRight: 1,
        deleteCount: 1,
        replacement: ['participant "Billing API" as Pay'],
        leftTargets: [{ kind: "sequence-participant", id: "pay", label: "Payment API", alias: "Pay" }],
        rightTargets: [{ kind: "sequence-participant", id: "pay", label: "Billing API", alias: "Pay" }],
      },
    ]);
  });

  it("keeps unknown changes visible but ineligible for semantic acceptance", () => {
    const before = "@startuml\nskinparam shadowing false\nA -> B: Save\n@enduml";
    const after = "@startuml\nskinparam shadowing true\nA -> B: Save\n@enduml";
    expect(buildReviewGroups(before, after, "sequence")).toMatchObject([
      { title: "Unclassified source change", confidence: "unclassified" },
    ]);
  });

  it("marks an identity-changing participant rename as probable", () => {
    expect(
      buildReviewGroups("@startuml\nparticipant Old\n@enduml", "@startuml\nparticipant New\n@enduml", "sequence"),
    ).toMatchObject([{ title: "Possible participant rename: Old → New", confidence: "probable" }]);
  });

  it("distinguishes added, removed, and modified review groups", () => {
    expect(
      buildReviewGroups(
        "@startuml\nparticipant A\n@enduml",
        "@startuml\nparticipant A\nparticipant B\n@enduml",
        "sequence",
      ),
    ).toMatchObject([{ changeKind: "added" }]);
    expect(buildReviewGroups("@startuml\nA -> B: Remove me\n@enduml", "@startuml\n@enduml", "sequence")).toMatchObject([
      { changeKind: "removed" },
    ]);
    expect(
      buildReviewGroups("@startuml\nA -> B: Before\n@enduml", "@startuml\nA -> B: After\n@enduml", "sequence"),
    ).toMatchObject([{ changeKind: "modified" }]);
  });

  it("groups adjacent participant and message edits when every identity remains stable", () => {
    const before = '@startuml\nparticipant "Payment API" as Pay\nPay -> Store: Authorize\n@enduml';
    const after = '@startuml\nparticipant "Billing API" as Pay\nPay -> Store: Capture\n@enduml';
    const groups = buildReviewGroups(before, after, "sequence");
    expect(groups).toMatchObject([
      {
        title: "Update 1 participant and 1 message",
        confidence: "confirmed",
        deleteCount: 2,
        replacement: ['participant "Billing API" as Pay', "Pay -> Store: Capture"],
      },
    ]);
    expect(applyReviewGroups(before, groups, new Set([groups[0]!.id]))).toBe(after);
  });

  it("does not confirm an adjacent edit when a message endpoint changes", () => {
    const before = '@startuml\nparticipant "Payment API" as Pay\nPay -> Store: Authorize\n@enduml';
    const after = '@startuml\nparticipant "Billing API" as Pay\nPay -> Archive: Capture\n@enduml';
    expect(buildReviewGroups(before, after, "sequence")).toMatchObject([
      { title: "Unclassified source change", confidence: "unclassified" },
    ]);
  });

  it("does not confirm an adjacent edit when participant identity changes", () => {
    const before = '@startuml\nparticipant "Payment API" as Pay\nPay -> Store: Authorize\n@enduml';
    const after = '@startuml\nparticipant "Billing API" as Bill\nPay -> Store: Capture\n@enduml';
    expect(buildReviewGroups(before, after, "sequence")).toMatchObject([
      { title: "Unclassified source change", confidence: "unclassified" },
    ]);
  });

  it("describes recognized Gantt duration and date changes", () => {
    const before = "@startgantt\n[A] starts 2026-09-01\n[A] lasts 2 days\n@endgantt";
    const after = "@startgantt\n[A] starts 2026-09-03\n[A] lasts 4 days\n@endgantt";
    expect(buildReviewGroups(before, after, "gantt")).toMatchObject([
      {
        title: "Change schedule for A",
        detail: "A single transaction updates start and duration.",
        confidence: "confirmed",
      },
    ]);
  });

  it("groups a replaced explicit start and inserted dependency from the default Gantt chart", () => {
    const before =
      "@startgantt\n[Backend] starts 2026-09-05\n[Backend] lasts 8 days\n[Frontend] starts 2026-09-05\n[Frontend] lasts 10 days\n[Testing] lasts 5 days\n@endgantt";
    const after =
      "@startgantt\n[Backend] starts 2026-09-05\n[Backend] lasts 8 days\n\n[Frontend] lasts 10 days\n[Testing] lasts 5 days\n[Frontend] starts at [Backend]'s end\n@endgantt";
    const groups = buildReviewGroups(before, after, "gantt");
    expect(groups).toMatchObject([
      {
        title: "Add dependency Backend → Frontend",
        changeKind: "modified",
        detail: "Frontend's explicit start is replaced by a dependency on Backend. Both source regions apply together.",
        confidence: "confirmed",
      },
    ]);
    expect(applyReviewGroups(before, groups, new Set([groups[0]!.id]))).toBe(after);
  });

  it("recognizes a standalone Gantt dependency without reporting a new task", () => {
    const before = "@startgantt\n[Backend] lasts 8 days\n[Frontend] lasts 10 days\n@endgantt";
    const after =
      "@startgantt\n[Backend] lasts 8 days\n[Frontend] lasts 10 days\n[Frontend] starts at [Backend]'s end\n@endgantt";
    expect(buildReviewGroups(before, after, "gantt")).toMatchObject([
      {
        title: "Add dependency Backend → Frontend",
        confidence: "confirmed",
        leftTargets: [],
        rightTargets: [{ kind: "gantt-dependency", predecessorId: "backend", successorId: "frontend" }],
      },
    ]);
  });

  it("recognizes adjacent Gantt milestones as created milestones", () => {
    const before = "@startgantt\n-- Rating Data --\n@endgantt";
    const after =
      "@startgantt\n-- Rating Data --\n[First feed] happens 2026-05-29\n[Second feed] happens 2026-06-26\n[Third feed] happens 2026-08-15\n@endgantt";
    expect(buildReviewGroups(before, after, "gantt")).toMatchObject([
      {
        title: "Add milestones (3)",
        detail: "All added declarations are recognized as milestones.",
        changeKind: "added",
        confidence: "confirmed",
        rightTargets: [
          { kind: "gantt-task", label: "First feed" },
          { kind: "gantt-task", label: "Second feed" },
          { kind: "gantt-task", label: "Third feed" },
        ],
      },
    ]);
  });

  it("applies only selected source groups without rewriting neighbouring lines", () => {
    const before = "@startuml\nparticipant A\n\nA -> B: First\n@enduml";
    const after = "@startuml\nparticipant A\nparticipant B\n\nA -> B: Second\n@enduml";
    const groups = buildReviewGroups(before, after, "sequence");
    expect(groups).toHaveLength(2);
    expect(applyReviewGroups(before, groups, new Set([groups[0]!.id]))).toBe(
      "@startuml\nparticipant A\nparticipant B\n\nA -> B: First\n@enduml",
    );
  });

  it("exports a valid whole-file unified patch", () => {
    const patch = createUnifiedPatch("flow.puml", "@startuml\nA -> B: Old\n@enduml", "@startuml\nA -> B: New\n@enduml");
    expect(patch).toContain("--- a/flow.puml\n+++ b/flow.puml\n@@ -1,3 +1,3 @@");
    expect(patch).toContain("-A -> B: Old\n+A -> B: New");
  });

  it("falls back to unclassified groups when semantic parsing is bounded", () => {
    const before = `@startuml\n${" ".repeat(100_001)}\n@enduml`;
    const after = `@startuml\n${"x".repeat(100_001)}\n@enduml`;
    expect(buildReviewGroups(before, after, "sequence")).toMatchObject([
      { confidence: "unclassified", title: "Unclassified source change" },
    ]);
  });

  it("preserves comments and unsupported multiline syntax when applying another group", () => {
    const before =
      "@startuml\n' ownership stays here\nparticipant API\nnote over API\nDo not rewrite <this>\nend note\n\nAPI -> DB: Old\n@enduml";
    const after =
      "@startuml\n' ownership stays here\nparticipant API\nnote over API\nDo not rewrite <this>\nend note\n\nAPI -> DB: New\n@enduml";
    const groups = buildReviewGroups(before, after, "sequence");
    expect(groups).toMatchObject([{ title: "Change message API → DB", confidence: "confirmed" }]);
    expect(applyReviewGroups(before, groups, new Set([groups[0]!.id]))).toBe(after);
  });

  it("keeps multiline note edits unclassified", () => {
    const before = "@startuml\nnote over API\nOld text\nend note\n@enduml";
    const after = "@startuml\nnote over API\nNew text\nend note\n@enduml";
    expect(buildReviewGroups(before, after, "sequence")).toMatchObject([{ confidence: "unclassified" }]);
  });

  it("escapes document content in standalone reports", () => {
    const before = "@startuml\nA -> B: <old>\n@enduml";
    const after = "@startuml\nA -> B: <script>alert('x')</script>\n@enduml";
    const report = createReviewReport('bad"name.puml', before, after, buildReviewGroups(before, after, "sequence"));
    expect(report).not.toContain("<script>");
    expect(report).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(report).toContain("bad&quot;name.puml review");
    expect(report).toContain('meta name="referrer" content="no-referrer"');
  });
});
