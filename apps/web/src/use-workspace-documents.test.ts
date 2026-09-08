import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVITY_SOURCE,
  DEFAULT_CLASS_SOURCE,
  DEFAULT_SEQUENCE_SOURCE,
  DEFAULT_SOURCE,
  DEFAULT_USECASE_SOURCE,
  DEFAULT_WBS_SOURCE,
} from "./model";
import { diagramKindDisplayName, starterSource } from "./use-workspace-documents";

describe("new workspace documents", () => {
  it("maps every diagram kind to its starter source", () => {
    expect(
      ["gantt", "sequence", "usecase", "class", "activity", "wbs"].map((kind) =>
        starterSource(kind as Parameters<typeof starterSource>[0]),
      ),
    ).toEqual([
      DEFAULT_SOURCE,
      DEFAULT_SEQUENCE_SOURCE,
      DEFAULT_USECASE_SOURCE,
      DEFAULT_CLASS_SOURCE,
      DEFAULT_ACTIVITY_SOURCE,
      DEFAULT_WBS_SOURCE,
    ]);
  });

  it("uses product-facing diagram names", () => {
    expect(diagramKindDisplayName("usecase")).toBe("Use Case");
    expect(diagramKindDisplayName("wbs")).toBe("WBS");
    expect(diagramKindDisplayName("gantt")).toBe("Gantt");
  });
});
