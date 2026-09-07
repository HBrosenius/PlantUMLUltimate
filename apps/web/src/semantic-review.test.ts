import { describe, expect, it } from "vitest";
import { applyReviewGroups, buildReviewGroups, createUnifiedPatch } from "./semantic-review";

describe("semantic review", () => {
  it("classifies a participant rename when its alias remains stable", () => {
    const before = '@startuml\nparticipant "Payment API" as Pay\nPay -> Store: Save\n@enduml';
    const after = '@startuml\nparticipant "Billing API" as Pay\nPay -> Store: Save\n@enduml';
    expect(buildReviewGroups(before, after, "sequence")).toMatchObject([
      { title: "Rename participant Payment API to Billing API", confidence: "confirmed" },
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
});
