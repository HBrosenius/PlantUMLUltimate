import { describe, expect, it } from "vitest";
import { SaveCoordinator } from "./save-coordinator";

describe("SaveCoordinator", () => {
  it("serializes the same identity and preserves dirty state after concurrent edits", async () => {
    const coordinator = new SaveCoordinator();
    const events: string[] = [];
    const revision = 2;
    const first = coordinator.save(
      { documentId: "document", revision: 1, value: "old" },
      async (value) => {
        events.push(`encode:${value}`);
        return new TextEncoder().encode(value);
      },
      async () => {
        events.push("write:old");
      },
      () => revision,
    );
    const second = coordinator.save(
      { documentId: "document", revision: 2, value: "new" },
      async (value) => {
        events.push(`encode:${value}`);
        return new TextEncoder().encode(value);
      },
      async () => {
        events.push("write:new");
      },
      () => revision,
    );
    await expect(first).resolves.toMatchObject({ clean: false });
    await expect(second).resolves.toMatchObject({ clean: true });
    expect(events).toEqual(["encode:old", "write:old", "encode:new", "write:new"]);
  });
});
