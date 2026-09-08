import { describe, expect, it } from "vitest";
import { documentVersionDisplayName } from "./use-document-versions";

describe("document version display names", () => {
  it("prefers a user-provided label", () => {
    expect(documentVersionDisplayName({ label: "Before review", createdAt: "2026-09-08T12:00:00.000Z" })).toBe(
      "Before review",
    );
  });

  it("falls back to a localized creation time", () => {
    const createdAt = "2026-09-08T12:00:00.000Z";
    expect(documentVersionDisplayName({ createdAt })).toBe(new Date(createdAt).toLocaleString());
  });
});
